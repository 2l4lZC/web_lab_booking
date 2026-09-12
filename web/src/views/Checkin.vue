<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { doCheckin } from '@/api/checkin'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNotify } from '@/composables/useNotify'

const route = useRoute()
const { isMobile } = useBreakpoint()
const notify = useNotify()

const code = ref('')
const submitting = ref(false)
const result = ref(null)

async function submit() {
  const value = String(code.value).trim()
  if (!/^\d{6}$/.test(value)) {
    notify('请输入 6 位签到码', 'warning')
    return
  }

  submitting.value = true
  try {
    result.value = await doCheckin(value)
    notify(`签到成功，欢迎使用${result.value.labName}`)
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  // 扫二维码进来的链接形如 /checkin?code=123456，自动填好并直接提交
  const scanned = route.query.code
  if (scanned) {
    code.value = String(scanned)
    submit()
  }
})
</script>

<template>
  <div class="checkin-page">
    <!-- 签到成功 -->
    <div v-if="result" class="page-card done-card">
      <div class="done-icon">✓</div>
      <h3 class="done-title">签到成功</h3>
      <p class="done-lab">{{ result.labName }}</p>
      <p class="done-time">{{ result.reserveDate }}　{{ result.startTime }} - {{ result.endTime }}</p>
      <p class="done-tip">请按时使用实验室，离开时记得整理设备</p>
    </div>

    <!-- 签到表单 -->
    <div v-else class="page-card">
      <h3 class="page-title">实验室签到</h3>
      <p class="hint">请输入预约成功后获得的 6 位签到码，或用手机扫描实验室二维码</p>

      <!-- 移动端 -->
      <template v-if="isMobile">
        <van-field
          v-model="code"
          type="digit"
          maxlength="6"
          placeholder="请输入 6 位签到码"
          class="code-input"
          @keyup.enter="submit"
        />
        <div class="m-submit">
          <van-button round block type="primary" :loading="submitting" @click="submit">
            确认签到
          </van-button>
        </div>
      </template>

      <!-- PC 端 -->
      <template v-else>
        <el-input
          v-model="code"
          size="large"
          maxlength="6"
          placeholder="请输入 6 位签到码"
          class="code-input"
          @keyup.enter="submit"
        />
        <el-button
          type="primary"
          size="large"
          class="pc-submit"
          :loading="submitting"
          @click="submit"
        >
          确认签到
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.checkin-page {
  max-width: 520px;
  margin: 0 auto;
}

.hint {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.7;
  color: #909399;
}

.code-input {
  margin-bottom: 20px;
}

.code-input :deep(input) {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 24px;
  letter-spacing: 8px;
  text-align: center;
}

.pc-submit {
  width: 100%;
}

.m-submit {
  padding: 0 4px;
}

/* ---------- 成功态 ---------- */
.done-card {
  text-align: center;
  padding: 40px 20px;
}

.done-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  font-size: 34px;
  line-height: 64px;
  color: #fff;
  background: #67c23a;
  border-radius: 50%;
}

.done-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 600;
}

.done-lab {
  margin: 0 0 6px;
  font-size: 16px;
  color: #303133;
}

.done-time {
  margin: 0 0 20px;
  font-size: 14px;
  color: #909399;
}

.done-tip {
  margin: 0;
  font-size: 12px;
  color: #c0c4cc;
}

@media (max-width: 767px) {
  .checkin-page {
    margin: -12px;
  }

  .checkin-page .page-card {
    border-radius: 0;
  }
}
</style>
