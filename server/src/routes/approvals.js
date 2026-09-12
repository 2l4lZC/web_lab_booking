import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { ok } from '../utils/response.js'
import { adminReview, listPendingApprovals, teacherReview } from '../services/approval.js'

const router = Router()

router.use(authenticate, requireRole('teacher', 'admin'))

/** GET /api/approvals/pending —— 待我审批 */
router.get('/pending', async (req, res, next) => {
  try {
    ok(res, await listPendingApprovals(req.user))
  } catch (err) {
    next(err)
  }
})

/** PUT /api/approvals/:id/teacher —— 教师审批，仅教师 */
router.put('/:id/teacher', requireRole('teacher'), async (req, res, next) => {
  try {
    const result = await teacherReview(Number(req.params.id), req.user.id, req.body || {})
    ok(res, result, result.message)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/approvals/:id/admin —— 管理员确认，仅管理员 */
router.put('/:id/admin', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await adminReview(Number(req.params.id), req.user.id, req.body || {})
    ok(res, result, result.message)
  } catch (err) {
    next(err)
  }
})

export default router
