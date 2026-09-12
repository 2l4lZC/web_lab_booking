import { query, queryOne } from '../db.js'
import { ApiError } from '../utils/response.js'

/** 实验室列表（含设备数量），学生和教师都可见 */
export async function listLabs({ type } = {}) {
  const params = []
  let sql = `
    SELECT l.id, l.name, l.type, l.location, l.open_time, l.close_time,
           l.capacity, l.advance_days, l.min_duration, l.approval_level,
           l.min_grade, l.description, l.status,
           (SELECT COUNT(*) FROM devices d WHERE d.lab_id = l.id) AS device_count
    FROM labs l
    WHERE l.status = 1`

  if (type) {
    sql += ' AND l.type = ?'
    params.push(type)
  }
  sql += ' ORDER BY l.id'

  return query(sql, params)
}

/** 实验室详情 + 设备清单 */
export async function getLabDetail(labId) {
  const lab = await queryOne(
    `SELECT id, name, type, location, open_time, close_time, capacity,
            advance_days, min_duration, approval_level, min_grade,
            description, status
     FROM labs WHERE id = ? LIMIT 1`,
    [labId]
  )
  if (!lab) throw new ApiError('实验室不存在', 404)

  const devices = await query(
    `SELECT id, name, model, status, min_grade, need_approval, requirement
     FROM devices WHERE lab_id = ? ORDER BY id`,
    [labId]
  )

  return { ...lab, devices }
}

/** 把 'HH:MM:SS' 转成当天的分钟数，方便做区间运算 */
export function toMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number)
  return h * 60 + m
}

/** 分钟数转回 'HH:MM'，用于生成时段标签 */
export function toTimeLabel(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * 查询某实验室某天各时段的剩余容量。
 *
 * 这个接口存在的意义是体验：手机端最忌讳「填完整个表单点提交，
 * 才告诉你时段已被占」。提前把每个时段的剩余量算出来，前端直接
 * 把满员时段置灰，用户根本点不到冲突的选项 —— 冲突检测退居兜底，
 * 而不是第一道防线。
 *
 * @param {number} labId
 * @param {string} date  YYYY-MM-DD
 * @param {number} slotMinutes 时段粒度，默认 60 分钟
 */
export async function getAvailableSlots(labId, date, slotMinutes = 60) {
  const lab = await queryOne(
    `SELECT id, name, open_time, close_time, capacity FROM labs
     WHERE id = ? AND status = 1 LIMIT 1`,
    [labId]
  )
  if (!lab) throw new ApiError('实验室不存在或已停用', 404)

  // 当天所有会占用容量的预约（pending 也占位，否则审批期间会被抢光）
  const rows = await query(
    `SELECT start_time, end_time, people_count
     FROM reservations
     WHERE lab_id = ? AND reserve_date = ?
       AND status IN ('pending', 'approved')`,
    [labId, date]
  )

  const openMin = toMinutes(lab.open_time)
  const closeMin = toMinutes(lab.close_time)

  const bookings = rows.map((r) => ({
    start: toMinutes(r.start_time),
    end: toMinutes(r.end_time),
    people: r.people_count,
  }))

  const slots = []
  for (let start = openMin; start + slotMinutes <= closeMin; start += slotMinutes) {
    const end = start + slotMinutes

    // 与该时段有重叠的预约人数累加 —— 判据是开区间，
    // 恰好首尾相接（12:00 结束 vs 12:00 开始）不算冲突
    const used = bookings
      .filter((b) => b.start < end && b.end > start)
      .reduce((sum, b) => sum + b.people, 0)

    slots.push({
      start: toTimeLabel(start),
      end: toTimeLabel(end),
      used,
      remaining: Math.max(0, lab.capacity - used),
      available: used < lab.capacity,
    })
  }

  return {
    lab: {
      id: lab.id,
      name: lab.name,
      openTime: lab.open_time,
      closeTime: lab.close_time,
      capacity: lab.capacity,
    },
    date,
    slotMinutes,
    slots,
  }
}

// ---------------------------------------------------------------
// 管理端：实验室增删改
// ---------------------------------------------------------------

const LAB_TYPES = ['normal', 'advanced', 'equipment']
const GRADES = ['undergrad', 'master', 'phd']

function normalizeTimeValue(value, field) {
  const s = String(value ?? '').trim()
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  throw new ApiError(`${field}格式应为 HH:MM`)
}

/**
 * 创建和更新共用同一套校验 —— 所有阈值都必须落在合理区间，
 * 否则一条脏配置会让整个实验室的预约逻辑失控。
 */
function normalizeLabPayload(payload) {
  const name = String(payload.name ?? '').trim()
  if (!name) throw new ApiError('实验室名称不能为空')
  if (name.length > 100) throw new ApiError('实验室名称不得超过 100 字')

  if (!LAB_TYPES.includes(payload.type)) throw new ApiError('实验室类型不正确')

  const openTime = normalizeTimeValue(payload.open_time, '开放时间')
  const closeTime = normalizeTimeValue(payload.close_time, '关闭时间')
  if (openTime >= closeTime) throw new ApiError('关闭时间必须晚于开放时间')

  const capacity = Number(payload.capacity)
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 999) {
    throw new ApiError('容纳人数应为 1 ~ 999 的整数')
  }

  const advanceDays = Number(payload.advance_days)
  if (!Number.isInteger(advanceDays) || advanceDays < 0 || advanceDays > 30) {
    throw new ApiError('可提前预约天数应为 0 ~ 30')
  }

  const minDuration = Number(payload.min_duration)
  if (!Number.isInteger(minDuration) || minDuration < 1 || minDuration > 12) {
    throw new ApiError('最短预约时长应为 1 ~ 12 小时')
  }

  const approvalLevel = Number(payload.approval_level)
  if (![0, 1, 2].includes(approvalLevel)) {
    throw new ApiError('审批级别只能是 0（无需）/ 1（教师）/ 2（教师+管理员）')
  }

  if (!GRADES.includes(payload.min_grade)) throw new ApiError('最低学历要求不正确')

  return {
    name,
    type: payload.type,
    location: String(payload.location ?? '').trim().slice(0, 100) || null,
    open_time: openTime,
    close_time: closeTime,
    capacity,
    advance_days: advanceDays,
    min_duration: minDuration,
    approval_level: approvalLevel,
    min_grade: payload.min_grade,
    description: String(payload.description ?? '').trim().slice(0, 1000) || null,
    status: Number(payload.status) === 0 ? 0 : 1,
  }
}

export async function createLab(payload) {
  const d = normalizeLabPayload(payload)
  const result = await query(
    `INSERT INTO labs (name, type, location, open_time, close_time, capacity,
                       advance_days, min_duration, approval_level, min_grade,
                       description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.name, d.type, d.location, d.open_time, d.close_time, d.capacity,
     d.advance_days, d.min_duration, d.approval_level, d.min_grade,
     d.description, d.status]
  )
  return getLabDetail(result.insertId)
}

export async function updateLab(id, payload) {
  const existing = await queryOne('SELECT id FROM labs WHERE id = ? LIMIT 1', [id])
  if (!existing) throw new ApiError('实验室不存在', 404)

  const d = normalizeLabPayload(payload)
  await query(
    `UPDATE labs
     SET name = ?, type = ?, location = ?, open_time = ?, close_time = ?,
         capacity = ?, advance_days = ?, min_duration = ?, approval_level = ?,
         min_grade = ?, description = ?, status = ?
     WHERE id = ?`,
    [d.name, d.type, d.location, d.open_time, d.close_time, d.capacity,
     d.advance_days, d.min_duration, d.approval_level, d.min_grade,
     d.description, d.status, id]
  )
  return getLabDetail(id)
}

/**
 * 删除实验室。
 * 已有预约记录时拒绝 —— 那些是历史数据，删掉会让统计和违规记录失去关联。
 * 单纯想下线应该走「停用」（status = 0）。
 */
export async function deleteLab(id) {
  const lab = await queryOne('SELECT id, name FROM labs WHERE id = ? LIMIT 1', [id])
  if (!lab) throw new ApiError('实验室不存在', 404)

  const rows = await query('SELECT COUNT(*) AS total FROM reservations WHERE lab_id = ?', [id])
  const total = Number(rows[0].total)
  if (total > 0) {
    throw new ApiError(
      `该实验室已有 ${total} 条预约记录，无法删除。若只是停止使用，请改为「停用」`,
      409
    )
  }

  await query('DELETE FROM labs WHERE id = ?', [id])
  return { id: Number(id), name: lab.name }
}
