<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import {
  createUser,
  getUserDetail,
  getTeachers,
  getUsers,
  revokeViolation,
  updateUser,
} from '@/api/user'
import { useNotify } from '@/composables/useNotify'

const notify = useNotify()

const list = ref([])
const total = ref(0)
const loading = ref(true)
const saving = ref(false)
const teachers = ref([])

const query = reactive({ role: '', keyword: '', page: 1, pageSize: 20 })

const ROLE_OPTIONS = [
  { value: 'student', label: '学生' },
  { value: 'teacher', label: '指导教师' },
  { value: 'admin', label: '管理员' },
]
const GRADE_OPTIONS = [
  { value: 'undergrad', label: '本科生' },
  { value: 'master', label: '研究生' },
  { value: 'phd', label: '博士生' },
]
const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]))
const GRADE_LABELS = Object.fromEntries(GRADE_OPTIONS.map((g) => [g.value, g.label]))
const ROLE_TAG = { student: 'primary', teacher: 'warning', admin: 'danger' }

const PERMISSION_TAG = { normal: 'success', restricted: 'warning', frozen: 'danger' }

const VIOLATION_LABELS = {
  no_show: '预约未签到',
  frequent_cancel: '频繁取消',
  other: '其他',
}

// ---------------- 用户表单 ----------------
const dialog = reactive({ show: false, isEdit: false, id: null })
const form = reactive({
  username: '',
  real_name: '',
  role: 'student',
  grade: 'undergrad',
  phone: '',
  college: '',
  advisor_id: null,
  status: 1,
  password: '',
})

function resetForm() {
  Object.assign(form, {
    username: '',
    real_name: '',
    role: 'student',
    grade: 'undergrad',
    phone: '',
    college: '',
    advisor_id: null,
    status: 1,
    password: '',
  })
}

function openCreate() {
  resetForm()
  dialog.isEdit = false
  dialog.id = null
  dialog.show = true
}

function openEdit(row) {
  Object.assign(form, {
    username: row.username,
    real_name: row.real_name,
    role: row.role,
    grade: row.grade ?? 'undergrad',
    phone: row.phone ?? '',
    college: row.college ?? '',
    advisor_id: row.advisor_id,
    status: row.status,
    password: '', // 留空表示不修改密码
  })
  dialog.isEdit = true
  dialog.id = row.id
  dialog.show = true
}

async function save() {
  if (!form.username.trim() || !form.real_name.trim()) {
    notify('账号和姓名不能为空', 'warning')
    return
  }
  if (!dialog.isEdit && form.password.length < 6) {
    notify('新建用户时必须设置不少于 6 位的初始密码', 'warning')
    return
  }

  saving.value = true
  try {
    const payload = { ...form }
    if (!payload.password) delete payload.password
    const res = dialog.isEdit
      ? await updateUser(dialog.id, payload)
      : await createUser(payload)
    notify(`用户「${res.real_name}」已${dialog.isEdit ? '更新' : '创建'}`)
    dialog.show = false
    await load()
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  try {
    await ElMessageBox.confirm(
      `确定${row.status === 1 ? '停用' : '启用'}「${row.real_name}」的账号吗？`,
      '确认',
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await updateUser(row.id, {
      username: row.username,
      real_name: row.real_name,
      role: row.role,
      grade: row.grade,
      phone: row.phone,
      college: row.college,
      advisor_id: row.advisor_id,
      status: row.status === 1 ? 0 : 1,
    })
    notify(row.status === 1 ? '账号已停用' : '账号已启用')
    await load()
  } catch (err) {
    notify(err.message, 'error')
  }
}

// ---------------- 违规详情 ----------------
const detail = reactive({ show: false, user: null, violations: [], permission: null })

async function openDetail(row) {
  try {
    const data = await getUserDetail(row.id)
    detail.user = data
    detail.violations = data.violations
    detail.permission = data.permission
    detail.show = true
  } catch (err) {
    notify(err.message, 'error')
  }
}

async function undoViolation(v) {
  try {
    await ElMessageBox.confirm(
      `确定撤销这条违规记录吗？\n\n${VIOLATION_LABELS[v.type]}：${v.remark || '无备注'}\n\n撤销后该用户的预约权限会自动恢复。`,
      '撤销违规',
      { type: 'warning', confirmButtonText: '撤销' }
    )
  } catch {
    return
  }
  try {
    await revokeViolation(v.id)
    notify('违规记录已撤销，权限自动恢复')
    await openDetail(detail.user)
    await load()
  } catch (err) {
    notify(err.message, 'error')
  }
}

async function load() {
  loading.value = true
  try {
    const res = await getUsers({
      role: query.role || undefined,
      keyword: query.keyword || undefined,
      page: query.page,
      pageSize: query.pageSize,
    })
    list.value = res.list
    total.value = res.total
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  load()
}

onMounted(async () => {
  await load()
  try {
    teachers.value = await getTeachers()
  } catch {
    // 教师列表拉不到不影响主流程
  }
})
</script>

<template>
  <div class="user-manage">
    <div class="page-card">
      <div class="head">
        <h3 class="page-title">用户管理</h3>
        <div class="head-actions">
          <el-select v-model="query.role" placeholder="全部角色" clearable style="width: 130px" @change="search">
            <el-option v-for="r in ROLE_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
          <el-input
            v-model="query.keyword"
            placeholder="搜索账号或姓名"
            clearable
            style="width: 200px"
            @keyup.enter="search"
            @clear="search"
          />
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="openCreate">新建用户</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="username" label="账号" width="110" />
        <el-table-column prop="real_name" label="姓名" width="110" />
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="ROLE_TAG[row.role]" size="small" effect="plain">
              {{ ROLE_LABELS[row.role] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="学历" width="80">
          <template #default="{ row }">{{ GRADE_LABELS[row.grade] || '-' }}</template>
        </el-table-column>
        <el-table-column prop="college" label="学院" min-width="120" />
        <el-table-column label="指导老师" width="100">
          <template #default="{ row }">{{ row.advisor_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="预约" width="70" align="center" prop="reservation_count" />
        <el-table-column label="违规" width="70" align="center">
          <template #default="{ row }">
            <span :class="{ danger: row.violation_count > 0 }">{{ row.violation_count }}</span>
          </template>
        </el-table-column>
        <el-table-column label="预约权限" width="110">
          <template #default="{ row }">
            <el-tag :type="PERMISSION_TAG[row.permission?.level]" size="small">
              {{ row.permission?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '正常' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">违规记录</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link :type="row.status === 1 ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-tip">没有符合条件的用户</div>
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          :page-size="query.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>

    <!-- ============ 用户表单 ============ -->
    <el-dialog
      v-model="dialog.show"
      :title="dialog.isEdit ? '编辑用户' : '新建用户'"
      width="560px"
      class="form-dialog"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="账号" required>
          <el-input v-model="form.username" maxlength="50" placeholder="学号或工号，字母数字下划线" />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="form.real_name" maxlength="50" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="r in ROLE_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.role === 'student'" label="学历" required>
          <el-select v-model="form.grade" style="width: 100%">
            <el-option v-for="g in GRADE_OPTIONS" :key="g.value" :label="g.label" :value="g.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.role === 'student'" label="指导老师">
          <el-select v-model="form.advisor_id" placeholder="不指定" clearable style="width: 100%">
            <el-option
              v-for="t in teachers"
              :key="t.id"
              :label="`${t.real_name}（${t.username}）`"
              :value="t.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="学院">
          <el-input v-model="form.college" maxlength="100" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" maxlength="20" />
        </el-form-item>
        <el-form-item :label="dialog.isEdit ? '重置密码' : '初始密码'" :required="!dialog.isEdit">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="dialog.isEdit ? '留空则不修改密码' : '不少于 6 位'"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="正常" inactive-text="停用" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialog.show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ dialog.isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 违规记录 ============ -->
    <el-dialog v-model="detail.show" title="违规记录" width="620px" class="form-dialog">
      <template v-if="detail.user">
        <el-descriptions :column="2" border size="small" class="detail-head">
          <el-descriptions-item label="姓名">{{ detail.user.real_name }}</el-descriptions-item>
          <el-descriptions-item label="账号">{{ detail.user.username }}</el-descriptions-item>
          <el-descriptions-item label="当前权限">
            <el-tag :type="PERMISSION_TAG[detail.permission?.level]" size="small">
              {{ detail.permission?.label }}
            </el-tag>
            <span class="perm-detail">{{ detail.permission?.detail }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="近 90 天违规">
            {{ detail.permission?.violationCount ?? 0 }} 次
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="detail.violations" size="small" stripe class="vio-table">
          <el-table-column label="类型" width="110">
            <template #default="{ row }">{{ VIOLATION_LABELS[row.type] || row.type }}</template>
          </el-table-column>
          <el-table-column prop="remark" label="说明" min-width="180" show-overflow-tooltip />
          <el-table-column prop="created_at" label="时间" width="150" />
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-button link type="danger" @click="undoViolation(row)">撤销</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-tip">该用户没有违规记录</div>
          </template>
        </el-table>

        <p class="tip">
          提示：撤销违规后，该用户的预约权限会自动恢复 —— 权限是按违规次数实时推导的，不是存死的字段。
        </p>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.head .page-title {
  margin: 0;
}

.head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.danger {
  color: #f56c6c;
  font-weight: 600;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-head {
  margin-bottom: 16px;
}

.perm-detail {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.vio-table {
  margin-bottom: 12px;
}

.tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #909399;
}

@media (max-width: 767px) {
  .user-manage {
    margin: -12px;
  }

  .user-manage .page-card {
    border-radius: 0;
    padding: 12px;
    overflow-x: auto;
  }

  .head-actions {
    width: 100%;
  }
}

:deep(.form-dialog) {
  max-width: 94vw;
}
</style>
