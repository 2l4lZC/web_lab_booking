import request from './request'

/** 设备列表，可传 { lab_id } */
export const getDevices = (params) => request.get('/devices', { params })

export const createDevice = (data) => request.post('/devices', data)

export const updateDevice = (id, data) => request.put(`/devices/${id}`, data)

export const deleteDevice = (id) => request.delete(`/devices/${id}`)
