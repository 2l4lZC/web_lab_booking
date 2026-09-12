<script setup>
import { onMounted, ref } from 'vue'
import {
  getHotSlots,
  getLabUsage,
  getOverview,
  getTopStudents,
  getViolationRanking,
} from '@/api/stats'
import { useChart } from '@/composables/useChart'
import { useNotify } from '@/composables/useNotify'

const notify = useNotify()

const days = ref(30)
const loading = ref(true)

const overview = ref({})
const labUsage = ref([])
const hotSlots = ref([])
const topStudents = ref([])
const violations = ref([])

const usageRef = ref(null)
const hotRef = ref(null)
const usageChart = useChart(usageRef)
const hotChart = useChart(hotRef)

const DAY_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
]

const GRADE_TEXT = { undergrad: '本科生', master: '研究生', phd: '博士生' }

function renderUsage() {
  usageChart.setOption({
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${v}%` },
    grid: { left: 56, right: 24, top: 32, bottom: 48 },
    xAxis: {
      type: 'category',
      data: labUsage.value.map((l) => l.name),
      axisLabel: { interval: 0, rotate: labUsage.value.length > 3 ? 20 : 0, fontSize: 11 },
    },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: '使用率',
        type: 'bar',
        data: labUsage.value.map((l) => l.usageRate),
        barMaxWidth: 46,
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', formatter: '{c}%', fontSize: 11 },
      },
    ],
  })
}

function renderHot() {
  hotChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['预约次数', '使用人数'], right: 8, top: 0, itemWidth: 12, itemHeight: 8 },
    grid: { left: 44, right: 24, top: 44, bottom: 32 },
    xAxis: {
      type: 'category',
      data: hotSlots.value.map((s) => s.label),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: '预约次数',
        type: 'bar',
        data: hotSlots.value.map((s) => s.reservationCount),
        barMaxWidth: 22,
        itemStyle: { color: '#409eff', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '使用人数',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: hotSlots.value.map((s) => s.totalPeople),
        itemStyle: { color: '#e6a23c' },
      },
    ],
  })
}

async function load() {
  loading.value = true
  try {
    const params = { days: days.value }
    const [ov, usage, hot, students, vios] = await Promise.all([
      getOverview(params),
      getLabUsage(params),
      getHotSlots(params),
      getTopStudents({ ...params, limit: 10 }),
      getViolationRanking({ ...params, limit: 10 }),
    ])

    overview.value = ov
    labUsage.value = usage
    hotSlots.value = hot
    topStudents.value = students
    violations.value = vios

    // 等 DOM 更新出容器尺寸后再渲染
    requestAnimationFrame(() => {
      renderUsage()
      renderHot()
    })
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="stats-page">
    <div class="page-card head-card">
      <h3 class="page-title">数据统计</h3>
      <el-radio-group v-model="days" size="small" @change="load">
        <el-radio-button v-for="d in DAY_OPTIONS" :key="d.value" :value="d.value">
          {{ d.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <!-- 概览卡片 -->
    <div class="overview-grid">
      <div class="ov-card">
        <div class="ov-value">{{ overview.total_reservations ?? 0 }}</div>
        <div class="ov-label">期间预约总数</div>
      </div>
      <div class="ov-card">
        <div class="ov-value">{{ overview.today_reservations ?? 0 }}</div>
        <div class="ov-label">今日预约</div>
      </div>
      <div class="ov-card">
        <div class="ov-value warn">{{ overview.pending_approvals ?? 0 }}</div>
        <div class="ov-label">待审批</div>
      </div>
      <div class="ov-card">
        <div class="ov-value danger">{{ overview.no_show_count ?? 0 }}</div>
        <div class="ov-label">未签到</div>
      </div>
      <div class="ov-card">
        <div class="ov-value">{{ overview.lab_count ?? 0 }}</div>
        <div class="ov-label">开放实验室</div>
      </div>
      <div class="ov-card">
        <div class="ov-value">{{ overview.device_count ?? 0 }}</div>
        <div class="ov-label">登记设备</div>
      </div>
      <div class="ov-card">
        <div class="ov-value">{{ overview.student_count ?? 0 }}</div>
        <div class="ov-label">学生</div>
      </div>
      <div class="ov-card">
        <div class="ov-value">{{ overview.teacher_count ?? 0 }}</div>
        <div class="ov-label">指导教师</div>
      </div>
    </div>

    <!-- 实验室使用率 -->
    <div class="page-card">
      <h4 class="section-title">实验室使用率</h4>
      <p class="section-hint">口径：已预约时长 ÷ 开放时长（不乘容量）</p>
      <div ref="usageRef" class="chart chart-sm"></div>
    </div>

    <!-- 热门时间段 -->
    <div class="page-card">
      <h4 class="section-title">热门时间段</h4>
      <p class="section-hint">按预约开始时间所在小时统计</p>
      <div ref="hotRef" class="chart"></div>
    </div>

    <!-- 两张排行表 -->
    <div class="rank-row">
      <div class="page-card">
        <h4 class="section-title">学生预约次数排行</h4>
        <el-table :data="topStudents" size="small" stripe max-height="360">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="real_name" label="姓名" width="90" />
          <el-table-column label="学历" width="80">
            <template #default="{ row }">{{ GRADE_TEXT[row.grade] || '-' }}</template>
          </el-table-column>
          <el-table-column prop="college" label="学院" min-width="110" show-overflow-tooltip />
          <el-table-column label="预约" width="70" align="center" prop="reservation_count" />
          <el-table-column label="完成" width="70" align="center" prop="completed_count" />
          <el-table-column label="未签到" width="80" align="center">
            <template #default="{ row }">
              <span :class="{ danger: Number(row.no_show_count) > 0 }">{{ row.no_show_count }}</span>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-tip">该时间段内没有预约记录</div>
          </template>
        </el-table>
      </div>

      <div class="page-card">
        <h4 class="section-title">违规排行榜</h4>
        <el-table :data="violations" size="small" stripe max-height="360">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="real_name" label="姓名" width="90" />
          <el-table-column prop="college" label="学院" min-width="110" show-overflow-tooltip />
          <el-table-column label="违规" width="70" align="center" prop="violation_count" />
          <el-table-column label="未签到" width="80" align="center" prop="no_show_count" />
          <el-table-column label="频繁取消" width="90" align="center" prop="frequent_cancel_count" />
          <template #empty>
            <div class="empty-tip">该时间段内没有违规记录</div>
          </template>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.head-card .page-title {
  margin: 0;
}

/* ---------- 概览卡片 ---------- */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.ov-card {
  padding: 18px 16px;
  background: #fff;
  border-radius: 8px;
  text-align: center;
}

.ov-value {
  font-size: 26px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
}

.ov-value.warn {
  color: #e6a23c;
}

.ov-value.danger {
  color: #f56c6c;
}

.ov-label {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

/* ---------- 图表 ---------- */
.section-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
}

.section-hint {
  margin: 0 0 14px;
  font-size: 12px;
  color: #a8abb2;
}

.chart {
  width: 100%;
  height: 280px;
}

.chart-sm {
  height: 240px;
}

.rank-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.danger {
  color: #f56c6c;
  font-weight: 600;
}

@media (max-width: 1100px) {
  .rank-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .stats-page {
    gap: 12px;
    margin: -12px;
  }

  .stats-page .page-card {
    border-radius: 0;
  }

  .head-card {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .overview-grid {
    grid-template-columns: repeat(2, 1fr);
    padding: 0 12px;
  }

  .chart {
    height: 220px;
  }
}
</style>
