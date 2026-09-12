import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { ApiError } from '../utils/response.js'

/**
 * 校验 Authorization: Bearer <token>
 * 通过后把 payload 挂到 req.user
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    return next(new ApiError('未登录或登录已过期', 401))
  }

  const token = header.slice(7)
  try {
    req.user = jwt.verify(token, config.jwt.secret)
    next()
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? '登录已过期，请重新登录' : '登录凭证无效'
    next(new ApiError(msg, 401))
  }
}
