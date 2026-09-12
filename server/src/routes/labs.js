import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { ok, ApiError } from '../utils/response.js'
import {
  createLab,
  deleteLab,
  getAvailableSlots,
  getLabDetail,
  listLabs,
  updateLab,
} from '../services/lab.js'

const router = Router()

// 实验室信息对所有已登录用户开放：学生要查、教师要查、管理员也要查
router.use(authenticate)

/** GET /api/labs?type=normal */
router.get('/', async (req, res, next) => {
  try {
    const labs = await listLabs({ type: req.query.type })
    ok(res, labs)
  } catch (err) {
    next(err)
  }
})

/** GET /api/labs/:id —— 详情含设备清单 */
router.get('/:id', async (req, res, next) => {
  try {
    const lab = await getLabDetail(Number(req.params.id))
    ok(res, lab)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/labs/:id/available-slots?date=YYYY-MM-DD&slot=60
 * 前端用它把满员时段置灰
 */
router.get('/:id/available-slots', async (req, res, next) => {
  try {
    const { date } = req.query
    if (!date) throw new ApiError('缺少参数 date')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ApiError('date 格式应为 YYYY-MM-DD')
    }

    const slotMinutes = Number(req.query.slot) || 60
    if (slotMinutes < 15 || slotMinutes > 240) {
      throw new ApiError('slot 取值应在 15 ~ 240 分钟之间')
    }

    const result = await getAvailableSlots(Number(req.params.id), date, slotMinutes)
    ok(res, result)
  } catch (err) {
    next(err)
  }
})

// ---------------- 以下为管理员操作 ----------------

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const lab = await createLab(req.body || {})
    ok(res, lab, `实验室「${lab.name}」已创建`)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const lab = await updateLab(Number(req.params.id), req.body || {})
    ok(res, lab, `实验室「${lab.name}」已更新`)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await deleteLab(Number(req.params.id))
    ok(res, result, `实验室「${result.name}」已删除`)
  } catch (err) {
    next(err)
  }
})

export default router
