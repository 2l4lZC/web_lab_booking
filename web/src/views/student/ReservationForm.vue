<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLabDetail, getLabs } from '@/api/lab'
import { createReservation } from '@/api/reservation'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNotify } from '@/composables/useNotify'

const route = useRoute()
const router = useRouter()
const { isMobile } = useBreakpoint()
const notify = useNotify()

const labs = ref([])
const lab = ref(null)
const submitting = ref(false)
const loading = ref(true)

const form = reactive({
  lab_id: null,
  reserve_date: '',
  start_time: '',
  end_time: '',
  people_count: 1,
  purpose: '',
  device_ids: [],
})

const GRADE_TEXT = { undergrad: '本科生', master: '研究生', phd: '博士生' }

// ---------- 时间工具 ----------
const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}
const minLabel = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const hhmm = (t) => String(t).slice(0, 5)

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 时间选项按 30 分钟粒度从实验室开放时间里生成 ——
 * 前端不自己发明规则，能选的范围一律由实验室配置推导
 */
const timeOptions = computed(() => {
  if (!lab.value) return []
  const open = toMin(lab.value.open_time)
  const close = toMin(lab.value.close_time)
  const opts = []
  for (let m = open; m <= close; m += 30) opts.push(minLabel(m))
  return opts
})

const endOptions = computed(() => {
  if (!form.start_time) return timeOptions.value
  const start = toMin(form.start_time)
  return timeOptions.value.filter((t) => toMin(t) > start)
})

const dateOptions = computed(() => {
  if (!lab.value) return []
  const base = new Date()
  const opts = []
  for (let i = 0; i <= lab.value.advance_days; i++) {
    const d = new Date(base.getTime() + i * 86400000)
    opts.push({
      value: fmtDate(d),
      label:
        i === 0 ? '今天' : i === 1 ? '明天' : `${d.getMonth() + 1}月${d.getDate()}日`,
    })
  }
  return opts
})

const durationHours = computed(() => {
  if (!form.start_time || !form.end_time) return 0
  return (toMin(form.end_time) - toMin(form.start_time)) / 60
})

// 开始时间变化后，若结束时间不再合法就清掉
watch(
  () => form.start_time,
  () => {
    if (form.end_time && toMin(form.end_time) <= toMin(form.start_time)) {
      form.end_time = ''
    }
  }
)

watch(
  () => form.lab_id,
  async (id) => {
    if (!id) {
      lab.value = null
      return
    }
    try {
      lab.value = await getLabDetail(id)
      form.device_ids = []
      if (!form.reserve_date) form.reserve_date = dateOptions.value[0]?.value || ''
    } catch (err) {
      notify(err.message, 'error')
    }
  }
)

// ---------- 提交 ----------
function validate() {
  if (!form.lab_id) return '请选择实验室'
  if (!form.reserve_date) return '请选择日期'
  if (!form.start_time || !form.end_time) return '请选择开始和结束时间'
  if (toMin(form.end_time) <= toMin(form.start_time)) return '结束时间必须晚于开始时间'
  if (durationHours.value < (lab.value?.min_duration ?? 1)) {
    return `该实验室最短预约 ${lab.value?.min_duration} 小时`
  }
  if (!form.people_count || form.people_count < 1) return '使用人数至少为 1'
  return null
}

async function handleSubmit() {
  const error = validate()
  if (error) {
    notify(error, 'warning')
    return
  }

  submitting.value = true
  try {
    const res = await createReservation({
      lab_id: form.lab_id,
      reserve_date: form.reserve_date,
      start_time: form.start_time,
      end_time: form.end_time,
      people_count: Number(form.people_count),
      purpose: form.purpose,
      device_ids: form.device_ids,
    })
    notify(res.message || '提交成功')
    router.replace('/my/reservations')
  } catch (err) {
    // 后端的冲突提示是权威结论，原样展示
    notify(err.message, 'error')
  } finally {
    submitting.value = false
  }
}

// ---------- 移动端选择器状态 ----------
const picker = reactive({ show: false, field: '', title: '', columns: [] })

function openPicker(field, title, columns) {
  picker.field = field
  picker.title = title
  picker.columns = columns.map((c) => (typeof c === 'string' ? { text: c, value: c } : c))
  picker.show = true
}

function onPickerConfirm({ selectedOptions }) {
  const value = selectedOptions[0]?.value
  if (picker.field === 'lab_id') form.lab_id = Number(value)
  else if (picker.field) form[picker.field] = value
  picker.show = false
}

const pickerText = (field, fallback) => {
  const v = form[field]
  if (!v) return fallback
  if (field === 'lab_id') return labs.value.find((l) => l.id === v)?.name || fallback
  if (field === 'reserve_date') {
    return dateOptions.value.find((d) => d.value === v)?.label || v
  }
  return v
}

onMounted(async () => {
  try {
    labs.value = await getLabs()
    // 从实验室详情页跳过来时带着参数，直接预填，省一步操作
    const q = route.query
    if (q.lab) form.lab_id = Number(q.lab)
    else if (labs.value.length === 1) form.lab_id = labs.value[0].id
    if (q.date) form.reserve_date = q.date
    if (q.start) form.start_time = q.start
    if (q.end) form.end_time = q.end
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-loading="loading" class="reserve-form">
    <!-- ================= PC 端 ================= -->
    <div v-if="!isMobile" class="page-card">
      <h3 class="page-title">提交预约</h3>

      <el-form :model="form" label-width="100px" class="pc-form">
        <el-form-item label="实验室" required>
          <el-select v-model="form.lab_id" placeholder="请选择实验室" style="width: 320px">
            <el-option v-for="l in labs" :key="l.id" :label="l.name" :value="l.id" />
          </el-select>
          <span v-if="lab" class="hint">
            {{ hhmm(lab.open_time) }}-{{ hhmm(lab.close_time) }} ·
            限 {{ lab.capacity }} 人 · 最短 {{ lab.min_duration }} 小时
          </span>
        </el-form-item>

        <el-form-item label="使用日期" required>
          <el-select v-model="form.reserve_date" style="width: 200px">
            <el-option v-for="d in dateOptions" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="时间段" required>
          <el-select v-model="form.start_time" placeholder="开始" style="width: 130px">
            <el-option v-for="t in timeOptions" :key="t" :label="t" :value="t" />
          </el-select>
          <span class="sep">至</span>
          <el-select v-model="form.end_time" placeholder="结束" style="width: 130px">
            <el-option v-for="t in endOptions" :key="t" :label="t" :value="t" />
          </el-select>
          <span v-if="durationHours > 0" class="hint">共 {{ durationHours }} 小时</span>
        </el-form-item>

        <el-form-item label="使用人数" required>
          <el-input-number v-model="form.people_count" :min="1" :max="lab?.capacity || 50" />
          <span v-if="lab" class="hint">该实验室单时段最多 {{ lab.capacity }} 人</span>
        </el-form-item>

        <el-form-item v-if="lab?.devices?.length" label="所需设备">
          <el-checkbox-group v-model="form.device_ids">
            <el-checkbox v-for="d in lab.devices" :key="d.id" :value="d.id" :disabled="d.status !== 'available'">
              {{ d.name }}
              <span class="device-note">（{{ GRADE_TEXT[d.min_grade] }}起）</span>
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="使用目的">
          <el-input
            v-model="form.purpose"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            placeholder="简要说明本次使用目的，便于审批"
            style="max-width: 480px"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">提交预约</el-button>
          <el-button @click="router.back()">返回</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- ================= 移动端 ================= -->
    <div v-else class="mobile-form">
      <van-cell-group inset>
        <van-field
          :model-value="pickerText('lab_id', '请选择实验室')"
          label="实验室"
          readonly
          is-link
          @click="openPicker('lab_id', '选择实验室', labs.map((l) => ({ text: l.name, value: l.id })))"
        />
        <van-field
          :model-value="pickerText('reserve_date', '请选择日期')"
          label="使用日期"
          readonly
          is-link
          @click="openPicker('reserve_date', '选择日期', dateOptions)"
        />
        <van-field
          :model-value="form.start_time"
          label="开始时间"
          placeholder="请选择"
          readonly
          is-link
          @click="openPicker('start_time', '开始时间', timeOptions)"
        />
        <van-field
          :model-value="form.end_time"
          label="结束时间"
          placeholder="请选择"
          readonly
          is-link
          @click="openPicker('end_time', '结束时间', endOptions)"
        />
        <van-field v-model="form.people_count" label="使用人数" type="digit" />
        <van-field
          v-model="form.purpose"
          label="使用目的"
          type="textarea"
          rows="3"
          maxlength="255"
          show-word-limit
          placeholder="简要说明使用目的"
        />
      </van-cell-group>

      <div v-if="lab" class="m-summary">
        {{ lab.name }} · 开放 {{ hhmm(lab.open_time) }}-{{ hhmm(lab.close_time) }} ·
        限 {{ lab.capacity }} 人 · 最短 {{ lab.min_duration }} 小时
      </div>

      <div v-if="lab?.devices?.length" class="m-devices">
        <div class="m-devices-title">所需设备（可选）</div>
        <van-checkbox-group v-model="form.device_ids">
          <van-checkbox
            v-for="d in lab.devices"
            :key="d.id"
            :name="d.id"
            :disabled="d.status !== 'available'"
            class="m-device-item"
          >
            {{ d.name }}（{{ GRADE_TEXT[d.min_grade] }}起）
          </van-checkbox>
        </van-checkbox-group>
      </div>

      <div class="m-submit">
        <van-button round block type="primary" :loading="submitting" @click="handleSubmit">
          提交预约
        </van-button>
      </div>

      <van-popup v-model:show="picker.show" position="bottom" round>
        <van-picker
          :title="picker.title"
          :columns="picker.columns"
          @confirm="onPickerConfirm"
          @cancel="picker.show = false"
        />
      </van-popup>
    </div>
  </div>
</template>

<style scoped>
.pc-form {
  max-width: 720px;
}

.sep {
  margin: 0 10px;
  color: #909399;
}

.hint {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}

.device-note {
  color: #a8abb2;
  font-size: 12px;
}

/* ---------- 移动端 ---------- */
.mobile-form {
  margin: -12px;
}

.m-summary {
  padding: 12px 20px;
  font-size: 12px;
  line-height: 1.6;
  color: #969799;
}

.m-devices {
  padding: 12px 20px;
  background: #fff;
}

.m-devices-title {
  margin-bottom: 10px;
  font-size: 14px;
  color: #323233;
}

.m-device-item {
  margin-bottom: 12px;
}

.m-submit {
  padding: 20px 16px calc(20px + var(--safe-area-bottom));
}
</style>
