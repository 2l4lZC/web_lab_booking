import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { ok } from '../utils/response.js'
import {
  getHotSlots,
  getLabUsage,
  getOverview,
  getTopStudents,
  getViolationRanking,
} from '../services/stats.js'

const router = Router()

// 统计数据是管理决策依据，仅管理员可见
router.use(authenticate, requireRole('admin'))

/** GET /api/stats/overview?days=30 */
router.get('/overview', async (req, res, next) => {
  try {
    ok(res, await getOverview({ days: req.query.days }))
  } catch (err) {
    next(err)
  }
})

/** GET /api/stats/usage?days=30 —— 实验室使用率 */
router.get('/usage', async (req, res, next) => {
  try {
    ok(res, await getLabUsage({ days: req.query.days }))
  } catch (err) {
    next(err)
  }
})

/** GET /api/stats/hot-slots?days=30 —— 热门时间段 */
router.get('/hot-slots', async (req, res, next) => {
  try {
    ok(res, await getHotSlots({ days: req.query.days }))
  } catch (err) {
    next(err)
  }
})

/** GET /api/stats/students?days=30&limit=10 */
router.get('/students', async (req, res, next) => {
  try {
    ok(res, await getTopStudents({ days: req.query.days, limit: req.query.limit }))
  } catch (err) {
    next(err)
  }
})

/** GET /api/stats/violations?days=30&limit=10 */
router.get('/violations', async (req, res, next) => {
  try {
    ok(res, await getViolationRanking({ days: req.query.days, limit: req.query.limit }))
  } catch (err) {
    next(err)
  }
})

export default router
