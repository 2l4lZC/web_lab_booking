/**
 * 审批服务 —— 两级串联状态机。
 *
 * 状态流转（以 approval_level = 2 为例）：
 *   pending/teacher=pending/admin=NULL
 *     → 教师通过 → pending/teacher=approved/admin=pending
 *     → 管理员通过 → approved/teacher=approved/admin=approved
 *   任一级驳回 → rejected，流程终止
 *
 * 关键点：admin_status 初始为 NULL 而不是 pending，
 * 表示「还没轮到管理员」。这样从数据上就能区分
 * 「等管理员处理」和「教师还没审」，不会误判。
 */
import { query, withTransaction } from '../db.js'
import { ApiError } from '../utils/response.js'

/** 待审批列表：教师看自己指导学生的，管理员看教师已通过待确认的 */
export async function listPendingApprovals(user) {
  if (user.role === 'teacher') {
    return query(
      `SELECT r.id, r.reserve_date, r.start_time, r.end_time, r.people_count,
              r.purpose, r.status, r.created_at,
              u.real_name AS user_name, u.username, u.grade AS user_grade,
              l.name AS lab_name, l.location AS lab_location,
              l.approval_level, l.capacity
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       JOIN labs  l ON l.id = r.lab_id
       WHERE r.status = 'pending'
         AND r.teacher_status = 'pending'
         AND u.advisor_id = ?
       ORDER BY r.reserve_date, r.start_time`,
      [user.id]
    )
  }

  // 管理员：只看教师已经放行、等自己确认的
  return query(
    `SELECT r.id, r.reserve_date, r.start_time, r.end_time, r.people_count,
            r.purpose, r.status, r.created_at,
            r.teacher_status, r.teacher_comment, r.teacher_at,
            u.real_name AS user_name, u.username, u.grade AS user_grade,
            l.name AS lab_name, l.location AS lab_location,
            l.approval_level, l.capacity,
            t.real_name AS teacher_name
     FROM reservations r
     JOIN users u ON u.id = r.user_id
     JOIN labs  l ON l.id = r.lab_id
     LEFT JOIN users t ON t.id = r.teacher_id
     WHERE r.status = 'pending'
       AND r.admin_status = 'pending'
     ORDER BY r.reserve_date, r.start_time`
  )
}

function assertAction(action) {
  if (!['approve', 'reject'].includes(action)) {
    throw new ApiError("action 只能是 'approve' 或 'reject'")
  }
}

/** 教师审批（第一级） */
export async function teacherReview(reservationId, teacherId, { action, comment }) {
  assertAction(action)

  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT r.id, r.status, r.teacher_status, r.user_id,
              l.name AS lab_name, l.approval_level, u.advisor_id
       FROM reservations r
       JOIN labs  l ON l.id = r.lab_id
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ? FOR UPDATE`,
      [reservationId]
    )
    const r = rows[0]

    if (!r) throw new ApiError('预约不存在', 404)
    if (r.status !== 'pending') throw new ApiError('该预约已不在待审批状态', 409)
    if (r.teacher_status !== 'pending') throw new ApiError('该预约的教师审批已完成', 409)
    if (r.advisor_id !== teacherId) {
      throw new ApiError('只能审批自己指导学生的预约', 403)
    }

    const remark = String(comment ?? '').trim().slice(0, 255) || null

    if (action === 'reject') {
      await conn.query(
        `UPDATE reservations
         SET teacher_status = 'rejected', teacher_id = ?, teacher_comment = ?,
             teacher_at = NOW(), status = 'rejected'
         WHERE id = ?`,
        [teacherId, remark, reservationId]
      )
      return { status: 'rejected', message: '已驳回该预约' }
    }

    // 通过：判断要不要继续走管理员这一级
    const needAdmin = r.approval_level >= 2
    await conn.query(
      `UPDATE reservations
       SET teacher_status = 'approved', teacher_id = ?, teacher_comment = ?,
           teacher_at = NOW(), status = ?, admin_status = ?
       WHERE id = ?`,
      [teacherId, remark, needAdmin ? 'pending' : 'approved', needAdmin ? 'pending' : null, reservationId]
    )

    return {
      status: needAdmin ? 'pending' : 'approved',
      message: needAdmin ? '已通过，等待管理员确认' : '已通过，预约生效',
    }
  })
}

/** 管理员确认（第二级） */
export async function adminReview(reservationId, adminId, { action, comment }) {
  assertAction(action)

  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, status, admin_status, teacher_status
       FROM reservations WHERE id = ? FOR UPDATE`,
      [reservationId]
    )
    const r = rows[0]

    if (!r) throw new ApiError('预约不存在', 404)
    if (r.status !== 'pending') throw new ApiError('该预约已不在待审批状态', 409)
    if (r.teacher_status !== 'approved') {
      throw new ApiError('该预约尚未通过指导教师审核', 409)
    }
    if (r.admin_status !== 'pending') throw new ApiError('该预约的管理员确认已完成', 409)

    const remark = String(comment ?? '').trim().slice(0, 255) || null
    const approved = action === 'approve'

    await conn.query(
      `UPDATE reservations
       SET admin_status = ?, admin_id = ?, admin_comment = ?, admin_at = NOW(),
           status = ?
       WHERE id = ?`,
      [approved ? 'approved' : 'rejected', adminId, remark, approved ? 'approved' : 'rejected', reservationId]
    )

    return {
      status: approved ? 'approved' : 'rejected',
      message: approved ? '已确认，预约生效' : '已驳回该预约',
    }
  })
}
