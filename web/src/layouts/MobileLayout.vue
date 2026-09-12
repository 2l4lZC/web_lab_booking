<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { menusForRole } from '@/config/menu'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const tabs = computed(() => menusForRole(auth.role).filter((m) => m.mobile))
const title = computed(() => route.meta.title || '实验室预约')

/**
 * v-model 绑定的是 path 而不是下标 —— 用下标的话，
 * 从「实验室」点进详情页再返回，TabBar 高亮就会错位。
 */
const activeTab = computed({
  get() {
    const hit = tabs.value.find(
      (t) => route.path === t.path || route.path.startsWith(`${t.path}/`)
    )
    return hit?.path || route.path
  },
  set(path) {
    if (path !== route.path) router.push(path)
  },
})
</script>

<template>
  <div class="mobile-layout">
    <van-nav-bar :title="title" fixed placeholder />

    <div class="mobile-content">
      <slot />
    </div>

    <van-tabbar v-model="activeTab" fixed placeholder safe-area-inset-bottom>
      <van-tabbar-item
        v-for="t in tabs"
        :key="t.name"
        :name="t.path"
        :icon="t.mobileIcon"
      >
        {{ t.title }}
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.mobile-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: #f7f8fa;
}

.mobile-content {
  flex: 1;
  padding: 12px;
}
</style>
