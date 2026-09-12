import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver, VantResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    vue(),
    // 自动导入 ElMessage / showToast 这类函数式 API
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: false,
    }),
    // 模板里写 <el-button> / <van-button> 时自动按需引入组件本体
    Components({
      resolvers: [
        ElementPlusResolver({ importStyle: false }),
        VantResolver({ importStyle: false }),
      ],
      dts: false,
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    // host: true 是手机真机联调的关键 —— 否则 Vite 只监听 localhost，
    // 同一 WiFi 下的手机访问不到
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  build: {
    // echarts（~500KB）和 Element Plus（~815KB）本身就有这么大，
    // 已经做了懒加载 + 独立分包，用户只在进入对应页面时才下载，
    // 且发版后能长期命中缓存。把阈值调高避免每次构建都刷警告。
    chunkSizeWarningLimit: 900,

    rollupOptions: {
      output: {
        // 把体积大的第三方库单独分包：它们很少变动，
        // 拆出来后用户浏览器能长期缓存，不用每次发版都重下
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts'
          if (id.includes('element-plus')) return 'vendor-element'
          if (id.includes('vant')) return 'vendor-vant'
          return 'vendor'
        },
      },
    },
  },
})
