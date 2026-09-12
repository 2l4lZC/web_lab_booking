import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { queryOne } from '../db.js'
import { config } from '../config.js'
import { ApiError, ok } from '../utils/response.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

/** POST /api/auth/login */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) throw new ApiError('请输入账号和密码')

    const user = await queryOne(
      `SELECT id, username, password_hash, real_name, role, grade, status
       FROM users WHERE username = ? LIMIT 1`,
      [username]
    )

    // 账号不存在和密码错误返回同一句提示，避免被用来枚举学号
    if (!user) throw new ApiError('账号或密码错误', 401)
    if (user.status !== 1) throw new ApiError('账号已被禁用，请联系管理员', 403)

    const matched = await bcrypt.compare(password, user.password_hash)
    if (!matched) throw new ApiError('账号或密码错误', 401)

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.real_name,
    }
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn })

    ok(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        role: user.role,
        grade: user.grade,
      },
    }, '登录成功')
  } catch (err) {
    next(err)
  }
})

/** GET /api/auth/me —— 前端刷新页面后用它恢复登录态 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await queryOne(
      `SELECT id, username, real_name, role, grade, phone, college, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    )
    if (!user) throw new ApiError('用户不存在', 404)
    ok(res, user)
  } catch (err) {
    next(err)
  }
})

export default router
