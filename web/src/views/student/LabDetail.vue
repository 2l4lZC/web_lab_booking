<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAvailableSlots, getLabDetail } from '@/api/lab'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNotify } from '@/composables/useNotify'

const route = useRoute()
const router = useRouter()
const { isMobile } = useBreakpoint()
const notify = useNotify()

const lab = ref(null)
const slots = ref([])
const loading = ref(true)
const slotsLoading = ref(false)
const date = ref('')

const TYPE_LABELS = { normal: '普通', advanced: '高级', equipment: '设备型' }
const TYPE_TAG = { normal: 'info', advanced: 'warning', equipment: 'danger' }
const APPROVAL_TEXT = { 0: '无需审批', 1: '教师审核', 2: '教师+管理员' }
const GRADE_TEXT = { undergrad: '本科生', master: '研究生', phd: '博士生' }
const DEVICE_STATUS = {
  available: { text: '可用', type: 'success' },
  in_use: { text: '使用中', type: 'warning' },
  maintenance: { text: '维护中', type: 'info' },
  broken: { text: '已损坏', type: 'danger' },
}

const hhmm = (t) => String(t).slice(0, 5)

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 可选日期范围就取自实验室自己的 advance_days，
 * 前端不做第二套规则，避免和后端校验对不上。
 */
const dateOptions = computed(() => {
  if (!lab.value) return []
  const base = new Date()
  const opts = []
  for (let i = 0; i <= lab.value.advance_days; i++) {
    const d = new Date(base.getTime() + i * 86400000)
    opts.push({
      value: fmtDate(d),
      label: i === 0 ? '今天' : i === 1 ? '明天' : `${d.getMonth() + 1}/${d.getDate()}`,
    })
  }
  return opts
})

async function loadLab() {
  loading.value = true
  try {
    lab.value = await getLabDetail(route.params.id)
    date.value = dateOptions.value[0]?.value || fmtDate(new Date())
  } catch (err) {
    notify(err.message, 'error')
    router.replace('/labs')
  } finally {
    loading.value = false
  }
}

async function loadSlots() {
  if (!lab.value || !date.value) return
  slotsLoading.value = true
  try {
    const res = await getAvailableSlots(lab.value.id, { date: date.value })
    slots.value = res.slots
  } catch (err) {
    notify(err.message, 'error')
    slots.value = []
  } finally {
    slotsLoading.value = false
  }
}

watch(date, loadSlots)

onMounted(async () => {
  await loadLab()
  await loadSlots()
})

/** 点某个时段直接带着参数进预约表单，省得再选一遍 */
function pickSlot(slot) {
  if (!slot.available) return
  router.push({
    name: 'reservation-new',
    query: {
      lab: lab.value.id,
      date: date.value,
      start: slot.start,
      end: slot.end,
    },
  })
}
</script>

<template>
  <div v-loading="loading" class="lab-detail">
    <template v-if="lab">
      <!-- 基本信息 -->
      <div class="page-card info-card">
        <div class="info-head">
          <h3 class="page-title">{{ lab.name }}</h3>
          <el-tag :type="TYPE_TAG[lab.type]" size="small">{{ TYPE_LABELS[lab.type] }}</el-tag>
        </div>

        <p class="info-desc">{{ lab.description }}</p>

        <div class="info-grid">
          <div class="info-item"><span class="k">位置</span><span>{{ lab.location }}</span></div>
          <div class="info-item">
            <span class="k">开放时间</span>
            <span>{{ hhmm(lab.open_time) }} - {{ hhmm(lab.close_time) }}</span>
          </div>
          <div class="info-item"><span class="k">容纳人数</span><span>{{ lab.capacity }} 人</span></div>
          <div class="info-item"><span class="k">可提前</span><span>{{ lab.advance_days }} 天</span></div>
          <div class="info-item"><span class="k">最短时长</span><span>{{ lab.min_duration }} 小时</span></div>
          <div class="info-item"><span class="k">审批方式</span><span>{{ APPROVAL_TEXT[lab.approval_level] }}</span></div>
          <div class="info-item"><span class="k">学历要求</span><span>{{ GRADE_TEXT[lab.min_grade] }}及以上</span></div>
        </div>
      </div>

      <!-- 可约时段 -->
      <div class="page-card">
        <h4 class="section-title">可约时段</h4>

        <div class="date-bar">
          <button
            v-for="opt in dateOptions"
            :key="opt.value"
            class="date-chip"
            :class="{ active: date === opt.value }"
            @click="date = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <div v-if="slotsLoading" class="empty-tip">查询中...</div>
        <div v-else-if="slots.length === 0" class="empty-tip">该日暂无可约时段</div>
        <div v-else class="slot-grid">
          <button
            v-for="s in slots"
            :key="s.start"
            class="slot"
            :class="{ full: !s.available }"
            :disabled="!s.available"
            @click="pickSlot(s)"
          >
            <span class="slot-time">{{ s.start }}-{{ s.end }}</span>
            <span class="slot-left">
              {{ s.available ? `余 ${s.remaining} 人` : '已满' }}
            </span>
          </button>
        </div>

        <p class="slot-hint">点击可用时段可直接进入预约表单</p>
      </div>

      <!-- 设备清单 -->
      <div class="page-card">
        <h4 class="section-title">设备清单（{{ lab.devices.length }}）</h4>

        <div v-if="lab.devices.length === 0" class="empty-tip">该实验室暂无登记设备</div>

        <!-- PC：表格 -->
        <el-table v-else-if="!isMobile" :data="lab.devices" stripe>
          <el-table-column prop="name" label="设备名称" min-width="140" />
          <el-table-column prop="model" label="型号" min-width="130" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="DEVICE_STATUS[row.status].type" size="small">
                {{ DEVICE_STATUS[row.status].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="学历要求" width="100">
            <template #default="{ row }">{{ GRADE_TEXT[row.min_grade] }}</template>
          </el-table-column>
          <el-table-column prop="requirement" label="使用要求" min-width="200" />
        </el-table>

        <!-- 移动：卡片 -->
        <div v-else class="device-list">
          <div v-for="d in lab.devices" :key="d.id" class="device-card">
            <div class="device-top">
              <span class="device-name">{{ d.name }}</span>
              <van-tag :type="DEVICE_STATUS[d.status].type" plain>
                {{ DEVICE_STATUS[d.status].text }}
              </van-tag>
            </div>
            <div class="device-model">{{ d.model }}</div>
            <div v-if="d.requirement" class="device-req">{{ d.requirement }}</div>
            <div class="device-grade">学历要求：{{ GRADE_TEXT[d.min_grade] }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lab-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 767px) {
  .lab-detail {
    gap: 12px;
    margin: -12px;
  }

  .lab-detail .page-card {
    border-radius: 0;
  }
}

.info-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.info-head .page-title {
  margin: 0;
}

.info-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
  color: #909399;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px 24px;
}

.info-item {
  display: flex;
  gap: 8px;
  font-size: 14px;
}

.info-item .k {
  flex: 0 0 70px;
  color: #909399;
}

.section-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}

/* ---------- 日期选择 ---------- */
.date-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.date-chip {
  flex: 0 0 auto;
  padding: 6px 16px;
  font-size: 13px;
  color: #606266;
  background: #f4f4f5;
  border: 1px solid transparent;
  border-radius: 16px;
  cursor: pointer;
}

.date-chip.active {
  color: #fff;
  background: #409eff;
}

/* ---------- 时段网格 ---------- */
.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}

.slot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.slot:hover:not(.full) {
  border-color: #409eff;
  background: #ecf5ff;
}

/* 满员时段直接禁用 —— 让用户点不到冲突选项，比提交后报错友好得多 */
.slot.full {
  background: #f5f7fa;
  border-color: #ebeef5;
  cursor: not-allowed;
  opacity: 0.65;
}

.slot-time {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.slot.full .slot-time {
  color: #a8abb2;
}

.slot-left {
  font-size: 12px;
  color: #67c23a;
}

.slot.full .slot-left {
  color: #f56c6c;
}

.slot-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: #a8abb2;
}

/* ---------- 设备（移动端） ---------- */
.device-card {
  padding: 12px 0;
  border-bottom: 1px solid #f2f3f5;
}

.device-card:last-child {
  border-bottom: none;
}

.device-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.device-name {
  font-size: 15px;
  font-weight: 500;
}

.device-model {
  font-size: 13px;
  color: #969799;
}

.device-req {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #646566;
}

.device-grade {
  margin-top: 6px;
  font-size: 12px;
  color: #969799;
}
</style>
