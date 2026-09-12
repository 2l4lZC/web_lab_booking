import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

// 两个组件库的样式全量引入，组件本体仍按需自动导入。
// 全量 CSS 换来的是「样式不会莫名其妙丢失」—— showToast 这类
// 函数式 API 的样式没法被 resolver 追踪，按需引入时最容易踩坑。
import 'element-plus/dist/index.css'
import 'vant/lib/index.css'
import './styles/global.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')
