import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { ApiError, ok } from '../utils/response.js'
import { createReservation } from '../services/reservation.js'
import { query, queryOne, withTransaction } from '../db.js'

const router = Router()

router.use(authenticate)

/** 24 小时内取消达到这个次数就记一次违规 */
const FREQUENT_CANCEL_THRESHOLD = 3

/**
 * POST /api/reservations
 * 学生提交预约。冲突检测在 service 层的事务里完成。
 */
router.post('/', requireRole('student'), async (req, res, next) => {
  try {
    // message 提到顶层，data 里不再重复带一份
    const { message, ...data } = await createReservation(req.user.id, req.body || {})
    ok(res, data, message)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/reservations
 * 按角色自动收窄可见范围：
 *   学生   → 只看自己的
 *   教师   → 自己指导的学生 + 指派给自己的
 *   管理员 → 全部
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, lab_id: labId, date, page = 1, pageSize = 20 } = req.query

    const where = []
    const params = []

    if (req.user.role === 'student') {
      where.push('r.user_id = ?')
      params.push(req.user.id)
    } else if (req.user.role === 'teacher') {
      where.push('(u.advisor_id = ? OR r.teacher_id = ?)')
      params.push(req.user.id, req.user.id)
    }

    if (status) {
      where.push('r.status = ?')
      params.push(status)
    }
    if (labId) {
      where.push('r.lab_id = ?')
      params.push(Number(labId))
    }
    if (date) {
      where.push('r.reserve_date = ?')
      params.push(date)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100)
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit

    const rows = await query(
      `SELECT r.id, r.reserve_date, r.start_time, r.end_time, r.people_count,
              r.purpose, r.status, r.teacher_status, r.admin_status,
              r.teacher_comment, r.admin_comment, r.checkin_code, r.checkin_at,
              r.created_at,
              r.user_id, u.real_name AS user_name, u.username,
              r.lab_id, l.name AS lab_name, l.location AS lab_location,
              l.type AS lab_type,
              t.real_name AS teacher_name
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       JOIN labs  l ON l.id = r.lab_id
       LEFT JOIN users t ON t.id = r.teacher_id
       ${whereSql}
       ORDER BY r.reserve_date DESC, r.start_time DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    )

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       ${whereSql}`,
      params
    )

    ok(res, { list: rows, total, page: Number(page), pageSize: limit })
  } catch (err) {
    next(err)
  }
})

/** GET /api/reservations/:id —— 详情，同时做越权检查 */
router.get('/:id', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT r.*, u.real_name AS user_name, u.username, u.grade,
              l.name AS lab_name, l.location AS lab_location
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       JOIN labs  l ON l.id = r.lab_id
       WHERE r.id = ? LIMIT 1`,
      [Number(req.params.id)]
    )
    if (!row) throw new ApiError('预约不存在', 404)

    // 学生只能看自己的；教师和管理员可看（教师范围已在列表接口收窄）
    if (req.user.role === 'student' && row.user_id !== req.user.id) {
      throw new ApiError('无权查看该预约', 403)
    }

    ok(res, row)
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /api/reservations/:id/cancel
 * 学生取消自己的预约。已开始的不能取消。
 */
router.put('/:id/cancel', requireRole('student'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const reason = String(req.body?.reason ?? '').trim().slice(0, 255)

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT r.id, r.user_id, r.status, r.reserve_date, r.start_time,
                CONCAT(r.reserve_date, ' ', r.start_time) < NOW() AS started
         FROM reservations r WHERE r.id = ? FOR UPDATE`,
        [id]
      )
      const row = rows[0]
      if (!row) throw new ApiError('预约不存在', 404)
      if (row.user_id !== req.user.id) throw new ApiError('无权取消他人的预约', 403)
      if (!['pending', 'approved'].includes(row.status)) {
        throw new ApiError(`当前状态（${row.status}）不可取消`)
      }
      if (row.started) throw new ApiError('预约已开始，无法取消')

      await conn.query(
        `UPDATE reservations SET status = 'cancelled', cancel_reason = ? WHERE id = ?`,
        [reason || null, id]
      )

      // 频繁取消：24 小时内取消满 3 次记一条违规。
      // 用 reservation_id 去重，避免同一次取消被重复记录。
      const [[{ cancelCount }]] = await conn.query(
        `SELECT COUNT(*) AS cancelCount FROM reservations
         WHERE user_id = ? AND status = 'cancelled'
           AND updated_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [req.user.id]
      )

      let violationAdded = false
      if (cancelCount >= FREQUENT_CANCEL_THRESHOLD) {
        const [exist] = await conn.query(
          `SELECT id FROM violations
           WHERE reservation_id = ? AND type = 'frequent_cancel' LIMIT 1`,
          [id]
        )
        if (exist.length === 0) {
          await conn.query(
            `INSERT INTO violations (user_id, reservation_id, type, remark)
             VALUES (?, ?, 'frequent_cancel', ?)`,
            [req.user.id, id, `24 小时内取消 ${cancelCount} 次预约`]
          )
          violationAdded = true
        }
      }

      return { cancelCount, violationAdded }
    })

    ok(
      res,
      result,
      result.violationAdded
        ? `已取消。注意：24 小时内取消 ${result.cancelCount} 次，已记一次违规`
        : '已取消预约'
    )
  } catch (err) {
    next(err)
  }
})

export default router
