import { ElMessage } from 'element-plus'
import { showFailToast, showSuccessToast, showToast } from 'vant'
import { useBreakpoint } from './useBreakpoint'

/**
 * 统一的轻提示。
 * Element Plus 的 ElMessage 在窄屏上会被挤出视口，所以移动端换成 Vant 的 Toast。
 * 组件里用：const notify = useNotify()
 */
export function useNotify() {
  const { isMobile } = useBreakpoint()

  return function notify(message, type = 'success') {
    if (isMobile.value) {
      if (type === 'error') return showFailToast(message)
      if (type === 'warning') return showToast(message)
      return showSuccessToast(message)
    }
    ElMessage({ message, type, duration: 2500 })
  }
}
