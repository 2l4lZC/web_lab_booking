/**
 * 管理端接口冒烟测试。
 *
 * 用 Node 的 fetch 而不是 curl —— Windows 的 Git Bash 会把命令行参数里的
 * 中文转成 GBK，导致请求体编码错误（这个坑踩过一次）。Node 内部统一 UTF-8，
 * 与浏览器行为一致。
 *
 * 执行：cd server && npm run test:smoke
 * 前提：后端已在 http://localhost:3000 运行
 */
const API = process.env.API_BASE || 'http://localhost:3000/api'

async function login(username, password = '123456') {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json()
  return body.data?.token || null
}

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

let pass = 0
let fail = 0

function check(label, condition, detail = '') {
  if (condition) {
    pass++
    console.log(`  ✅ ${label}${detail ? `  ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  ❌ ${label}${detail ? `  ${detail}` : ''}`)
  }
}

async function main() {
  const admin = await login('admin')
  const student = await login('S2021001')
  if (!admin || !student) throw new Error('登录失败，请确认后端已启动且已执行 npm run seed')

  // 用时间戳后缀，避免重复执行时账号冲突
  const stamp = Date.now().toString().slice(-6)
  const testUsername = `T${stamp}`
  let createdUserId = null
  let createdLabId = null
  let createdDeviceId = null

  try {
    console.log('\n【权限隔离】')
    let r = await call('GET', '/users', student)
    check('学生访问用户管理被拒', r.code !== 0, r.message)

    r = await call('POST', '/labs', student, { name: 'x', type: 'normal' })
    check('学生创建实验室被拒', r.code !== 0, r.message)

    console.log('\n【实验室管理】')
    r = await call('POST', '/labs', admin, {
      name: '虚拟仿真实验室',
      type: 'advanced',
      location: '实验楼 5F-501',
      open_time: '09:00',
      close_time: '20:00',
      capacity: 12,
      advance_days: 2,
      min_duration: 1,
      approval_level: 1,
      min_grade: 'undergrad',
      description: '虚拟仿真实验教学专用',
    })
    check('创建实验室', r.code === 0, r.message)
    createdLabId = r.data?.id
    check('中文名称正确写入', r.data?.name === '虚拟仿真实验室', `name=${r.data?.name}`)

    r = await call('POST', '/labs', admin, {
      name: '时间错误实验室', type: 'normal', open_time: '20:00', close_time: '09:00',
      capacity: 10, advance_days: 1, min_duration: 1, approval_level: 0, min_grade: 'undergrad',
    })
    check('关闭早于开放被拒', r.code !== 0, r.message)

    r = await call('POST', '/labs', admin, {
      name: '审批级别错误', type: 'normal', open_time: '09:00', close_time: '18:00',
      capacity: 10, advance_days: 1, min_duration: 1, approval_level: 9, min_grade: 'undergrad',
    })
    check('非法审批级别被拒', r.code !== 0, r.message)

    r = await call('PUT', `/labs/${createdLabId}`, admin, {
      name: '虚拟仿真实验室（改建）', type: 'equipment', location: '实验楼 5F-502',
      open_time: '10:00', close_time: '18:00', capacity: 8, advance_days: 5,
      min_duration: 2, approval_level: 2, min_grade: 'master', description: '改建后',
    })
    check('更新实验室', r.code === 0, r.message)
    check(
      '规则字段全部更新',
      r.data?.capacity === 8 && r.data?.approval_level === 2 && r.data?.min_grade === 'master',
      `容量${r.data?.capacity} 审批${r.data?.approval_level} 学历${r.data?.min_grade}`
    )

    r = await call('DELETE', '/labs/1', admin)
    check('有预约记录的实验室拒绝删除', r.code !== 0, r.message)

    r = await call('DELETE', `/labs/${createdLabId}`, admin)
    check('无预约记录的实验室可删除', r.code === 0, r.message)
    createdLabId = null

    console.log('\n【设备管理】')
    r = await call('POST', '/devices', admin, {
      lab_id: 2, name: '测试机械臂', model: 'UR5', status: 'available',
      min_grade: 'master', need_approval: 1, requirement: '需培训后使用',
    })
    check('创建设备', r.code === 0, r.message)
    createdDeviceId = r.data?.id

    r = await call('POST', '/devices', admin, {
      lab_id: 9999, name: '孤儿设备', model: 'X', status: 'available',
      min_grade: 'undergrad', need_approval: 0,
    })
    check('所属实验室不存在时拒绝', r.code !== 0, r.message)

    r = await call('PUT', `/devices/${createdDeviceId}`, admin, {
      lab_id: 2, name: '测试机械臂', model: 'UR5e', status: 'maintenance',
      min_grade: 'master', need_approval: 1, requirement: '维护中',
    })
    check('更新设备状态', r.code === 0 && r.data?.status === 'maintenance', `型号=${r.data?.model}`)

    r = await call('DELETE', `/devices/${createdDeviceId}`, admin)
    check('删除设备', r.code === 0, r.message)
    createdDeviceId = null

    console.log('\n【用户管理】')
    r = await call('GET', '/users?role=student&pageSize=5', admin)
    check('用户列表', r.code === 0, `共 ${r.data?.total} 人`)
    check(
      '带出违规次数与权限状态',
      r.data?.list?.[0]?.permission !== undefined,
      `示例：${r.data?.list?.[0]?.real_name} ${r.data?.list?.[0]?.permission?.label}`
    )

    r = await call('GET', '/users/teachers', admin)
    check('教师下拉列表', r.code === 0 && r.data?.length > 0, `${r.data?.length} 位教师`)

    r = await call('POST', '/users', admin, {
      username: testUsername, real_name: '冒烟测试账号', role: 'student',
      grade: 'undergrad', college: '计算机学院', advisor_id: 2, password: '123456',
    })
    check('创建用户', r.code === 0, r.message)
    createdUserId = r.data?.id
    check('中文姓名正确写入', r.data?.real_name === '冒烟测试账号', `name=${r.data?.real_name}`)

    r = await call('POST', '/users', admin, {
      username: testUsername, real_name: '重复', role: 'student',
      grade: 'undergrad', password: '123456',
    })
    check('重复账号被拒', r.code !== 0, r.message)

    r = await call('POST', '/users', admin, {
      username: 'ab', real_name: '短账号', role: 'student', grade: 'undergrad', password: '123456',
    })
    check('非法账号格式被拒', r.code !== 0, r.message)

    const newToken = await login(testUsername)
    check('新建账号可正常登录', Boolean(newToken))

    r = await call('GET', `/users/${createdUserId}`, admin)
    check(
      '用户详情含导师与违规',
      r.data?.advisor_name !== undefined && Array.isArray(r.data?.violations),
      `导师=${r.data?.advisor_name}`
    )

    r = await call('PUT', '/users/1', admin, {
      username: 'admin', real_name: '系统管理员', role: 'admin', grade: 'phd', status: 0,
    })
    check('管理员不能停用自己', r.code !== 0, r.message)

    r = await call('PUT', '/users/1', admin, {
      username: 'admin', real_name: '系统管理员', role: 'student', grade: 'phd',
    })
    check('管理员不能改自己的角色', r.code !== 0, r.message)
  } finally {
    // 清理本次产生或残留的测试数据
    const { query, pool } = await import('../db.js')
    if (createdLabId) await query('DELETE FROM labs WHERE id = ?', [createdLabId])
    if (createdDeviceId) await query('DELETE FROM devices WHERE id = ?', [createdDeviceId])
    if (createdUserId) await query('DELETE FROM users WHERE id = ?', [createdUserId])
    await pool.end()
  }

  console.log(`\n${'='.repeat(46)}`)
  console.log(`  通过 ${pass} 项，失败 ${fail} 项`)
  console.log(`${'='.repeat(46)}\n`)

  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error('\n测试异常:', err.message)
  process.exit(1)
})
