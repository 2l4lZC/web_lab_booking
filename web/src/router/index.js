import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    redirect: '/labs',
  },
  {
    path: '/labs',
    name: 'labs',
    component: () => import('@/views/student/LabList.vue'),
    meta: { title: '实验室' },
  },
  {
    path: '/labs/:id',
    name: 'lab-detail',
    component: () => import('@/views/student/LabDetail.vue'),
    meta: { title: '实验室详情' },
  },
  {
    path: '/reservations/new',
    name: 'reservation-new',
    component: () => import('@/views/student/ReservationForm.vue'),
    meta: { title: '提交预约', roles: ['student'] },
  },
  {
    path: '/my/reservations',
    name: 'my-reservations',
    component: () => import('@/views/student/MyReservations.vue'),
    meta: { title: '我的预约', roles: ['student'] },
  },
  {
    // 扫码进入的落地页：/checkin?code=123456
    path: '/checkin',
    name: 'checkin',
    component: () => import('@/views/Checkin.vue'),
    meta: { title: '实验室签到', roles: ['student'] },
  },
  {
    path: '/approvals',
    name: 'approvals',
    component: () => import('@/views/teacher/ApprovalList.vue'),
    meta: { title: '待我审批', roles: ['teacher', 'admin'] },
  },
  {
    path: '/admin/labs',
    name: 'admin-labs',
    component: () => import('@/views/admin/LabManage.vue'),
    meta: { title: '实验室管理', roles: ['admin'] },
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/admin/UserManage.vue'),
    meta: { title: '用户管理', roles: ['admin'] },
  },
  {
    path: '/admin/stats',
    name: 'admin-stats',
    component: () => import('@/views/admin/Stats.vue'),
    meta: { title: '数据统计', roles: ['admin'] },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/Profile.vue'),
    meta: { title: '我的' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    // 已登录还想去登录页，直接送回首页
    if (auth.isLoggedIn && to.name === 'login') return { path: '/' }
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 角色不符时回首页。真正的权限把关在后端，这里只是不给无效入口
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) {
    return { path: '/' }
  }

  return true
})

export default router
