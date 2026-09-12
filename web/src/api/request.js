import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

/**
 * 请求拦截：附带 JWT。
 * 这里直接从 localStorage 读，而不是 import useAuthStore ——
 * store 依赖 api 层，api 层再反向 import store 会形成循环依赖。
 */
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * 响应拦截：统一拆包 + 统一报错。
 * 后端固定返回 { code, message, data }，code !== 0 即为业务失败，
 * 在这里转成 reject，业务代码就只需关心成功分支。
 */
request.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return body.data
  },
  (error) => {
    const status = error.response?.status
    const message =
      error.response?.data?.message || error.message || '网络异常，请稍后重试'

    // token 失效：清干净本地状态并回登录页
    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login')
      }
    }

    return Promise.reject(new Error(message))
  }
)

export default request
