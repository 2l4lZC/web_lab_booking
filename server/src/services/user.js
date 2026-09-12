import bcrypt from 'bcryptjs'
import { query, queryOne } from '../db.js'
import { ApiError } from '../utils/response.js'
import { GRADE_LEVEL, describePermission } from './permission.js'

const ROLES = ['student', 'teacher', 'admin']
const GRADES = ['undergrad', 'master', 'phd']

export async function listUsers({ role, keyword, page = 1, pageSize = 20 } = {}) {
  const where = []
  const params = []

  if (role) {
    where.push('u.role = ?')
    params.push(role)
  }
  if (keyword) {
    where.push('(u.username LIKE ? OR u.real_name LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 200)
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit

  const list = await query(
    `SELECT u.id, u.username, u.real_name, u.role, u.grade, u.phone, u.college,
            u.status, u.created_at,
            u.advisor_id, adv.real_name AS advisor_name,
            (SELECT COUNT(*) FROM reservations r WHERE r.user_id = u.id) AS reservation_count,
            (SELECT COUNT(*) FROM violations v
              WHERE v.user_id = u.id
                AND v.created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)) AS violation_count
     FROM users u
     LEFT JOIN users adv ON adv.id = u.advisor_id
     ${whereSql}
     ORDER BY u.role, u.username
     LIMIT ${limit} OFFSET ${offset}`,
    params
  )

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
    params
  )

  // 把违规次数换算成当前实际受限情况，管理员一眼能看出谁被降权了
  const enriched = list.map((u) => ({
    ...u,
    permission: describePermission(u.violation_count, u.grade),
  }))

  return { list: enriched, total: Number(countRows[0].total), page: Number(page), pageSize: limit }
}

/** 教师下拉选项，用于给学生指派导师 */
export async function listTeachers() {
  return query(
    `SELECT id, username, real_name, college FROM users
     WHERE role = 'teacher' AND status = 1
     ORDER BY username`
  )
}

function normalizeUserPayload(payload, { requirePassword = false } = {}) {
  const username = String(payload.username ?? '').trim()
  if (!username) throw new ApiError('账号不能为空')
  if (!/^[A-Za-z0-9_]{3,50}$/.test(username)) {
    throw new ApiError('账号只能包含字母、数字、下划线，长度 3 ~ 50')
  }

  const realName = String(payload.real_name ?? '').trim()
  if (!realName) throw new ApiError('姓名不能为空')
  if (realName.length > 50) throw new ApiError('姓名不得超过 50 字')

  if (!ROLES.includes(payload.role)) throw new ApiError('角色不正确')

  let grade = payload.grade
  if (payload.role === 'student') {
    if (!GRADES.includes(grade)) throw new ApiError('学生必须指定学历层次')
  } else {
    grade = grade && GRADES.includes(grade) ? grade : 'phd'
  }

  const password = String(payload.password ?? '')
  if (requirePassword && password.length < 6) {
    throw new ApiError('初始密码不得少于 6 位')
  }

  return {
    username,
    real_name: realName,
    role: payload.role,
    grade,
    phone: String(payload.phone ?? '').trim().slice(0, 20) || null,
    college: String(payload.college ?? '').trim().slice(0, 100) || null,
    advisor_id: payload.advisor_id ? Number(payload.advisor_id) : null,
    status: Number(payload.status) === 0 ? 0 : 1,
    password,
  }
}

export async function createUser(payload) {
  const d = normalizeUserPayload(payload, { requirePassword: true })

  const dup = await queryOne('SELECT id FROM users WHERE username = ? LIMIT 1', [d.username])
  if (dup) throw new ApiError(`账号 ${d.username} 已存在`, 409)

  if (d.advisor_id) {
    const advisor = await queryOne(
      "SELECT id FROM users WHERE id = ? AND role = 'teacher' LIMIT 1",
      [d.advisor_id]
    )
    if (!advisor) throw new ApiError('指定的指导老师不存在', 404)
  }

  const hash = await bcrypt.hash(d.password, 10)
  const result = await query(
    `INSERT INTO users (username, password_hash, real_name, role, grade, phone, college, advisor_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.username, hash, d.real_name, d.role, d.grade, d.phone, d.college, d.advisor_id, d.status]
  )
  return queryOne(
    'SELECT id, username, real_name, role, grade, college, status FROM users WHERE id = ?',
    [result.insertId]
  )
}

export async function updateUser(id, payload) {
  const existing = await queryOne('SELECT id, role FROM users WHERE id = ? LIMIT 1', [id])
  if (!existing) throw new ApiError('用户不存在', 404)

  // 更新时不强制改密码；传了才重置
  const d = normalizeUserPayload(payload, { requirePassword: false })

  const dup = await queryOne('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1', [
    d.username,
    id,
  ])
  if (dup) throw new ApiError(`账号 ${d.username} 已被占用`, 409)

  if (d.advisor_id) {
    if (d.advisor_id === Number(id)) throw new ApiError('不能把自己设为指导老师')
    const advisor = await queryOne(
      "SELECT id FROM users WHERE id = ? AND role = 'teacher' LIMIT 1",
      [d.advisor_id]
    )
    if (!advisor) throw new ApiError('指定的指导老师不存在', 404)
  }

  await query(
    `UPDATE users
     SET username = ?, real_name = ?, role = ?, grade = ?, phone = ?,
         college = ?, advisor_id = ?, status = ?
     WHERE id = ?`,
    [d.username, d.real_name, d.role, d.grade, d.phone, d.college, d.advisor_id, d.status, id]
  )

  if (d.password) {
    const hash = await bcrypt.hash(d.password, 10)
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id])
  }

  return queryOne(
    `SELECT id, username, real_name, role, grade, phone, college, advisor_id, status
     FROM users WHERE id = ?`,
    [id]
  )
}

/** 用户详情 + 违规记录，用于判断是否该解除限制 */
export async function getUserDetail(id) {
  const user = await queryOne(
    `SELECT u.id, u.username, u.real_name, u.role, u.grade, u.phone, u.college,
            u.status, u.created_at, u.advisor_id, adv.real_name AS advisor_name
     FROM users u
     LEFT JOIN users adv ON adv.id = u.advisor_id
     WHERE u.id = ? LIMIT 1`,
    [id]
  )
  if (!user) throw new ApiError('用户不存在', 404)

  const violations = await query(
    `SELECT id, type, remark, created_at
     FROM violations
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [id]
  )

  return {
    ...user,
    violations,
    permission: describePermission(violations.length, user.grade),
  }
}

/** 撤销一条违规记录（申诉成立时用）—— 权限会自动恢复，因为权限是实时推导的 */
export async function revokeViolation(violationId) {
  const row = await queryOne('SELECT id, user_id FROM violations WHERE id = ? LIMIT 1', [violationId])
  if (!row) throw new ApiError('违规记录不存在', 404)

  await query('DELETE FROM violations WHERE id = ?', [violationId])
  return { id: Number(violationId), userId: row.user_id }
}

export { GRADE_LEVEL }
