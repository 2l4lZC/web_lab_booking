import request from './request'

export const getUsers = (params) => request.get('/users', { params })

export const getTeachers = () => request.get('/users/teachers')

export const createUser = (data) => request.post('/users', data)

export const updateUser = (id, data) => request.put(`/users/${id}`, data)

export const getUserDetail = (id) => request.get(`/users/${id}`)

/** 撤销违规记录 —— 权限是实时推导的，撤销后自动恢复 */
export const revokeViolation = (id) => request.delete(`/users/violations/${id}`)
