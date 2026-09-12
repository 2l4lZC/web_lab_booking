import { query, queryOne } from '../db.js'
import { ApiError } from '../utils/response.js'

const GRADES = ['undergrad', 'master', 'phd']
const STATUSES = ['available', 'in_use', 'maintenance', 'broken']
const STATUS_TEXT = {
  available: '可用',
  in_use: '使用中',
  maintenance: '维护中',
  broken: '已损坏',
}

export async function listDevices({ labId } = {}) {
  const params = []
  let sql = `
    SELECT d.id, d.lab_id, d.name, d.model, d.status, d.min_grade,
           d.need_approval, d.requirement, d.created_at,
           l.name AS lab_name
    FROM devices d
    JOIN labs l ON l.id = d.lab_id`

  if (labId) {
    sql += ' WHERE d.lab_id = ?'
    params.push(Number(labId))
  }
  sql += ' ORDER BY d.lab_id, d.id'

  return query(sql, params)
}

function normalizeDevicePayload(payload) {
  const name = String(payload.name ?? '').trim()
  if (!name) throw new ApiError('设备名称不能为空')
  if (name.length > 100) throw new ApiError('设备名称不得超过 100 字')

  const labId = Number(payload.lab_id)
  if (!Number.isInteger(labId)) throw new ApiError('请选择所属实验室')

  if (!STATUSES.includes(payload.status)) {
    throw new ApiError(`设备状态只能是：${Object.values(STATUS_TEXT).join(' / ')}`)
  }
  if (!GRADES.includes(payload.min_grade)) throw new ApiError('最低学历要求不正确')

  return {
    lab_id: labId,
    name,
    model: String(payload.model ?? '').trim().slice(0, 100) || null,
    status: payload.status,
    min_grade: payload.min_grade,
    need_approval: payload.need_approval ? 1 : 0,
    requirement: String(payload.requirement ?? '').trim().slice(0, 255) || null,
  }
}

async function assertLabExists(labId) {
  const lab = await queryOne('SELECT id FROM labs WHERE id = ? LIMIT 1', [labId])
  if (!lab) throw new ApiError('所属实验室不存在', 404)
}

export async function createDevice(payload) {
  const d = normalizeDevicePayload(payload)
  await assertLabExists(d.lab_id)

  const result = await query(
    `INSERT INTO devices (lab_id, name, model, status, min_grade, need_approval, requirement)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.lab_id, d.name, d.model, d.status, d.min_grade, d.need_approval, d.requirement]
  )
  return queryOne('SELECT * FROM devices WHERE id = ?', [result.insertId])
}

export async function updateDevice(id, payload) {
  const existing = await queryOne('SELECT id FROM devices WHERE id = ? LIMIT 1', [id])
  if (!existing) throw new ApiError('设备不存在', 404)

  const d = normalizeDevicePayload(payload)
  await assertLabExists(d.lab_id)

  await query(
    `UPDATE devices
     SET lab_id = ?, name = ?, model = ?, status = ?, min_grade = ?,
         need_approval = ?, requirement = ?
     WHERE id = ?`,
    [d.lab_id, d.name, d.model, d.status, d.min_grade, d.need_approval, d.requirement, id]
  )
  return queryOne('SELECT * FROM devices WHERE id = ?', [id])
}

/**
 * 删除设备。
 * 历史预约的 device_ids 是 JSON 字段，不做外键约束，
 * 删掉后旧预约里会留下找不到的 ID —— 展示时按「设备已移除」处理即可，
 * 所以这里不做拦截。
 */
export async function deleteDevice(id) {
  const device = await queryOne('SELECT id, name FROM devices WHERE id = ? LIMIT 1', [id])
  if (!device) throw new ApiError('设备不存在', 404)

  await query('DELETE FROM devices WHERE id = ?', [id])
  return { id: Number(id), name: device.name }
}
