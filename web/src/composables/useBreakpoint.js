import { computed, ref } from 'vue'

/**
 * 全站唯一的断点判据。
 *
 * 样式里的媒体查询必须和这里保持一致，否则会出现
 * 「布局已经切成手机版、但 JS 还认为是 PC」的错位。
 */
export const MOBILE_MAX_WIDTH = 767
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`

const isMobile = ref(false)
let initialized = false

function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const mq = window.matchMedia(MOBILE_QUERY)
  isMobile.value = mq.matches
  mq.addEventListener('change', (e) => {
    isMobile.value = e.matches
  })
}

init()

/**
 * 模块级单例：无论多少个组件调用，都共用同一个 matchMedia 监听，
 * 不会因为组件反复挂载卸载而堆积事件监听器。
 */
export function useBreakpoint() {
  return {
    isMobile,
    isPc: computed(() => !isMobile.value),
  }
}
