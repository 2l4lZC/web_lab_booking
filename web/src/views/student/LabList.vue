<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getLabs } from '@/api/lab'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNotify } from '@/composables/useNotify'

const router = useRouter()
const { isMobile } = useBreakpoint()
const notify = useNotify()

const labs = ref([])
const loading = ref(true)
const filterType = ref('')

const TYPE_LABELS = { normal: '普通', advanced: '高级', equipment: '设备型' }
const TYPE_TAG = { normal: 'info', advanced: 'warning', equipment: 'danger' }
const APPROVAL_TEXT = { 0: '无需审批', 1: '教师审核', 2: '教师+管理员' }
const GRADE_TEXT = { undergrad: '本科生', master: '研究生', phd: '博士生' }

const shown = computed(() =>
  filterType.value ? labs.value.filter((l) => l.type === filterType.value) : labs.value
)

/** 后端返回 'HH:MM:SS'，展示时截掉秒 */
const hhmm = (t) => String(t).slice(0, 5)

const openRange = (lab) => `${hhmm(lab.open_time)} - ${hhmm(lab.close_time)}`

function goDetail(lab) {
  router.push(`/labs/${lab.id}`)
}

async function load() {
  loading.value = true
  try {
    labs.value = await getLabs()
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="lab-list">
    <!-- ================= PC 端：表格 ================= -->
    <div v-if="!isMobile" class="page-card">
      <div class="list-head">
        <h3 class="page-title">实验室</h3>
        <el-radio-group v-model="filterType" size="small">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="normal">普通</el-radio-button>
          <el-radio-button value="advanced">高级</el-radio-button>
          <el-radio-button value="equipment">设备型</el-radio-button>
        </el-radio-group>
      </div>

      <el-table
        v-loading="loading"
        :data="shown"
        stripe
        row-key="id"
        class="lab-table"
        @row-click="goDetail"
      >
        <el-table-column prop="name" label="实验室" min-width="150" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="TYPE_TAG[row.type]" size="small" effect="light">
              {{ TYPE_LABELS[row.type] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" min-width="130" />
        <el-table-column label="开放时间" width="140">
          <template #default="{ row }">{{ openRange(row) }}</template>
        </el-table-column>
        <el-table-column label="容量" width="80" align="center">
          <template #default="{ row }">{{ row.capacity }} 人</template>
        </el-table-column>
        <el-table-column label="可提前" width="90" align="center">
          <template #default="{ row }">{{ row.advance_days }} 天</template>
        </el-table-column>
        <el-table-column label="审批" width="120">
          <template #default="{ row }">
            <span :class="{ 'need-approval': row.approval_level > 0 }">
              {{ APPROVAL_TEXT[row.approval_level] }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="设备" width="70" align="center">
          <template #default="{ row }">{{ row.device_count }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="goDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- ================= 移动端：卡片 ================= -->
    <div v-else class="mobile-wrap">
      <van-tabs v-model:active="filterType" sticky>
        <van-tab title="全部" name="" />
        <van-tab title="普通" name="normal" />
        <van-tab title="高级" name="advanced" />
        <van-tab title="设备型" name="equipment" />
      </van-tabs>

      <div v-if="loading" class="empty-tip">加载中...</div>
      <div v-else-if="shown.length === 0" class="empty-tip">暂无实验室</div>

      <div v-else class="card-list">
        <div v-for="lab in shown" :key="lab.id" class="lab-card" @click="goDetail(lab)">
          <div class="card-top">
            <span class="card-name">{{ lab.name }}</span>
            <van-tag :type="TYPE_TAG[lab.type]" plain>
              {{ TYPE_LABELS[lab.type] }}
            </van-tag>
          </div>

          <div class="card-loc">{{ lab.location }}</div>

          <div class="card-meta">
            <span>{{ openRange(lab) }}</span>
            <span>·</span>
            <span>限 {{ lab.capacity }} 人</span>
            <span>·</span>
            <span>提前 {{ lab.advance_days }} 天</span>
          </div>

          <div class="card-foot">
            <van-tag v-if="lab.approval_level > 0" type="warning" plain>
              {{ APPROVAL_TEXT[lab.approval_level] }}
            </van-tag>
            <van-tag v-else type="success" plain>提交即生效</van-tag>
            <span v-if="lab.device_count > 0" class="card-devices">
              {{ lab.device_count }} 台设备
            </span>
          </div>
        </div>
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

.lab-table :deep(.el-table__row) {
  cursor: pointer;
}

.need-approval {
  color: #e6a23c;
}

/* ---------- 移动端 ---------- */
.mobile-wrap {
  margin: -12px;
}

.card-list {
  padding: 12px;
}

.lab-card {
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.lab-card:active {
  background: #fafafa;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-name {
  font-size: 16px;
  font-weight: 600;
  color: #323233;
}

.card-loc {
  margin-bottom: 8px;
  font-size: 13px;
  color: #969799;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #646566;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-devices {
  font-size: 12px;
  color: #969799;
}
</style>
