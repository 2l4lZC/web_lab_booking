<script setup>
import { useRouter } from 'vue-router'
import { useBreakpoint } from '@/composables/useBreakpoint'

const router = useRouter()
const { isMobile } = useBreakpoint()
</script>

<template>
  <div class="not-found">
    <van-empty v-if="isMobile" image="error" description="页面不存在或已被移除">
      <van-button round type="primary" size="small" @click="router.replace('/')">
        返回首页
      </van-button>
    </van-empty>

    <el-result v-else icon="warning" title="404" sub-title="页面不存在或已被移除">
      <template #extra>
        <el-button type="primary" @click="router.replace('/')">返回首页</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
</style>
