/**
 * 统一响应格式：{ code, message, data }
 * code = 0 表示成功，非 0 表示业务失败
 */
export function ok(res, data = null, message = 'success') {
  res.json({ code: 0, message, data })
}

/** 业务异常：抛出后由 errorHandler 统一转成 HTTP 响应 */
export class ApiError extends Error {
  constructor(message, httpStatus = 400, code = 1) {
    super(message)
    this.name = 'ApiError'
    this.httpStatus = httpStatus
    this.code = code
  }
}
