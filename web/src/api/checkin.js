import request from './request'

/** 用 6 位签到码签到 */
export const doCheckin = (code) => request.post('/checkin', { code })

/** 取某条预约的签到信息（含签到码，用于渲染二维码） */
export const getCheckinInfo = (reservationId) => request.get(`/checkin/${reservationId}`)
