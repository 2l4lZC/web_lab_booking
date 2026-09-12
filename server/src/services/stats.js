import { query } from '../db.js'
import { toMinutes } from './lab.js'

const MAX_DAYS = 365

/** 统计天数必须是数字且有上限，避免被拼进 SQL 的奇怪值 */
function normalizeDays(input, fallback = 30) {
  const n = Number(input)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), 1), MAX_DAYS)
}

function normalizeLimit(input, fallback = 10) {
  const n = Number(input)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), 1), 50)
}

/** 概览数字卡片 */
export async function getOverview({ days } = {}) {
  const d = normalizeDays(days)
  const rows = await query(`
    SELECT
      (SELECT COUNT(*) FROM reservations
        WHERE reserve_date >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY)
          AND reserve_date <= CURDATE())                       AS total_reservations,
      (SELECT COUNT(*) FROM reservations WHERE reserve_date = CURDATE()) AS today_reservations,
      (SELECT COUNT(*) FROM reservations WHERE status = 'pending')        AS pending_approvals,
      (SELECT COUNT(*) FROM reservations
        WHERE status = 'no_show'
          AND reserve_date >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY))     AS no_show_count,
      (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 1)  AS student_count,
      (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND status = 1)  AS teacher_count,
      (SELECT COUNT(*) FROM labs WHERE status = 1)                        AS lab_count,
      (SELECT COUNT(*) FROM devices)                                      AS device_count
  `)
  const r = rows[0]
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]))
}

/**
 * 实验室使用率。
 *
 * 口径：已预约时长 ÷ 开放时长（不乘容量）。
 * 如果乘上容量就变成「人时利用率」，数值会被压得很低、看不出问题，
 * 两种口径差别很大，这里明确选前者。
 */
export async function getLabUsage({ days } = {}) {
  const d = normalizeDays(days)

  const rows = await query(`
    SELECT
      l.id, l.name, l.type, l.capacity, l.open_time, l.close_time,
      COUNT(r.id)                                            AS reservation_count,
      IFNULL(SUM(r.people_count), 0)                         AS total_people,
      IFNULL(SUM(TIME_TO_SEC(TIMEDIFF(r.end_time, r.start_time)) / 3600), 0) AS booked_hours
    FROM labs l
    LEFT JOIN reservations r
           ON r.lab_id = l.id
          AND r.status IN ('approved', 'completed')
          AND r.reserve_date >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY)
          AND r.reserve_date <= CURDATE()
    WHERE l.status = 1
    GROUP BY l.id, l.name, l.type, l.capacity, l.open_time, l.close_time
    ORDER BY l.id
  `)

  return rows.map((row) => {
    const dailyHours = Math.max((toMinutes(row.close_time) - toMinutes(row.open_time)) / 60, 0)
    const capacityHours = dailyHours * d
    const bookedHours = Number(row.booked_hours)

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      capacity: row.capacity,
      reservationCount: Number(row.reservation_count),
      totalPeople: Number(row.total_people),
      bookedHours: Number(bookedHours.toFixed(1)),
      openHours: Number(capacityHours.toFixed(1)),
      usageRate: capacityHours > 0 ? Number(((bookedHours / capacityHours) * 100).toFixed(1)) : 0,
    }
  })
}

/** 热门时间段：按预约开始时间所在小时统计 */
export async function getHotSlots({ days } = {}) {
  const d = normalizeDays(days)

  const rows = await query(`
    SELECT HOUR(r.start_time)              AS hour,
           COUNT(*)                        AS reservation_count,
           IFNULL(SUM(r.people_count), 0)  AS total_people
    FROM reservations r
    WHERE r.status IN ('approved', 'completed')
      AND r.reserve_date >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY)
      AND r.reserve_date <= CURDATE()
    GROUP BY HOUR(r.start_time)
  `)

  // 用实际开放时间推导横轴范围，没有预约的小时补 0，图表才不会断档
  const rangeRows = await query(
    'SELECT MIN(HOUR(open_time)) AS min_h, MAX(HOUR(close_time)) AS max_h FROM labs WHERE status = 1'
  )
  const minH = Number(rangeRows[0]?.min_h ?? 8)
  const maxH = Number(rangeRows[0]?.max_h ?? 22)

  const map = new Map(rows.map((r) => [Number(r.hour), r]))
  const result = []
  for (let h = minH; h <= maxH; h++) {
    const hit = map.get(h)
    result.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      reservationCount: hit ? Number(hit.reservation_count) : 0,
      totalPeople: hit ? Number(hit.total_people) : 0,
    })
  }
  return result
}

/** 学生预约次数排行 */
export async function getTopStudents({ days, limit } = {}) {
  const d = normalizeDays(days)
  const n = normalizeLimit(limit)

  return query(`
    SELECT u.id, u.real_name, u.username, u.college, u.grade,
           COUNT(r.id)                                              AS reservation_count,
           SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END)  AS completed_count,
           SUM(CASE WHEN r.status = 'no_show'   THEN 1 ELSE 0 END)  AS no_show_count
    FROM users u
    JOIN reservations r ON r.user_id = u.id
    WHERE u.role = 'student'
      AND r.reserve_date >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY)
      AND r.reserve_date <= CURDATE()
    GROUP BY u.id, u.real_name, u.username, u.college, u.grade
    ORDER BY reservation_count DESC, u.username
    LIMIT ${n}
  `)
}

/** 违规排行榜 */
export async function getViolationRanking({ days, limit } = {}) {
  const d = normalizeDays(days)
  const n = normalizeLimit(limit)

  return query(`
    SELECT u.id, u.real_name, u.username, u.college,
           COUNT(v.id)                                                    AS violation_count,
           SUM(CASE WHEN v.type = 'no_show'         THEN 1 ELSE 0 END)    AS no_show_count,
           SUM(CASE WHEN v.type = 'frequent_cancel' THEN 1 ELSE 0 END)    AS frequent_cancel_count
    FROM users u
    JOIN violations v ON v.user_id = u.id
    WHERE v.created_at >= DATE_SUB(NOW(), INTERVAL ${d} DAY)
    GROUP BY u.id, u.real_name, u.username, u.college
    ORDER BY violation_count DESC, u.username
    LIMIT ${n}
  `)
}
