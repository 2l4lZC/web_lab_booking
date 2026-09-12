import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getMe, login as loginApi } from '@/api/auth'

const TOKEN_KEY = 'token'
const USER_KEY = 'user'

function readCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    // 缓存被人为改坏时不该让整个应用起不来
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref(readCachedUser())

  const isLoggedIn = computed(() => Boolean(token.value))
  const role = computed(() => user.value?.role || '')
  const displayName = computed(
    () => user.value?.realName || user.value?.username || ''
  )

  async function login(payload) {
    const data = await loginApi(payload)
    token.value = data.token
    user.value = data.user
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    return data.user
  }

  /**
   * 刷新页面后回库取一次真实用户信息。
   * 不能只信 localStorage —— 管理员改过角色或禁用账号时，
   * 老 token 依然能通过签名校验，只有回库才知道现状。
   */
  async function fetchMe() {
    const data = await getMe()
    user.value = data
    localStorage.setItem(USER_KEY, JSON.stringify(data))
    return data
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isLoggedIn, role, displayName, login, fetchMe, logout }
})
