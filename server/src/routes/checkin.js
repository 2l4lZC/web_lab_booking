import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { ok } from '../utils/response.js'
import { checkinByCode, getCheckinInfo } from '../services/checkin.js'

const router = Router()

router.use(authenticate, requireRole('student'))

/** POST /api/checkin —— 用 6 位签到码签到 */
router.post('/', async (req, res, next) => {
  try {
    const result = await checkinByCode(req.user.id, req.body?.code)
    ok(res, result, `签到成功，欢迎使用${result.labName}`)
  } catch (err) {
    next(err)
  }
})

/** GET /api/checkin/:reservationId —— 取签到码（前端据此渲染二维码） */
router.get('/:reservationId', async (req, res, next) => {
  try {
    ok(res, await getCheckinInfo(req.user.id, Number(req.params.reservationId)))
  } catch (err) {
    next(err)
  }
})

export default router
