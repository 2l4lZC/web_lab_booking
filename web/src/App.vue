<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useBreakpoint } from '@/composables/useBreakpoint'
import PcLayout from '@/layouts/PcLayout.vue'
import MobileLayout from '@/layouts/MobileLayout.vue'

const route = useRoute()
const { isMobile } = useBreakpoint()

/**
 * 登录页是独立整页，不套外壳；
 * 其余页面按屏幕宽度挂载 PC 或移动布局。
 * 共享的是路由和状态，不是模板 —— 两种形态的差异太大，硬合成一个组件只会互相牵制。
 */
const layoutComponent = computed(() => {
  if (route.meta.public) return null
  return isMobile.value ? MobileLayout : PcLayout
})
</script>

<template>
  <component :is="layoutComponent" v-if="layoutComponent">
    <router-view />
  </component>
  <router-view v-else />
</template>
