<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { createLab, deleteLab, getLabs, updateLab } from '@/api/lab'
import { createDevice, deleteDevice, getDevices, updateDevice } from '@/api/device'
import { useNotify } from '@/composables/useNotify'

const notify = useNotify()

const labs = ref([])
const loading = ref(true)
const saving = ref(false)

const TYPE_OPTIONS = [
  { value: 'normal', label: '普通' },
  { value: 'advanced', label: '高级' },
  { value: 'equipment', label: '设备型' },
]
const GRADE_OPTIONS = [
  { value: 'undergrad', label: '本科生' },
  { value: 'master', label: '研究生' },
  { value: 'phd', label: '博士生' },
]
const APPROVAL_OPTIONS = [
  { value: 0, label: '无需审批' },
  { value: 1, label: '教师审核' },
  { value: 2, label: '教师 + 管理员' },
]
const DEVICE_STATUS = [
  { value: 'available', label: '可用' },
  { value: 'in_use', label: '使用中' },
  { value: 'maintenance', label: '维护中' },
  { value: 'broken', label: '已损坏' },
]

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t.label]))
const GRADE_LABELS = Object.fromEntries(GRADE_OPTIONS.map((g) => [g.value, g.label]))
const APPROVAL_LABELS = Object.fromEntries(APPROVAL_OPTIONS.map((a) => [a.value, a.label]))
const DEVICE_STATUS_LABELS = Object.fromEntries(DEVICE_STATUS.map((s) => [s.value, s.label]))
const DEVICE_STATUS_TAG = {
  available: 'success',
  in_use: 'warning',
  maintenance: 'info',
  broken: 'danger',
}

const hhmm = (t) => String(t ?? '').slice(0, 5)

// ---------------- 实验室表单 ----------------
const labDialog = reactive({ show: false, isEdit: false, id: null })
const labForm = reactive({
  name: '',
  type: 'normal',
  location: '',
  open_time: '08:00',
  close_time: '22:00',
  capacity: 20,
  advance_days: 3,
  min_duration: 1,
  approval_level: 0,
  min_grade: 'undergrad',
  description: '',
  status: 1,
})

function resetLabForm() {
  Object.assign(labForm, {
    name: '',
    type: 'normal',
    location: '',
    open_time: '08:00',
    close_time: '22:00',
    capacity: 20,
    advance_days: 3,
    min_duration: 1,
    approval_level: 0,
    min_grade: 'undergrad',
    description: '',
    status: 1,
  })
}

function openCreateLab() {
  resetLabForm()
  labDialog.isEdit = false
  labDialog.id = null
  labDialog.show = true
}

function openEditLab(row) {
  Object.assign(labForm, {
    name: row.name,
    type: row.type,
    location: row.location ?? '',
    open_time: hhmm(row.open_time),
    close_time: hhmm(row.close_time),
    capacity: row.capacity,
    advance_days: row.advance_days,
    min_duration: row.min_duration,
    approval_level: row.approval_level,
    min_grade: row.min_grade,
    description: row.description ?? '',
    status: row.status,
  })
  labDialog.isEdit = true
  labDialog.id = row.id
  labDialog.show = true
}

async function saveLab() {
  if (!labForm.name.trim()) {
    notify('请填写实验室名称', 'warning')
    return
  }
  saving.value = true
  try {
    const payload = { ...labForm }
    const res = labDialog.isEdit
      ? await updateLab(labDialog.id, payload)
      : await createLab(payload)
    notify(`实验室「${res.name}」已${labDialog.isEdit ? '更新' : '创建'}`)
    labDialog.show = false
    await load()
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function removeLab(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除实验室「${row.name}」吗？此操作不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    const res = await deleteLab(row.id)
    notify(`实验室「${res.name}」已删除`)
    await load()
  } catch (err) {
    // 有预约记录时后端会拒绝并说明原因，原样展示
    notify(err.message, 'error')
  }
}

async function toggleStatus(row) {
  const next = row.status === 1 ? 0 : 1
  try {
    await updateLab(row.id, {
      ...row,
      open_time: hhmm(row.open_time),
      close_time: hhmm(row.close_time),
      status: next,
    })
    notify(next === 1 ? '已启用' : '已停用')
    await load()
  } catch (err) {
    notify(err.message, 'error')
  }
}

// ---------------- 设备抽屉 ----------------
const drawer = reactive({ show: false, lab: null })
const devices = ref([])
const devicesLoading = ref(false)

const deviceDialog = reactive({ show: false, isEdit: false, id: null })
const deviceForm = reactive({
  name: '',
  model: '',
  status: 'available',
  min_grade: 'undergrad',
  need_approval: 0,
  requirement: '',
})

function resetDeviceForm() {
  Object.assign(deviceForm, {
    name: '',
    model: '',
    status: 'available',
    min_grade: 'undergrad',
    need_approval: 0,
    requirement: '',
  })
}

async function openDevices(row) {
  drawer.lab = row
  drawer.show = true
  await loadDevices()
}

async function loadDevices() {
  devicesLoading.value = true
  try {
    devices.value = await getDevices({ lab_id: drawer.lab.id })
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    devicesLoading.value = false
  }
}

function openCreateDevice() {
  resetDeviceForm()
  deviceDialog.isEdit = false
  deviceDialog.id = null
  deviceDialog.show = true
}

function openEditDevice(row) {
  Object.assign(deviceForm, {
    name: row.name,
    model: row.model ?? '',
    status: row.status,
    min_grade: row.min_grade,
    need_approval: row.need_approval,
    requirement: row.requirement ?? '',
  })
  deviceDialog.isEdit = true
  deviceDialog.id = row.id
  deviceDialog.show = true
}

async function saveDevice() {
  if (!deviceForm.name.trim()) {
    notify('请填写设备名称', 'warning')
    return
  }
  saving.value = true
  try {
    const payload = { ...deviceForm, lab_id: drawer.lab.id }
    deviceDialog.isEdit
      ? await updateDevice(deviceDialog.id, payload)
      : await createDevice(payload)
    notify(deviceDialog.isEdit ? '设备已更新' : '设备已创建')
    deviceDialog.show = false
    await loadDevices()
    await load()
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function removeDevice(row) {
  try {
    await ElMessageBox.confirm(`确定删除设备「${row.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteDevice(row.id)
    notify('设备已删除')
    await loadDevices()
    await load()
  } catch (err) {
    notify(err.message, 'error')
  }
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
  <div class="lab-manage">
    <div class="page-card">
      <div class="head">
        <h3 class="page-title">实验室管理</h3>
        <el-button type="primary" @click="openCreateLab">新建实验室</el-button>
      </div>

      <el-table v-loading="loading" :data="labs" stripe>
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ TYPE_LABELS[row.type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" min-width="120" />
        <el-table-column label="开放时间" width="125">
          <template #default="{ row }">{{ hhmm(row.open_time) }}-{{ hhmm(row.close_time) }}</template>
        </el-table-column>
        <el-table-column label="容量" width="70" align="center" prop="capacity" />
        <el-table-column label="提前" width="70" align="center">
          <template #default="{ row }">{{ row.advance_days }}天</template>
        </el-table-column>
        <el-table-column label="最短" width="70" align="center">
          <template #default="{ row }">{{ row.min_duration }}h</template>
        </el-table-column>
        <el-table-column label="审批" width="110">
          <template #default="{ row }">
            <span :class="{ warn: row.approval_level > 0 }">
              {{ APPROVAL_LABELS[row.approval_level] }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="学历" width="80">
          <template #default="{ row }">{{ GRADE_LABELS[row.min_grade] }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '开放' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDevices(row)">
              设备({{ row.device_count }})
            </el-button>
            <el-button link type="primary" @click="openEditLab(row)">编辑</el-button>
            <el-button link :type="row.status === 1 ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
            <el-button link type="danger" @click="removeLab(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-tip">暂无实验室</div>
        </template>
      </el-table>
    </div>

    <!-- ============ 实验室表单 ============ -->
    <el-dialog
      v-model="labDialog.show"
      :title="labDialog.isEdit ? '编辑实验室' : '新建实验室'"
      width="640px"
      class="form-dialog"
    >
      <el-form :model="labForm" label-width="110px">
        <el-form-item label="名称" required>
          <el-input v-model="labForm.name" maxlength="100" placeholder="如：人工智能实验室" />
        </el-form-item>

        <el-form-item label="类型">
          <el-select v-model="labForm.type" style="width: 100%">
            <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="位置">
          <el-input v-model="labForm.location" maxlength="100" placeholder="如：实验楼 4F-402" />
        </el-form-item>

        <el-form-item label="开放时间">
          <div class="time-range">
            <el-time-select v-model="labForm.open_time" start="06:00" step="00:30" end="23:30" placeholder="开始" />
            <span class="sep">至</span>
            <el-time-select v-model="labForm.close_time" start="06:00" step="00:30" end="23:30" placeholder="结束" />
          </div>
        </el-form-item>

        <el-form-item label="容纳人数">
          <el-input-number v-model="labForm.capacity" :min="1" :max="999" />
          <span class="hint">同一时段内所有人数的上限</span>
        </el-form-item>

        <el-form-item label="可提前预约">
          <el-input-number v-model="labForm.advance_days" :min="0" :max="30" />
          <span class="hint">天</span>
        </el-form-item>

        <el-form-item label="最短时长">
          <el-input-number v-model="labForm.min_duration" :min="1" :max="12" />
          <span class="hint">小时</span>
        </el-form-item>

        <el-form-item label="审批级别">
          <el-select v-model="labForm.approval_level" style="width: 100%">
            <el-option v-for="a in APPROVAL_OPTIONS" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="最低学历">
          <el-select v-model="labForm.min_grade" style="width: 100%">
            <el-option v-for="g in GRADE_OPTIONS" :key="g.value" :label="g.label" :value="g.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="描述">
          <el-input v-model="labForm.description" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </el-form-item>

        <el-form-item label="状态">
          <el-switch v-model="labForm.status" :active-value="1" :inactive-value="0" active-text="开放" inactive-text="停用" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="labDialog.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveLab">
          {{ labDialog.isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 设备抽屉 ============ -->
    <el-drawer v-model="drawer.show" :title="`设备管理 · ${drawer.lab?.name ?? ''}`" size="720px">
      <div class="drawer-head">
        <el-button type="primary" size="small" @click="openCreateDevice">新增设备</el-button>
      </div>

      <el-table v-loading="devicesLoading" :data="devices" stripe>
        <el-table-column prop="name" label="名称" min-width="130" />
        <el-table-column prop="model" label="型号" min-width="110" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="DEVICE_STATUS_TAG[row.status]" size="small">
              {{ DEVICE_STATUS_LABELS[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="学历" width="80">
          <template #default="{ row }">{{ GRADE_LABELS[row.min_grade] }}</template>
        </el-table-column>
        <el-table-column label="需审批" width="80" align="center">
          <template #default="{ row }">{{ row.need_approval ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column prop="requirement" label="使用要求" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditDevice(row)">编辑</el-button>
            <el-button link type="danger" @click="removeDevice(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-tip">该实验室暂无设备</div>
        </template>
      </el-table>
    </el-drawer>

    <!-- ============ 设备表单 ============ -->
    <el-dialog
      v-model="deviceDialog.show"
      :title="deviceDialog.isEdit ? '编辑设备' : '新增设备'"
      width="520px"
      append-to-body
    >
      <el-form :model="deviceForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="deviceForm.name" maxlength="100" placeholder="如：高性能GPU服务器" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="deviceForm.model" maxlength="100" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="deviceForm.status" style="width: 100%">
            <el-option v-for="s in DEVICE_STATUS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="最低学历">
          <el-select v-model="deviceForm.min_grade" style="width: 100%">
            <el-option v-for="g in GRADE_OPTIONS" :key="g.value" :label="g.label" :value="g.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="需要审批">
          <el-switch v-model="deviceForm.need_approval" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="使用要求">
          <el-input v-model="deviceForm.requirement" type="textarea" :rows="2" maxlength="255" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="deviceDialog.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDevice">
          {{ deviceDialog.isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.head .page-title {
  margin: 0;
}

.warn {
  color: #e6a23c;
}

.hint {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.time-range {
  display: flex;
  align-items: center;
}

.sep {
  margin: 0 10px;
  color: #909399;
}

.drawer-head {
  margin-bottom: 14px;
}

/*
 * 管理端以 PC 为主（架构设计如此），移动端只保证「能用」：
 * 弹窗全屏、表格可横滑，不做额外的卡片化改造。
 */
@media (max-width: 767px) {
  .lab-manage {
    margin: -12px;
  }

  .lab-manage .page-card {
    border-radius: 0;
    padding: 12px;
    overflow-x: auto;
  }

  .time-range {
    flex-wrap: wrap;
    gap: 8px;
  }
}

:deep(.form-dialog) {
  max-width: 94vw;
}

:deep(.el-drawer) {
  max-width: 96vw;
}
</style>
