<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNotify } from '@/composables/useNotify'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isMobile } = useBreakpoint()
const notify = useNotify()

const form = reactive({ username: '', password: '' })
const loading = ref(false)

const demoAccounts = [
  { label: '管理员', username: 'admin' },
  { label: '指导教师', username: 'T1001' },
  { label: '本科生', username: 'S2021001' },
  { label: '研究生', username: 'S2022001' },
]

function fillDemo(account) {
  form.username = account.username
  form.password = '123456'
}

async function handleSubmit() {
  if (!form.username || !form.password) {
    notify('请输入账号和密码', 'warning')
    return
  }

  loading.value = true
  try {
    const user = await auth.login({ ...form })
    notify(`欢迎回来，${user.realName}`)
    // 登录前想去哪就回哪，没有则回首页
    router.replace(route.query.redirect || '/')
  } catch (err) {
    notify(err.message, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 品牌介绍区：仅 PC 端展示，手机上横向空间不够，直接省略 -->
    <aside class="login-brand">
      <div class="brand-inner">
        <div class="brand-mark">LAB</div>
        <h1 class="brand-title">高校智能实验室<br />预约管理系统</h1>
        <p class="brand-desc">
          在线查看实验室开放时间、提交预约申请、跟踪审批进度，
          告别 Excel 登记与时间冲突。
        </p>
        <ul class="brand-features">
          <li>时段冲突与人数上限自动拦截</li>
          <li>指导教师 / 管理员两级审批</li>
          <li>扫码签到与违规权限管理</li>
        </ul>
      </div>
    </aside>

    <main class="login-main">
      <div class="login-card">
        <header class="login-head">
          <div class="login-logo-mobile">LAB</div>
          <h2>欢迎登录</h2>
          <p>请使用学号或工号登录</p>
        </header>

        <!-- 移动端：Vant 表单 -->
        <van-form v-if="isMobile" @submit="handleSubmit">
          <van-cell-group inset class="m-form-group">
            <van-field
              v-model="form.username"
              label="账号"
              placeholder="学号 / 工号"
              clearable
            />
            <van-field
              v-model="form.password"
              type="password"
              label="密码"
              placeholder="请输入密码"
            />
          </van-cell-group>
          <div class="m-submit">
            <van-button
              round
              block
              type="primary"
              native-type="submit"
              :loading="loading"
              loading-text="登录中..."
            >
              登 录
            </van-button>
          </div>
        </van-form>

        <!-- PC 端：Element Plus 表单 -->
        <el-form v-else :model="form" size="large" @submit.prevent="handleSubmit">
          <el-form-item>
            <el-input
              v-model="form.username"
              placeholder="学号 / 工号"
              :prefix-icon="User"
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleSubmit"
            />
          </el-form-item>
          <el-button
            type="primary"
            size="large"
            class="pc-submit"
            :loading="loading"
            @click="handleSubmit"
          >
            登 录
          </el-button>
        </el-form>

        <div class="login-demo">
          <div class="demo-title">演示账号（密码统一 123456）</div>
          <div class="demo-chips">
            <el-tag
              v-for="a in demoAccounts"
              :key="a.username"
              class="demo-chip"
              effect="plain"
              @click="fillDemo(a)"
            >
              {{ a.label }}
            </el-tag>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
}

/* ---------- 品牌区（PC） ---------- */
.login-brand {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: #fff;
  background: linear-gradient(135deg, #1f2d3d 0%, #2b4a6f 100%);
}

.brand-inner {
  max-width: 420px;
}

.brand-mark {
  display: inline-block;
  padding: 4px 10px;
  margin-bottom: 24px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
  background: #409eff;
  border-radius: 4px;
}

.brand-title {
  margin: 0 0 16px;
  font-size: 30px;
  line-height: 1.4;
  font-weight: 600;
}

.brand-desc {
  margin: 0 0 32px;
  font-size: 15px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.75);
}

.brand-features {
  padding: 0;
  margin: 0;
  list-style: none;
}

.brand-features li {
  position: relative;
  padding-left: 22px;
  margin-bottom: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.brand-features li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 6px;
  height: 6px;
  background: #409eff;
  border-radius: 50%;
}

/* ---------- 表单区 ---------- */
.login-main {
  flex: 0 0 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: #fff;
}

.login-card {
  width: 100%;
  max-width: 360px;
}

.login-head {
  margin-bottom: 28px;
}

.login-head h2 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.login-head p {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.login-logo-mobile {
  display: none;
}

.pc-submit {
  width: 100%;
  margin-top: 4px;
}

.login-demo {
  padding-top: 24px;
  margin-top: 28px;
  border-top: 1px dashed #e4e7ed;
}

.demo-title {
  margin-bottom: 12px;
  font-size: 12px;
  color: #909399;
}

.demo-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.demo-chip {
  cursor: pointer;
  transition: all 0.2s;
}

.demo-chip:hover {
  color: #fff;
  background: #409eff;
  border-color: #409eff;
}

.m-form-group {
  margin-bottom: 24px;
}

.m-submit {
  padding: 0 16px;
}

/* ---------- 移动端 ---------- */
@media (max-width: 767px) {
  .login-page {
    flex-direction: column;
  }

  /* 手机屏放不下左侧介绍，直接隐藏 */
  .login-brand {
    display: none;
  }

  .login-main {
    flex: 1;
    align-items: flex-start;
    padding: 0;
    padding-top: 12vh;
    background: #f7f8fa;
  }

  .login-card {
    max-width: 100%;
  }

  .login-head {
    padding: 0 20px;
    text-align: center;
  }

  /* 顶部补一个 logo，弥补品牌区被隐藏后的视觉空缺 */
  .login-logo-mobile {
    display: inline-block;
    padding: 4px 10px;
    margin-bottom: 20px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #fff;
    background: #409eff;
    border-radius: 4px;
  }

  .login-head h2 {
    font-size: 22px;
  }

  .login-demo {
    padding: 24px 20px 0;
    margin: 24px 20px 0;
  }

  .demo-chips {
    gap: 10px;
  }
}
</style>
