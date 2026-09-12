import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { ok } from '../utils/response.js'
import { createDevice, deleteDevice, listDevices, updateDevice } from '../services/device.js'

const router = Router()

router.use(authenticate)

/** GET /api/devices?lab_id=1 —— 读开放给所有登录用户（预约时要选设备） */
router.get('/', async (req, res, next) => {
  try {
    ok(res, await listDevices({ labId: req.query.lab_id }))
  } catch (err) {
    next(err)
  }
})

// 以下写操作仅管理员
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    ok(res, await createDevice(req.body || {}), '设备已创建')
  } catch (err) {
    next(err)
  }
})

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    ok(res, await updateDevice(Number(req.params.id), req.body || {}), '设备已更新')
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await deleteDevice(Number(req.params.id))
    ok(res, result, `设备「${result.name}」已删除`)
  } catch (err) {
    next(err)
  }
})

export default router
