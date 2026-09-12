<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { GRADE_LABELS, ROLE_LABELS } from '@/config/menu'

const auth = useAuthStore()
const router = useRouter()
const { isMobile } = useBreakpoint()

const raw = computed(() => auth.user || {})

// 登录时存的是精简信息，/auth/me 返回的才是完整字段，两种来源都兼容
const infoRows = computed(() => [
  { label: '姓名', value: raw.value.real_name || raw.value.realName || '-' },
  { label: '账号', value: raw.value.username || '-' },
  { label: '角色', value: ROLE_LABELS[auth.role] || auth.role || '-' },
  { label: '学历', value: GRADE_LABELS[raw.value.grade] || '-' },
  { label: '学院', value: raw.value.college || '-' },
  { label: '电话', value: raw.value.phone || '未填写' },
])

onMounted(async () => {
  // 拉一次最新资料，顺便验证 token 是否还有效
  try {
    await auth.fetchMe()
  } catch {
    // 401 已由 axios 拦截器统一处理
  }
})

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="page-card">
    <h3 class="page-title">我的</h3>

    <!-- 移动端：Vant 单元格 -->
    <van-cell-group v-if="isMobile" inset>
      <van-cell
        v-for="row in infoRows"
        :key="row.label"
        :title="row.label"
        :value="row.value"
      />
    </van-cell-group>

    <!-- PC 端：描述列表 -->
    <el-descriptions v-else :column="2" border>
      <el-descriptions-item
        v-for="row in infoRows"
        :key="row.label"
        :label="row.label"
      >
        {{ row.value }}
      </el-descriptions-item>
    </el-descriptions>

    <div class="profile-actions">
      <van-button v-if="isMobile" block round type="danger" @click="handleLogout">
        退出登录
      </van-button>
      <el-button v-else type="danger" plain @click="handleLogout">
        退出登录
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.profile-actions {
  margin-top: 24px;
}
</style>
