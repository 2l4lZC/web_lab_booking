import { ApiError } from '../utils/response.js'
import { queryOne } from '../db.js'

/**
 * 角色控制中间件。
 *   router.get('/', authenticate, requireRole('admin'), handler)
 * 必须放在 authenticate 之后。
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError('未登录', 401))
    if (!roles.includes(req.user.role)) {
      return next(new ApiError('无权访问该资源', 403))
    }
    next()
  }
}

/**
 * 学生登录后若要提交预约，需要先确认账号没有被禁用。
 * 单独抽出来是因为 JWT 是无状态的：签发之后管理员把账号禁用了，
 * 旧 token 依然能通过签名校验，必须回库查一次真实状态。
 */
export async function requireActiveUser(req, res, next) {
  try {
    const user = await queryOne('SELECT status FROM users WHERE id = ? LIMIT 1', [req.user.id])
    if (!user) return next(new ApiError('用户不存在', 404))
    if (user.status !== 1) return next(new ApiError('账号已被禁用，请联系管理员', 403))
    next()
  } catch (err) {
    next(err)
  }
}
