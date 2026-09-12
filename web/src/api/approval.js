import request from './request'

/** 待我审批列表（教师看到自己学生的，管理员看到待确认的） */
export const getPendingApprovals = () => request.get('/approvals/pending')

/** 教师审批 */
export const teacherReview = (id, action, comment) =>
  request.put(`/approvals/${id}/teacher`, { action, comment })

/** 管理员确认 */
export const adminReview = (id, action, comment) =>
  request.put(`/approvals/${id}/admin`, { action, comment })
