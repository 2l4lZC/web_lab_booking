import request from './request'

/** 概览数字：总预约、今日预约、待审批、未签到、各类数量 */
export const getOverview = (params) => request.get('/stats/overview', { params })

/** 各实验室使用率 */
export const getLabUsage = (params) => request.get('/stats/usage', { params })

/** 热门时间段分布 */
export const getHotSlots = (params) => request.get('/stats/hot-slots', { params })

/** 学生预约次数排行 */
export const getTopStudents = (params) => request.get('/stats/students', { params })

/** 违规排行榜 */
export const getViolationRanking = (params) => request.get('/stats/violations', { params })
