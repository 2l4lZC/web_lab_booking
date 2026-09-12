/**
 * 写入初始用户数据。
 * 密码必须经过 bcrypt，没法直接写进 schema.sql，所以单独用脚本处理。
 *
 * 执行：cd server && npm run seed
 */
import bcrypt from 'bcryptjs'
import { pool, query, queryOne } from '../db.js'

const DEFAULT_PASSWORD = '123456'

const staff = [
  { username: 'admin', realName: '系统管理员', role: 'admin',   grade: 'phd', college: '信息中心' },
  { username: 'T1001', realName: '王建国',     role: 'teacher', grade: 'phd', college: '计算机学院' },
  { username: 'T1002', realName: '李慧敏',     role: 'teacher', grade: 'phd', college: '自动化学院' },
]

const students = [
  { username: 'S2021001', realName: '张三', role: 'student', grade: 'undergrad', college: '计算机学院', advisor: 'T1001' },
  { username: 'S2021002', realName: '李四', role: 'student', grade: 'undergrad', college: '计算机学院', advisor: 'T1001' },
  { username: 'S2022001', realName: '王五', role: 'student', grade: 'master',    college: '自动化学院', advisor: 'T1002' },
  { username: 'S2022002', realName: '赵六', role: 'student', grade: 'master',    college: '自动化学院', advisor: 'T1002' },
]

/** 按 username 幂等写入：已存在则更新，不存在则插入，重复执行不会报错 */
async function upsertUser({ username, realName, role, grade, college, advisorId = null }) {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const existing = await queryOne('SELECT id FROM users WHERE username = ? LIMIT 1', [username])

  if (existing) {
    await query(
      `UPDATE users SET password_hash = ?, real_name = ?, role = ?, grade = ?, college = ?, advisor_id = ?
       WHERE id = ?`,
      [hash, realName, role, grade, college, advisorId, existing.id]
    )
    return existing.id
  }

  const result = await query(
    `INSERT INTO users (username, password_hash, real_name, role, grade, college, advisor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [username, hash, realName, role, grade, college, advisorId]
  )
  return result.insertId
}

async function main() {
  console.log('[SEED] 开始写入初始用户...\n')

  // 先写教师，学生要靠 username 找到自己的 advisor_id
  const advisorMap = {}
  for (const u of staff) {
    advisorMap[u.username] = await upsertUser(u)
    console.log(`  ✓ ${u.role.padEnd(8)} ${u.username.padEnd(10)} ${u.realName}`)
  }

  for (const s of students) {
    await upsertUser({ ...s, advisorId: advisorMap[s.advisor] ?? null })
    console.log(`  ✓ ${s.role.padEnd(8)} ${s.username.padEnd(10)} ${s.realName}   (导师 ${s.advisor})`)
  }

  const total = staff.length + students.length
  console.log(`\n[SEED] 完成，共 ${total} 个账号，初始密码统一为 ${DEFAULT_PASSWORD}`)
  await pool.end()
}

main().catch(async (err) => {
  console.error('\n[SEED] 失败：', err.message)
  await pool.end()
  process.exit(1)
})
