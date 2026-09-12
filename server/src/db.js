import mysql from 'mysql2/promise'
import { config } from './config.js'

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  // 让 DATE / DATETIME 原样返回字符串，避免 JS Date 对象带来的时区偏移
  dateStrings: ['DATE', 'DATETIME'],
})

/** 普通查询：返回行数组 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

/** 查询单行，没有则返回 null */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params)
  return rows[0] ?? null
}

/**
 * 事务辅助 —— 预约冲突检测必须整体包在这里面。
 * 回调拿到的是同一个连接，所有语句都必须用 conn.query 执行，
 * 否则会跑到连接池的其他连接上，事务就失效了。
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/** 启动时探活 */
export async function testConnection() {
  const conn = await pool.getConnection()
  try {
    await conn.ping()
  } finally {
    conn.release()
  }
}
