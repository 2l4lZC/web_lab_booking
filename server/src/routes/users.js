import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { ok, ApiError } from '../utils/response.js'
import {
  createUser,
  getUserDetail,
  listTeachers,
  listUsers,
  revokeViolation,
  updateUser,
} from '../services/user.js'

const router = Router()

// 用户管理全部限管理员
router.use(authenticate, requireRole('admin'))

/** GET /api/users?role=student&keyword=张&page=1 */
router.get('/', async (req, res, next) => {
  try {
    const { role, keyword, page, pageSize } = req.query
    ok(res, await listUsers({ role, keyword, page, pageSize }))
  } catch (err) {
    next(err)
  }
})

/** GET /api/users/teachers —— 给学生指派导师时用。必须放在 /:id 之前 */
router.get('/teachers', async (req, res, next) => {
  try {
    ok(res, await listTeachers())
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const user = await createUser(req.body || {})
    ok(res, user, `用户 ${user.real_name} 已创建`)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/users/violations/:id —— 撤销违规，权限自动恢复 */
router.delete('/violations/:id', async (req, res, next) => {
  try {
    const result = await revokeViolation(Number(req.params.id))
    ok(res, result, '违规记录已撤销')
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    ok(res, await getUserDetail(Number(req.params.id)))
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    // 不允许管理员把自己停用或降级，避免把自己锁在系统外
    if (id === req.user.id) {
      const { role, status } = req.body || {}
      if (role && role !== 'admin') throw new ApiError('不能修改自己的角色')
      if (status !== undefined && Number(status) === 0) throw new ApiError('不能停用自己的账号')
    }
    const user = await updateUser(id, req.body || {})
    ok(res, user, '用户信息已更新')
  } catch (err) {
    next(err)
  }
})

export default router
