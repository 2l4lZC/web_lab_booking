<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  OfficeBuilding,
  Tickets,
  Checked,
  Setting,
  DataAnalysis,
  User,
  UserFilled,
  SwitchButton,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { menusForRole, ROLE_LABELS } from '@/config/menu'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const iconMap = { OfficeBuilding, Tickets, Checked, Setting, DataAnalysis, User, UserFilled }

const menus = computed(() => menusForRole(auth.role).filter((m) => m.pc))
const roleLabel = computed(() => ROLE_LABELS[auth.role] || auth.role)

// 子页面（如 /labs/3）也要让父级菜单保持高亮
const activeMenu = computed(() => {
  const hit = menus.value.find(
    (m) => route.path === m.path || route.path.startsWith(`${m.path}/`)
  )
  return hit?.path || route.path
})

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户点了取消
  }
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <el-container class="pc-layout">
    <el-aside width="220px" class="pc-aside">
      <div class="pc-logo">
        <span class="pc-logo-mark">LAB</span>
        <span class="pc-logo-text">实验室预约系统</span>
      </div>

      <el-menu :default-active="activeMenu" router class="pc-menu">
        <el-menu-item v-for="m in menus" :key="m.name" :index="m.path">
          <el-icon><component :is="iconMap[m.pcIcon]" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="pc-header">
        <div class="pc-header-title">{{ route.meta.title || '' }}</div>
        <div class="pc-header-user">
          <el-tag size="small" effect="plain">{{ roleLabel }}</el-tag>
          <span class="pc-username">{{ auth.displayName }}</span>
          <el-button link type="danger" :icon="SwitchButton" @click="handleLogout">
            退出
          </el-button>
        </div>
      </el-header>

      <el-main class="pc-main">
        <slot />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.pc-layout {
  height: 100%;
}

.pc-aside {
  background: #1f2d3d;
  overflow-y: auto;
}

.pc-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--pc-header-height);
  padding: 0 20px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.pc-logo-mark {
  padding: 2px 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  background: #409eff;
  border-radius: 4px;
}

.pc-logo-text {
  font-size: 15px;
  font-weight: 600;
}

.pc-menu {
  border-right: none;
  background: transparent;
}

/* Element Plus 菜单在深色背景下的适配 */
.pc-menu :deep(.el-menu-item) {
  color: #bfcbd9;
}

.pc-menu :deep(.el-menu-item:hover) {
  background: #16222e;
  color: #fff;
}

.pc-menu :deep(.el-menu-item.is-active) {
  background: #16222e;
  color: #409eff;
}

.pc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--pc-header-height);
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.pc-header-title {
  font-size: 16px;
  font-weight: 600;
}

.pc-header-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pc-username {
  color: #606266;
}

.pc-main {
  padding: 20px;
  background: #f5f7fa;
  overflow-y: auto;
}
</style>
