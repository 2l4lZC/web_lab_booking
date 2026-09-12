<script setup>
/**
 * 阶段占位页。
 * 明写「规划包含什么」而不是留一句「建设中」——
 * 这样翻到这一页时能立刻确认功能边界，而不是猜。
 */
defineProps({
  title: { type: String, required: true },
  stage: { type: String, default: '待实现' },
  features: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="page-card">
    <h3 class="page-title">{{ title }}</h3>

    <div class="ph-box">
      <span class="ph-stage">{{ stage }}</span>
      <p class="ph-text">该页面规划包含：</p>
      <ul class="ph-list">
        <li v-for="f in features" :key="f">{{ f }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.ph-box {
  padding: 20px;
  background: #fafafa;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
}

.ph-stage {
  display: inline-block;
  padding: 2px 8px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #409eff;
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 4px;
}

.ph-text {
  margin: 0 0 8px;
  font-size: 13px;
  color: #909399;
}

.ph-list {
  padding-left: 20px;
  margin: 0;
}

.ph-list li {
  margin-bottom: 6px;
  font-size: 14px;
  line-height: 1.6;
  color: #606266;
}
</style>
