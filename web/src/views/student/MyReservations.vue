<script setup>
import { computed, onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { ElMessageBox } from 'element-plus'
import { showConfirmDialog } from 'vant'
import { cancelReservation, getReservations } from '@/api/reservation'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNotify } from '@/composables/useNotify'

const { isMobile } = useBreakpoint()
const notify = useNotify()

const list = ref([])
const loading = ref(true)
const filter = ref('')

const STATUS = {
  pending: { text: '待审批', tag: 'warning' },
  approved: { text: '已通过', tag: 'success' },
  rejected: { text: '已驳回', tag: 'danger' },
  cancelled: { text: '已取消', tag: 'info' },
  completed: { text: '已完成', tag: 'success' },
  no_show: { text: '未签到', tag: 'danger' },
}

const FILTERS = [
  { label: '全部', value: '' },
  { label: '待审批', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已完成', value: 'completed' },
  { label: '已驳回', value: 'rejected' },
  { label: '已取消', value: 'cancelled' },
]

const shown = computed(() =>
  filter.value ? list.value.filter((r) => r.status === filter.value) : list.value
)

const hhmm = (t) => String(t).slice(0, 5)

/** 本地时间的 'YYYY-MM-DD HH:MM:SS'，用来和预约时间做字符串比较 */
function nowString() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/**
 * 能否取消：状态未终结，且预约尚未开始。
 * 不能用 toISOString() —— 那是 UTC 时间，比本地时间早 8 小时，
 * 会导致「明明还没开始，取消按钮却不显示」。
 */
function canCancel(row) {
  if (!['pending', 'approved'].includes(row.status)) return false
  return `${row.reserve_date} ${row.start_time}` > nowString()
}

/** 审批进度文案 */
function approvalProgress(row) {
  const parts = []
  if (row.teacher_status) {
    const t = { pending: '待教师审核', approved: '教师已通过', rejected: '教师已驳回' }
    parts.push(t[row.teacher_status])
  }
  if (row.admin_status) {
    const a = { pending: '待管理员确认', approved: '管理员已确认', rejected: '管理员已驳回' }
    parts.push(a[row.admin_status])
  }
  return parts.join(' → ') || '无需审批'
}

async function confirmAction(message) {
  if (isMobile.value) {
    try {
      await showConfirmDialog({ title: '确认', message })
      return true
    } catch {
      return false
    }
  }
  try {
    await ElMessageBox.confirm(message, '确认', { type: 'warning' })
    return true
  } catch {
    return false
  }
}

async function handleCancel(row) {
  if (!(await confirmAction(`确定取消「${row.lab_name} ${row.reserve_date} ${hhmm(row.start_time)}」的预约吗？`))) {
    return
  }
  try {
    const res = await cancelReservation(row.id)
    notify(
      res.violationAdded ? `已取消，24 小时内取消 ${res.cancelCount} 次已记违规` : '已取消预约',
      res.violationAdded ? 'warning' : 'success'
    )
    await load()
  } catch (err) {
    notify(err.message, 'error')
  }
}

async function load() {
  loading.value = true
  try {
    const res = await getReservations({ pageSize: 100 })
    list.value = res.list
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    loading.value = false
  }
}

// ---------- 签到二维码 ----------
const qrVisible = ref(false)
const qrDataUrl = ref('')
const qrRow = ref(null)

/**
 * 二维码内容是一个带 code 参数的链接，而不是那串数字本身 ——
 * 学生用手机扫一下就直接打开签到页并自动提交，不用手输 6 位数字。
 */
async function showQrcode(row) {
  qrRow.value = row
  const url = `${window.location.origin}/checkin?code=${row.checkin_code}`
  try {
    qrDataUrl.value = await QRCode.toDataURL(url, { width: 240, margin: 1 })
    qrVisible.value = true
  } catch {
    notify('二维码生成失败', 'error')
  }
}

onMounted(load)
</script>

<template>
  <div class="my-reservations">
    <!-- ================= PC 端 ================= -->
    <div v-if="!isMobile" class="page-card">
      <div class="list-head">
        <h3 class="page-title">我的预约</h3>
        <el-radio-group v-model="filter" size="small">
          <el-radio-button v-for="f in FILTERS" :key="f.value" :value="f.value">
            {{ f.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <el-table v-loading="loading" :data="shown" stripe>
        <el-table-column prop="lab_name" label="实验室" min-width="140" />
        <el-table-column label="日期" width="110" prop="reserve_date" />
        <el-table-column label="时间段" width="130">
          <template #default="{ row }">{{ hhmm(row.start_time) }}-{{ hhmm(row.end_time) }}</template>
        </el-table-column>
        <el-table-column label="人数" width="70" align="center" prop="people_count" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="STATUS[row.status].tag" size="small">{{ STATUS[row.status].text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批进度" min-width="200">
          <template #default="{ row }">
            <span class="progress">{{ approvalProgress(row) }}</span>
            <div v-if="row.teacher_comment" class="comment">{{ row.teacher_comment }}</div>
            <div v-if="row.admin_comment" class="comment">{{ row.admin_comment }}</div>
          </template>
        </el-table-column>
        <el-table-column label="签到码" width="110" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'approved' && row.checkin_code"
              link
              type="success"
              class="code"
              @click="showQrcode(row)"
            >
              {{ row.checkin_code }}
            </el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button v-if="canCancel(row)" link type="danger" @click="handleCancel(row)">
              取消
            </el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-tip">暂无预约记录</div>
        </template>
      </el-table>
    </div>

    <!-- ================= 移动端 ================= -->
    <div v-else class="mobile-wrap">
      <van-tabs v-model:active="filter" sticky>
        <van-tab v-for="f in FILTERS" :key="f.value" :title="f.label" :name="f.value" />
      </van-tabs>

      <div v-if="loading" class="empty-tip">加载中...</div>
      <div v-else-if="shown.length === 0" class="empty-tip">暂无预约记录</div>

      <div v-else class="card-list">
        <div v-for="row in shown" :key="row.id" class="res-card">
          <div class="card-top">
            <span class="card-name">{{ row.lab_name }}</span>
            <van-tag :type="STATUS[row.status].tag" plain>
              {{ STATUS[row.status].text }}
            </van-tag>
          </div>

          <div class="card-time">
            {{ row.reserve_date }}　{{ hhmm(row.start_time) }}-{{ hhmm(row.end_time) }}
          </div>

          <div class="card-meta">{{ row.people_count }} 人 · {{ row.lab_location }}</div>

          <div class="card-progress">{{ approvalProgress(row) }}</div>
          <div v-if="row.teacher_comment" class="card-comment">教师意见：{{ row.teacher_comment }}</div>
          <div v-if="row.admin_comment" class="card-comment">管理员意见：{{ row.admin_comment }}</div>

          <div
            v-if="row.status === 'approved' && row.checkin_code"
            class="card-code"
            @click="showQrcode(row)"
          >
            签到码 <strong>{{ row.checkin_code }}</strong>
            <span class="card-code-tip">点击出示二维码</span>
          </div>

          <div v-if="canCancel(row)" class="card-actions">
            <van-button size="small" round plain type="danger" @click="handleCancel(row)">
              取消预约
            </van-button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= 签到二维码弹窗 ================= -->
    <div v-if="qrVisible" class="qr-mask" @click.self="qrVisible = false">
      <div class="qr-box">
        <h4 class="qr-title">签到二维码</h4>
        <p class="qr-sub">{{ qrRow?.lab_name }}</p>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="签到二维码" class="qr-img" />
        <p class="qr-code">{{ qrRow?.checkin_code }}</p>
        <p class="qr-tip">手机扫码可直接跳到签到页，也可手动输入上方 6 位数字</p>
        <button class="qr-btn" @click="qrVisible = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.list-head .page-title {
  margin: 0;
}

.progress {
  font-size: 13px;
  color: #606266;
}

.comment {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.code {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
  color: #67c23a;
  letter-spacing: 1px;
}

.muted {
  color: #c0c4cc;
}

/* ---------- 移动端 ---------- */
.mobile-wrap {
  margin: -12px;
}

.card-list {
  padding: 12px;
}

.res-card {
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.card-name {
  font-size: 16px;
  font-weight: 600;
  color: #323233;
}

.card-time {
  margin-bottom: 6px;
  font-size: 14px;
  color: #323233;
}

.card-meta {
  margin-bottom: 10px;
  font-size: 13px;
  color: #969799;
}

.card-progress {
  font-size: 13px;
  color: #646566;
}

.card-comment {
  margin-top: 6px;
  font-size: 12px;
  color: #969799;
}

.card-code {
  margin-top: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: #67c23a;
  background: #f0f9eb;
  border-radius: 6px;
}

.card-code strong {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 17px;
  letter-spacing: 2px;
}

.card-actions {
  margin-top: 12px;
  text-align: right;
}

.card-code {
  cursor: pointer;
}

.card-code-tip {
  float: right;
  font-size: 12px;
  color: #409eff;
}

/* ---------- 签到二维码弹窗 ---------- */
.qr-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
}

.qr-box {
  width: 100%;
  max-width: 320px;
  padding: 24px;
  text-align: center;
  background: #fff;
  border-radius: 12px;
}

.qr-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
}

.qr-sub {
  margin: 0 0 16px;
  font-size: 13px;
  color: #909399;
}

.qr-img {
  width: 200px;
  height: 200px;
}

.qr-code {
  margin: 12px 0 6px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 24px;
  font-weight: 700;
  color: #67c23a;
  letter-spacing: 4px;
}

.qr-tip {
  margin: 0 0 18px;
  font-size: 12px;
  line-height: 1.6;
  color: #a8abb2;
}

.qr-btn {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  color: #fff;
  background: #409eff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
</style>
