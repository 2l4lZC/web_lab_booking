import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lab_booking',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_only_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}

// 兜底：部署到公网时如果忘了改密钥，直接拒绝启动而不是带病上线
if (config.env === 'production' && config.jwt.secret.startsWith('dev_only')) {
  throw new Error('生产环境必须通过环境变量设置 JWT_SECRET')
}
