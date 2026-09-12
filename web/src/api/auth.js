import request from './request'

/** 登录，成功返回 { token, user } */
export const login = (data) => request.post('/auth/login', data)

/** 用 token 换取当前用户信息 */
export const getMe = () => request.get('/auth/me')
