import request from './request'

/** 实验室列表，可传 { type } 筛选 */
export const getLabs = (params) => request.get('/labs', { params })

/** 实验室详情，含设备清单 */
export const getLabDetail = (id) => request.get(`/labs/${id}`)

/** 某日各时段剩余容量，参数 { date, slot } */
export const getAvailableSlots = (id, params) =>
  request.get(`/labs/${id}/available-slots`, { params })

// ---- 以下仅管理员可用 ----

export const createLab = (data) => request.post('/labs', data)

export const updateLab = (id, data) => request.put(`/labs/${id}`, data)

export const deleteLab = (id) => request.delete(`/labs/${id}`)
