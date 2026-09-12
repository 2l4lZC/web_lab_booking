/**
 * 未签到扫描。
 *
 * 每 10 分钟跑一次，处理两类「已经结束」的预约：
 *   已签到 → completed
 *   没签到 → no_show，并记一条违规
 *
 * 留 15 分钟宽限期，避免预约刚结束、学生还在路上就被判违规。
 */
import cron from 'node-cron'
import { withTransaction } from '../db.js'

const GRACE_MINUTES = 15
const SCAN_CRON = '*/10 * * * *'

export async function scanFinishedReservations() {
  return withTransaction(async (conn) => {
    const [doneResult] = await conn.query(
      `UPDATE reservations
       SET status = 'completed'
       WHERE status = 'approved'
         AND checkin_at IS NOT NULL
         AND CONCAT(reserve_date, ' ', end_time) < DATE_SUB(NOW(), INTERVAL ${GRACE_MINUTES} MINUTE)`
    )

    // 先查出来加锁，再逐条处理：违规记录要带上预约信息，只靠 UPDATE 拿不到
    const [missed] = await conn.query(
      `SELECT id, user_id, reserve_date, start_time, end_time
       FROM reservations
       WHERE status = 'approved'
         AND checkin_at IS NULL
         AND CONCAT(reserve_date, ' ', end_time) < DATE_SUB(NOW(), INTERVAL ${GRACE_MINUTES} MINUTE)
       FOR UPDATE`
    )

    for (const r of missed) {
      await conn.query(`UPDATE reservations SET status = 'no_show' WHERE id = ?`, [r.id])
      await conn.query(
        `INSERT INTO violations (user_id, reservation_id, type, remark)
         VALUES (?, ?, 'no_show', ?)`,
        [r.user_id, r.id, `预约未签到：${r.reserve_date} ${r.start_time}-${r.end_time}`]
      )
    }

    return { completed: doneResult.affectedRows, noShow: missed.length }
  })
}

export function startNoShowScanner() {
  cron.schedule(SCAN_CRON, async () => {
    try {
      const { completed, noShow } = await scanFinishedReservations()
      if (completed || noShow) {
        console.log(`[CRON] 已完成 ${completed} 条，未签到 ${noShow} 条`)
      }
    } catch (err) {
      console.error('[CRON] 未签到扫描失败:', err.message)
    }
  })

  console.log('[CRON] 未签到扫描已启动（每 10 分钟一次，宽限 15 分钟）')
}
