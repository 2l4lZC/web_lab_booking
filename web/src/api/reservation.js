import request from './request'

/** 提交预约。冲突检测在后端事务里完成，这里只负责传参 */
export const createReservation = (data) => request.post('/reservations', data)

/** 预约列表，按角色自动收窄范围 */
export const getReservations = (params) => request.get('/reservations', { params })

export const getReservation = (id) => request.get(`/reservations/${id}`)

export const cancelReservation = (id, reason) =>
  request.put(`/reservations/${id}/cancel`, { reason })
