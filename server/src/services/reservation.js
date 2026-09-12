/**
 * 预约服务 —— 整个系统最核心的部分。
 *
 * 所有校验都在事务内、且是在锁住实验室行之后进行，
 * 这样「查容量 → 判断 → 插入」对同一实验室而言是串行的，
 * 并发提交不会双双通过。
 */
import { randomInt } from 'node:crypto'
import { query, queryOne, withTransaction } from '../db.js'
import { ApiError } from '../utils/response.js'
import { toMinutes, toTimeLabel } from './lab.js'
// 降权规则与用户管理页共用同一份常量，避免两边各写一套导致不一致
import {
  FREEZE_DAYS,
  GRADE_LEVEL,
  RESTRICTED_ADVANCE_DAYS,
  VIOLATION_FREEZE_AT,
  VIOLATION_RESTRICT_AT,
  VIOLATION_WINDOW_DAYS,
} from './permission.js'

// ---------------------------------------------------------------
// 参数规范化
// ---------------------------------------------------------------

function normalizeTime(value, field) {
  const s = String(value ?? '').trim()
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  throw new ApiError(`${field} 格式应为 HH:MM`)
}

function normalizeDate(value) {
  const s = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError('日期格式应为 YYYY-MM-DD')
  return s
}

function generateCheckinCode() {
  return String(randomInt(100000, 1000000))
}

// ---------------------------------------------------------------
// 各项业务规则校验
// ---------------------------------------------------------------

/** 必须在开放时间内，且开始早于结束 */
function assertWithinOpenHours(lab, start, end) {
  const openMin = toMinutes(lab.open_time)
  const closeMin = toMinutes(lab.close_time)
  const s = toMinutes(start)
  const e = toMinutes(end)

  if (e <= s) throw new ApiError('结束时间必须晚于开始时间')
  if (s < openMin || e > closeMin) {
    throw new ApiError(
      `${lab.name} 开放时间为 ${toTimeLabel(openMin)}-${toTimeLabel(closeMin)}，请在此范围内预约`
    )
  }
}

/** 满足实验室的最短预约时长 */
function assertMinDuration(lab, start, end) {
  const minutes = toMinutes(end) - toMinutes(start)
  if (minutes < lab.min_duration * 60) {
    throw new ApiError(`${lab.name} 最短预约时长为 ${lab.min_duration} 小时`)
  }
}

/** 预约者学历达到实验室要求 */
function assertGrade(user, lab) {
  const need = GRADE_LEVEL[lab.min_grade] ?? 1
  const mine = GRADE_LEVEL[user.grade] ?? 1
  if (mine < need) {
    const labels = { undergrad: '本科生', master: '研究生', phd: '博士生' }
    throw new ApiError(`${lab.name} 仅向${labels[lab.min_grade]}及以上开放`)
  }
}

/**
 * 违规降权检查。
 *
 * 刻意不把「能提前几天」存成用户字段 —— 那样违规记录一旦被撤销，
 * 权限就回不来了。这里每次实时按违规次数推导。
 */
async function resolveReservationPermission(conn, userId) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at
     FROM violations
     WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ${VIOLATION_WINDOW_DAYS} DAY)`,
    [userId]
  )
  const { cnt, last_at: lastAt } = rows[0]

  if (cnt >= VIOLATION_FREEZE_AT && lastAt) {
    const [freezeRows] = await conn.query(
      `SELECT DATE_ADD(?, INTERVAL ${FREEZE_DAYS} DAY) > NOW() AS frozen,
              DATE_FORMAT(DATE_ADD(?, INTERVAL ${FREEZE_DAYS} DAY), '%Y-%m-%d') AS until`,
      [lastAt, lastAt]
    )
    if (freezeRows[0].frozen) {
      throw new ApiError(
        `近 90 天内违规 ${cnt} 次，预约权限已被冻结至 ${freezeRows[0].until}`,
        403
      )
    }
  }

  return {
    violationCount: cnt,
    // 违规 3 次及以上：最多只能提前 1 天
    maxAdvanceDays: cnt >= VIOLATION_RESTRICT_AT ? RESTRICTED_ADVANCE_DAYS : null,
    restricted: cnt >= VIOLATION_RESTRICT_AT,
  }
}

/** 日期合法性 + 不能预约过去 + 满足提前天数限制 */
async function assertDateAllowed(conn, reserveDate, effectiveAdvanceDays, labName) {
  const [rows] = await conn.query(
    'SELECT DATEDIFF(?, CURDATE()) AS day_diff',
    [reserveDate]
  )
  const diff = rows[0].day_diff

  if (diff < 0) throw new ApiError('不能预约已过去的日期')
  if (diff > effectiveAdvanceDays) {
    throw new ApiError(
      `${labName} 最多可提前 ${effectiveAdvanceDays} 天预约，该日期超出范围`
    )
  }
  return diff
}

/** 所选设备必须属于本实验室、状态可用、且满足学历要求 */
async function assertDevicesUsable(conn, deviceIds, labId, user) {
  if (!deviceIds || deviceIds.length === 0) return []

  const ids = [...new Set(deviceIds.map(Number))].filter(Number.isInteger)
  if (ids.length === 0) throw new ApiError('设备参数不正确')

  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await conn.query(
    `SELECT id, name, lab_id, status, min_grade FROM devices
     WHERE id IN (${placeholders})`,
    ids
  )

  if (rows.length !== ids.length) {
    throw new ApiError('所选设备中有不存在的记录')
  }

  const labels = { undergrad: '本科生', master: '研究生', phd: '博士生' }
  const myLevel = GRADE_LEVEL[user.grade] ?? 1

  for (const d of rows) {
    if (d.lab_id !== labId) {
      throw new ApiError(`设备「${d.name}」不属于该实验室`)
    }
    if (d.status !== 'available') {
      throw new ApiError(`设备「${d.name}」当前不可用（状态：${d.status}）`)
    }
    if (myLevel < (GRADE_LEVEL[d.min_grade] ?? 1)) {
      throw new ApiError(`设备「${d.name}」仅限${labels[d.min_grade]}及以上使用`)
    }
  }

  return rows.map((d) => d.id)
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------

export async function createReservation(userId, payload) {
  const labId = Number(payload.lab_id)
  if (!Number.isInteger(labId)) throw new ApiError('请选择实验室')

  const reserveDate = normalizeDate(payload.reserve_date)
  const startTime = normalizeTime(payload.start_time, '开始时间')
  const endTime = normalizeTime(payload.end_time, '结束时间')

  const peopleCount = Number(payload.people_count)
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    throw new ApiError('使用人数必须是大于 0 的整数')
  }
  if (peopleCount > 100) throw new ApiError('使用人数不合理')

  const purpose = String(payload.purpose ?? '').trim()
  if (purpose.length > 255) throw new ApiError('使用目的不得超过 255 字')

  const deviceIds = Array.isArray(payload.device_ids) ? payload.device_ids : []

  const user = await queryOne(
    'SELECT id, real_name, role, grade, status FROM users WHERE id = ? LIMIT 1',
    [userId]
  )
  if (!user) throw new ApiError('用户不存在', 404)
  if (user.status !== 1) throw new ApiError('账号已被禁用', 403)

  const reservation = await withTransaction(async (conn) => {
    // ① 锁住实验室行 —— 这是整个并发安全的支点。
    //    同一实验室的预约请求会在这里排队，不同实验室互不影响。
    //    不能改成「锁查出来的预约行」：首次预约时查询结果为空，等于没锁。
    const [labRows] = await conn.query(
      `SELECT id, name, capacity, open_time, close_time, min_duration,
              advance_days, approval_level, min_grade
       FROM labs WHERE id = ? AND status = 1 FOR UPDATE`,
      [labId]
    )
    const lab = labRows[0]
    if (!lab) throw new ApiError('实验室不存在或已停用', 404)

    // ② 规则校验（用实验室自己的配置，代码里不写死阈值）
    assertWithinOpenHours(lab, startTime, endTime)
    assertMinDuration(lab, startTime, endTime)
    assertGrade(user, lab)

    const permission = await resolveReservationPermission(conn, user.id)
    const effectiveAdvanceDays = Math.min(
      lab.advance_days,
      permission.maxAdvanceDays ?? lab.advance_days
    )
    await assertDateAllowed(conn, reserveDate, effectiveAdvanceDays, lab.name)

    // ③ 同一人不该在同一时段重复占位
    const [dupRows] = await conn.query(
      `SELECT id FROM reservations
       WHERE user_id = ? AND lab_id = ? AND reserve_date = ?
         AND status IN ('pending','approved')
         AND start_time < ? AND end_time > ?
       LIMIT 1`,
      [user.id, labId, reserveDate, endTime, startTime]
    )
    if (dupRows.length > 0) {
      throw new ApiError('您在该时段已有预约，请勿重复提交', 409)
    }

    // ④ ⭐ 冲突检测：把所有与该时段重叠的预约人数累加。
    //    判据是开区间 start < newEnd AND end > newStart ——
    //    恰好首尾相接（12:00 结束 vs 12:00 开始）不算冲突。
    const [sumRows] = await conn.query(
      `SELECT IFNULL(SUM(people_count), 0) AS used
       FROM reservations
       WHERE lab_id = ? AND reserve_date = ?
         AND status IN ('pending','approved')
         AND start_time < ? AND end_time > ?`,
      [labId, reserveDate, endTime, startTime]
    )
    const used = Number(sumRows[0].used)

    if (used + peopleCount > lab.capacity) {
      throw new ApiError(
        `该时段容量不足：已占用 ${used} 人，剩余 ${Math.max(0, lab.capacity - used)} 人，` +
          `本次需要 ${peopleCount} 人`,
        409
      )
    }

    // ⑤ 设备校验
    const validDeviceIds = await assertDevicesUsable(conn, deviceIds, labId, user)

    // ⑥ 按审批级别决定初始状态
    const needTeacher = lab.approval_level >= 1
    const needAdmin = lab.approval_level >= 2
    const status = lab.approval_level === 0 ? 'approved' : 'pending'

    // 签到码带唯一索引。6 位数字空间 90 万，碰撞概率低但确实存在，
    // 撞了就换一个重试，而不是把数据库错误直接抛给用户
    let insertedId = null
    let checkinCode = null
    for (let attempt = 0; attempt < 5; attempt++) {
      checkinCode = generateCheckinCode()
      try {
        const [result] = await conn.query(
          `INSERT INTO reservations
             (user_id, lab_id, reserve_date, start_time, end_time, people_count,
              purpose, device_ids, status, teacher_status, admin_status, checkin_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
          [
            user.id,
            labId,
            reserveDate,
            startTime,
            endTime,
            peopleCount,
            purpose || null,
            validDeviceIds.length ? JSON.stringify(validDeviceIds) : null,
            status,
            needTeacher ? 'pending' : null,
            checkinCode,
          ]
        )
        insertedId = result.insertId
        break
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' && attempt < 4) continue
        throw err
      }
    }
    if (!insertedId) throw new ApiError('签到码生成失败，请稍后重试', 500)

    return { id: insertedId, status, needTeacher, needAdmin, checkinCode }
  })

  return {
    id: reservation.id,
    status: reservation.status,
    approvalLevel: reservation.needTeacher ? (reservation.needAdmin ? 2 : 1) : 0,
    // 无需审批的实验室当场生效，签到码直接可用；
    // 需审批的要等通过后才展示，避免提前泄露
    checkinCode: reservation.status === 'approved' ? reservation.checkinCode : null,
    message:
      reservation.status === 'approved'
        ? '预约成功'
        : reservation.needAdmin
          ? '已提交，等待指导教师审核与管理员确认'
          : '已提交，等待指导教师审核',
  }
}
