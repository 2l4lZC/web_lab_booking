<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { adminReview, getPendingApprovals, teacherReview } from '@/api/approval'
import { useAuthStore } from '@/stores/auth'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNotify } from '@/composables/useNotify'

const auth = useAuthStore()
const { isMobile } = useBreakpoint()
const notify = useNotify()

const list = ref([])
const loading = ref(true)
const submitting = ref(false)

const isAdmin = computed(() => auth.role === 'admin')
const GRADE_TEXT = { undergrad: '本科生', master: '研究生', phd: '博士生' }
const hhmm = (t) => String(t).slice(0, 5)

/**
 * 教师和管理员走同一个列表接口，由后端按角色返回不同范围：
 *   教师 → 自己指导学生的待审批
 *   管理员 → 教师已放行、等自己确认的
 */
const pageHint = computed(() =>
  isAdmin.value ? '以下预约已通过指导教师审核，等待您确认' : '以下预约来自您指导的学生'
)

const dialog = reactive({ show: false, action: 'approve', row: null, comment: '' })

function openDialog(row, action) {
  dialog.row = row
  dialog.action = action
  dialog.comment = ''
  dialog.show = true
}

async function submitReview() {
  if (dialog.action === 'reject' && !dialog.comment.trim()) {
    notify('驳回时请填写理由，便于学生了解原因', 'warning')
    return
  }

  submitting.value = true
  try {
    const fn = isAdmin.value ? adminReview : teacherReview
    const res = await fn(dialog.row.id, dialog.action, dialog.comment.trim())
    notify(res.message || '操作成功')
    dialog.show = false
    await load()
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    submitting.value = false
  }
}

async function load() {
  loading.value = true
  try {
    list.value = await getPendingApprovals()
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="approval-list">
    <!-- ================= PC 端 ================= -->
    <div v-if="!isMobile" class="page-card">
      <div class="list-head">
        <h3 class="page-title">待我审批</h3>
        <span class="head-hint">{{ pageHint }}　共 {{ list.length }} 条</span>
      </div>

      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="user_name" label="申请人" width="100">
          <template #default="{ row }">
            {{ row.user_name }}
            <div class="sub">{{ row.username }}</div>
          </template>
        </el-table-column>
        <el-table-column label="学历" width="90">
          <template #default="{ row }">{{ GRADE_TEXT[row.user_grade] || '-' }}</template>
        </el-table-column>
        <el-table-column prop="lab_name" label="实验室" min-width="130" />
        <el-table-column label="日期" width="110" prop="reserve_date" />
        <el-table-column label="时间段" width="130">
          <template #default="{ row }">{{ hhmm(row.start_time) }}-{{ hhmm(row.end_time) }}</template>
        </el-table-column>
        <el-table-column label="人数" width="70" align="center" prop="people_count" />
        <el-table-column prop="purpose" label="使用目的" min-width="160" show-overflow-tooltip />
        <el-table-column v-if="isAdmin" label="指导教师" width="110">
          <template #default="{ row }">
            {{ row.teacher_name || '-' }}
            <div v-if="row.teacher_comment" class="sub">{{ row.teacher_comment }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="success" size="small" @click="openDialog(row, 'approve')">通过</el-button>
            <el-button type="danger" size="small" plain @click="openDialog(row, 'reject')">驳回</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-tip">暂无待审批的预约</div>
        </template>
      </el-table>
    </div>

    <!-- ================= 移动端 ================= -->
    <div v-else class="mobile-wrap">
      <div class="m-hint">{{ pageHint }}</div>

      <div v-if="loading" class="empty-tip">加载中...</div>
      <div v-else-if="list.length === 0" class="empty-tip">暂无待审批的预约</div>

      <div v-else class="card-list">
        <div v-for="row in list" :key="row.id" class="ap-card">
          <div class="card-top">
            <span class="card-name">{{ row.user_name }}</span>
            <span class="card-grade">{{ GRADE_TEXT[row.user_grade] }}</span>
          </div>

          <div class="card-lab">{{ row.lab_name }}</div>
          <div class="card-time">
            {{ row.reserve_date }}　{{ hhmm(row.start_time) }}-{{ hhmm(row.end_time) }}　{{ row.people_count }} 人
          </div>
          <div v-if="row.purpose" class="card-purpose">用途：{{ row.purpose }}</div>
          <div v-if="isAdmin && row.teacher_name" class="card-teacher">
            指导教师 {{ row.teacher_name }}
            <span v-if="row.teacher_comment">：{{ row.teacher_comment }}</span>
          </div>

          <div class="card-actions">
            <van-button size="small" round type="success" @click="openDialog(row, 'approve')">
              通过
            </van-button>
            <van-button size="small" round plain type="danger" @click="openDialog(row, 'reject')">
              驳回
            </van-button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= 审批弹窗（双端共用） ================= -->
    <div v-if="dialog.show" class="dlg-mask" @click.self="dialog.show = false">
      <div class="dlg-box">
        <h4 class="dlg-title">
          {{ dialog.action === 'approve' ? '通过审批' : '驳回预约' }}
        </h4>
        <p class="dlg-sub">
          {{ dialog.row?.user_name }} · {{ dialog.row?.lab_name }}<br />
          {{ dialog.row?.reserve_date }}　{{ hhmm(dialog.row?.start_time) }}-{{ hhmm(dialog.row?.end_time) }}
        </p>

        <textarea
          v-model="dialog.comment"
          class="dlg-input"
          rows="3"
          maxlength="255"
          :placeholder="dialog.action === 'approve' ? '审批意见（选填）' : '请说明驳回理由（必填）'"
        />

        <div class="dlg-actions">
          <button class="dlg-btn" @click="dialog.show = false">取消</button>
          <button
            class="dlg-btn primary"
            :class="{ danger: dialog.action === 'reject' }"
            :disabled="submitting"
            @click="submitReview"
          >
            {{ submitting ? '提交中...' : '确定' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}

.list-head .page-title {
  margin: 0;
}

.head-hint {
  font-size: 13px;
  color: #909399;
}

.sub {
  font-size: 12px;
  color: #a8abb2;
}

/* ---------- 移动端 ---------- */
.mobile-wrap {
  margin: -12px;
}

.m-hint {
  padding: 12px 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #969799;
  background: #fff;
}

.card-list {
  padding: 12px;
}

.ap-card {
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
  margin-bottom: 8px;
}

.card-name {
  font-size: 16px;
  font-weight: 600;
}

.card-grade {
  font-size: 12px;
  color: #969799;
}

.card-lab {
  margin-bottom: 6px;
  font-size: 14px;
  color: #323233;
}

.card-time {
  margin-bottom: 8px;
  font-size: 13px;
  color: #646566;
}

.card-purpose {
  margin-bottom: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #646566;
}

.card-teacher {
  margin-bottom: 6px;
  font-size: 12px;
  color: #969799;
}

.card-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 12px;
}

/* ---------- 审批弹窗 ---------- */
.dlg-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
}

.dlg-box {
  width: 100%;
  max-width: 420px;
  padding: 22px;
  background: #fff;
  border-radius: 12px;
}

.dlg-title {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
}

.dlg-sub {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
  color: #909399;
}

.dlg-input {
  width: 100%;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 14px;
  color: #303133;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  resize: vertical;
  outline: none;
}

.dlg-input:focus {
  border-color: #409eff;
}

.dlg-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 18px;
}

.dlg-btn {
  padding: 8px 22px;
  font-size: 14px;
  color: #606266;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
}

.dlg-btn.primary {
  color: #fff;
  background: #409eff;
  border-color: #409eff;
}

.dlg-btn.primary.danger {
  background: #f56c6c;
  border-color: #f56c6c;
}

.dlg-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
