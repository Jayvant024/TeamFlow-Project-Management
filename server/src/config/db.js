const mysql = require('mysql2/promise')
const fs = require('node:fs')
const path = require('node:path')

const caPath = process.env.DB_SSL_CA_PATH
if (!caPath) {
  throw new Error('Missing DB_SSL_CA_PATH. Set it to the Aiven CA certificate file.')
}

const ca = fs.readFileSync(path.resolve(__dirname, '..', '..', caPath), 'utf8')
const port = Number(process.env.DB_PORT)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DB_PORT must be a valid TCP port.')
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    ca,
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
})

module.exports = pool
