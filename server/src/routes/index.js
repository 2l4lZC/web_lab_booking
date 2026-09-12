import { Router } from 'express'
import authRoutes from './auth.js'
import labRoutes from './labs.js'
import reservationRoutes from './reservations.js'
import approvalRoutes from './approvals.js'
import checkinRoutes from './checkin.js'
import deviceRoutes from './devices.js'
import userRoutes from './users.js'
import statsRoutes from './stats.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/labs', labRoutes)
router.use('/reservations', reservationRoutes)
router.use('/approvals', approvalRoutes)
router.use('/checkin', checkinRoutes)
router.use('/devices', deviceRoutes)
router.use('/users', userRoutes)
router.use('/stats', statsRoutes)
// router.use('/approvals',    approvalRoutes)
// router.use('/devices',      deviceRoutes)
// router.use('/stats',        statsRoutes)
// router.use('/users',        userRoutes)

export default router
