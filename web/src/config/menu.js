/**
 * 导航菜单单一数据源 —— PC 侧边栏和移动端 TabBar 都从这里取，
 * 保证两端的入口永远一致，不会出现「PC 有、手机没有」的错位。
 *
 *   pc     : 是否出现在 PC 侧边栏
 *   mobile : 是否出现在移动端底部 TabBar（手机上最多放 4 个，别塞满）
 */
const MENU_ITEMS = [
  {
    name: 'labs',
    path: '/labs',
    title: '实验室',
    pcIcon: 'OfficeBuilding',
    mobileIcon: 'apps-o',
    roles: ['student', 'teacher', 'admin'],
    pc: true,
    mobile: true,
  },
  {
    name: 'my-reservations',
    path: '/my/reservations',
    title: '我的预约',
    pcIcon: 'Tickets',
    mobileIcon: 'orders-o',
    roles: ['student'],
    pc: true,
    mobile: true,
  },
  {
    name: 'approvals',
    path: '/approvals',
    title: '待我审批',
    pcIcon: 'Checked',
    mobileIcon: 'todo-list-o',
    roles: ['teacher', 'admin'],
    pc: true,
    mobile: true,
  },
  {
    name: 'admin-labs',
    path: '/admin/labs',
    title: '实验室管理',
    pcIcon: 'Setting',
    mobileIcon: 'setting-o',
    roles: ['admin'],
    pc: true,
    mobile: true,
  },
  {
    name: 'admin-users',
    path: '/admin/users',
    title: '用户管理',
    pcIcon: 'UserFilled',
    mobileIcon: 'friends-o',
    roles: ['admin'],
    pc: true,
    // 手机底部 TabBar 最多 4 个，用户管理从「我的」页进入即可
    mobile: false,
  },
  {
    name: 'admin-stats',
    path: '/admin/stats',
    title: '数据统计',
    pcIcon: 'DataAnalysis',
    mobileIcon: 'chart-trending-o',
    roles: ['admin'],
    pc: true,
    mobile: true,
  },
  {
    name: 'profile',
    path: '/profile',
    title: '我的',
    pcIcon: 'User',
    mobileIcon: 'user-o',
    roles: ['student', 'teacher', 'admin'],
    // 手机上「我的」放最后；PC 端用户信息在顶栏，不必再占菜单位
    pc: false,
    mobile: true,
  },
]

export function menusForRole(role) {
  return MENU_ITEMS.filter((item) => item.roles.includes(role))
}

export const ROLE_LABELS = {
  student: '学生',
  teacher: '指导教师',
  admin: '管理员',
}

export const GRADE_LABELS = {
  undergrad: '本科生',
  master: '研究生',
  phd: '博士生',
}
