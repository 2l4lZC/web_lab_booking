/**
 * 签到服务。
 *
 * 签到窗口刻意不做成「预约全程都能签」：
 * 太早签到没有意义（人还没到），太晚签到说明已经缺席。
 * 窗口 = 开始前 30 分钟 ~ 结束时间。
 */
import { withTransaction } from '../db.js'
import { ApiError } from '../utils/response.js'

/** 允许提前多久签到（分钟） */
const EARLY_MINUTES = 30

export async function checkinByCode(userId, code) {
  const clean = String(code ?? '').trim()
  if (!/^\d{6}$/.test(clean)) {
    throw new ApiError('签到码应为 6 位数字')
  }

  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT r.id, r.user_id, r.status, r.checkin_at,
              r.reserve_date, r.start_time, r.end_time,
              l.name AS lab_name,
              TIMESTAMPDIFF(MINUTE, NOW(), CONCAT(r.reserve_date, ' ', r.start_time)) AS minutes_to_start,
              NOW() > CONCAT(r.reserve_date, ' ', r.end_time) AS is_over
       FROM reservations r
       JOIN labs l ON l.id = r.lab_id
       WHERE r.checkin_code = ? AND r.status = 'approved'
       LIMIT 1
       FOR UPDATE`,
      [clean]
    )

    const r = rows[0]
    if (!r) throw new ApiError('签到码无效，或对应预约尚未通过审批', 404)
    if (r.user_id !== userId) throw new ApiError('这不是您的预约', 403)
    if (r.checkin_at) throw new ApiError('该预约已签到，无需重复签到', 409)
    if (r.is_over) throw new ApiError('预约时间已结束，无法签到', 409)
    if (r.minutes_to_start > EARLY_MINUTES) {
      throw new ApiError(`签到尚未开放，请在开始前 ${EARLY_MINUTES} 分钟内签到`, 409)
    }

    await conn.query('UPDATE reservations SET checkin_at = NOW() WHERE id = ?', [r.id])

    return {
      id: r.id,
      labName: r.lab_name,
      reserveDate: r.reserve_date,
      startTime: r.start_time,
      endTime: r.end_time,
    }
  })
}

/** 学生查看自己某条预约的签到信息（用于展示签到码和二维码） */
export async function getCheckinInfo(userId, reservationId) {
  const { queryOne } = await import('../db.js')
  const row = await queryOne(
    `SELECT r.id, r.user_id, r.status, r.checkin_code, r.checkin_at,
            r.reserve_date, r.start_time, r.end_time, l.name AS lab_name
     FROM reservations r
     JOIN labs l ON l.id = r.lab_id
     WHERE r.id = ? LIMIT 1`,
    [reservationId]
  )

  if (!row) throw new ApiError('预约不存在', 404)
  if (row.user_id !== userId) throw new ApiError('无权查看该预约', 403)
  if (row.status !== 'approved') {
    throw new ApiError('只有已通过审批的预约才有签到码', 409)
  }

  return row
}
