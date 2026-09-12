import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { testConnection } from './db.js'
import routes from './routes/index.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'
import { startNoShowScanner } from './jobs/noShowScanner.js'

const app = express()

app.use(cors({ origin: config.corsOrigin, credentials: true }))
app.use(express.json())

// 健康检查：部署后先用它确认服务活着、数据库通不通
app.get('/api/health', async (req, res) => {
  res.json({ code: 0, message: 'ok', data: { env: config.env } })
})

app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

// 先探数据库再监听端口：连不上就直接退出，
// 免得服务"看起来启动了"但每个请求都报 500
try {
  await testConnection()
  console.log(`[DB]   已连接 ${config.db.host}:${config.db.port}/${config.db.database}`)
} catch (err) {
  console.error(`[DB]   连接失败: ${err.message}`)
  console.error('       请确认 MySQL 已启动，且 server/.env 中的连接配置正确')
  process.exit(1)
}

app.listen(config.port, () => {
  console.log(`[HTTP] 服务已启动  http://localhost:${config.port}`)
  console.log(`[HTTP] 健康检查    http://localhost:${config.port}/api/health`)
  // 定时任务跟着服务一起起，只在这一个进程里跑
  startNoShowScanner()
})
