/**
 * 生成演示用的历史预约数据。
 *
 * 为什么需要：统计口径是「已发生的预约」（reserve_date <= 今天），
 * 刚建好的库里只有未来预约，使用率、热门时段、违规排行全是 0，
 * 演示时看不出效果。
 *
 * 生成规则：
 *   - 过去 30 天，每个实验室每天 0~3 条，互不重叠
 *   - 约 78% 已完成（有签到时间）、14% 未签到（并记违规）、8% 已取消
 *   - 跳过 TEST 开头的压测账号，避免和压测数据混在一起
 *
 * 执行：cd server && npm run seed:demo
 * 重复执行会叠加数据，想重来请先清空 reservations 和 violations 表。
 */
import { pool, query, withTransaction } from '../db.js'

const DAYS_BACK = 30
const NO_SHOW_RATE = 0.14
const CANCEL_RATE = 0.08

const PURPOSES = [
  '课程实验',
  '毕业设计调试',
  '学科竞赛备赛',
  '科研项目数据采集',
  '小组项目开发',
  '论文实验',
  '创新实践训练',
]

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const pad = (n) => String(n).padStart(2, '0')

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

const minLabel = (m) =>
  `${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`

/** 签到码有唯一索引，撞了就换一个重试 */
async function insertReservation(conn, row) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = String(randomInt(100000, 999999))
    try {
      const [result] = await conn.query(
        `INSERT INTO reservations
           (user_id, lab_id, reserve_date, start_time, end_time, people_count,
            purpose, status, teacher_status, admin_status, teacher_id, admin_id,
            checkin_code, checkin_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.userId, row.labId, row.date, row.start, row.end, row.people,
          row.purpose, row.status, row.teacherStatus, row.adminStatus,
          row.teacherId, row.adminId, code, row.checkinAt, row.createdAt,
        ]
      )
      return { id: result.insertId, code }
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') continue
      throw err
    }
  }
  throw new Error('签到码生成失败，重试次数用尽')
}

async function main() {
  // 压测账号有自己的数据，不参与演示数据生成
  const students = await query(
    `SELECT id FROM users
     WHERE role = 'student' AND status = 1 AND username NOT LIKE 'TEST%'`
  )
  if (students.length === 0) {
    throw new Error('没有可用的学生账号，请先执行 npm run seed')
  }

  const labs = await query(
    'SELECT id, name, open_time, close_time, capacity, min_duration, approval_level FROM labs WHERE status = 1'
  )
  const teachers = await query("SELECT id FROM users WHERE role = 'teacher' LIMIT 1")
  const admins = await query("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
  const teacherId = teachers[0]?.id ?? null
  const adminId = admins[0]?.id ?? null

  const today = new Date()
  let created = 0
  let completed = 0
  let noShow = 0
  let cancelled = 0

  await withTransaction(async (conn) => {
    for (let back = DAYS_BACK; back >= 1; back--) {
      const day = new Date(today)
      day.setDate(day.getDate() - back)
      const date = fmtDate(day)

      for (const lab of labs) {
        const openMin = toMin(lab.open_time)
        const closeMin = toMin(lab.close_time)
        const duration = lab.min_duration * 60

        // 当天该实验室的预约条数，以及一个游标保证时段互不重叠
        const count = randomInt(0, 3)
        let cursor = openMin

        for (let i = 0; i < count; i++) {
          const maxStart = closeMin - duration
          const start = cursor + randomInt(0, 2) * 30
          if (start > maxStart) break

          const end = start + duration
          cursor = end + 60 // 留出一小时间隔，天然不重叠

          const roll = Math.random()
          let status
          let checkinAt = null

          if (roll < NO_SHOW_RATE) {
            status = 'no_show'
          } else if (roll < NO_SHOW_RATE + CANCEL_RATE) {
            status = 'cancelled'
          } else {
            status = 'completed'
            // 签到时间落在开始前 5~20 分钟
            const checkinMin = start - randomInt(5, 20)
            checkinAt = `${date} ${minLabel(Math.max(checkinMin, 0))}`
          }

          const startLabel = minLabel(start)
          const endLabel = minLabel(end)
          const { id } = await insertReservation(conn, {
            userId: pick(students).id,
            labId: lab.id,
            date,
            start: startLabel,
            end: endLabel,
            people: randomInt(1, Math.max(1, Math.min(lab.capacity, 8))),
            purpose: pick(PURPOSES),
            status,
            // 历史数据都当作审批已走完
            teacherStatus: lab.approval_level >= 1 ? 'approved' : null,
            adminStatus: lab.approval_level >= 2 ? 'approved' : null,
            teacherId: lab.approval_level >= 1 ? teacherId : null,
            adminId: lab.approval_level >= 2 ? adminId : null,
            checkinAt,
            // 提前 1~5 天提交，比预约日期更早，看起来更真实
            createdAt: `${fmtDate(new Date(day.getTime() - randomInt(1, 5) * 86400000))} ${minLabel(randomInt(8 * 60, 20 * 60))}`,
          })

          created++
          if (status === 'completed') completed++
          if (status === 'cancelled') cancelled++

          if (status === 'no_show') {
            noShow++
            await conn.query(
              `INSERT INTO violations (user_id, reservation_id, type, remark, created_at)
               VALUES (?, ?, 'no_show', ?, ?)`,
              [
                (await conn.query('SELECT user_id FROM reservations WHERE id = ?', [id]))[0][0].user_id,
                id,
                `预约未签到：${date} ${startLabel.slice(0, 5)}-${endLabel.slice(0, 5)}`,
                `${date} ${endLabel}`,
              ]
            )
          }
        }
      }
    }
  })

  console.log('[DEMO] 历史预约数据生成完成\n')
  console.log(`  总记录      ${created} 条`)
  console.log(`  已完成      ${completed} 条`)
  console.log(`  未签到      ${noShow} 条（同时写入违规记录）`)
  console.log(`  已取消      ${cancelled} 条`)
  console.log(`  时间范围    过去 ${DAYS_BACK} 天`)

  const stats = await query(`
    SELECT
      (SELECT COUNT(*) FROM reservations WHERE status = 'completed') AS c,
      (SELECT COUNT(*) FROM violations) AS v
  `)
  console.log(`\n  库中现有：已完成 ${stats[0].c} 条，违规 ${stats[0].v} 条`)

  await pool.end()
}

main().catch(async (err) => {
  console.error('\n[DEMO] 生成失败：', err.message)
  await pool.end()
  process.exit(1)
})
