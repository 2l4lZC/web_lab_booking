import { ApiError } from '../utils/response.js'

/** 兜底 404 */
export function notFound(req, res, next) {
  next(new ApiError(`接口不存在: ${req.method} ${req.originalUrl}`, 404))
}

/** 统一错误出口（Express 靠 4 个参数识别错误中间件，next 不能省） */
export function errorHandler(err, req, res, next) {
  const status = err.httpStatus || 500

  if (status >= 500) {
    // 5xx 才打完整堆栈，4xx 属于正常业务分支，不必刷屏
    console.error('[ERROR]', err)
  }

  res.status(status).json({
    code: err.code ?? 1,
    // 5xx 不外泄内部细节，避免把 SQL 报错直接抛给前端
    message: status >= 500 ? '服务器内部错误' : err.message,
    data: null,
  })
}
