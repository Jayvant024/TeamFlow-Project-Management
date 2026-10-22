const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
const http = require('http')
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const pool = require('./config/db')
const authRoutes = require('./routes/auth')
const projectRoutes = require('./routes/projects')
const taskRoutes = require('./routes/tasks')
const userRoutes = require('./routes/users')
const notificationRoutes = require('./routes/notifications')
const { notFound, validateJsonBody, errorHandler } = require('./middleware/errors')
const { requireProjectMember } = require('./utils')
const { Server } = require('socket.io')

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('replace-') || process.env.JWT_SECRET.length < 32 ||
  !process.env.DB_HOST || !process.env.DB_PORT || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error('Missing required configuration. Copy server/.env.example to server/.env and configure it.')
}

const app = express()
const server = http.createServer(app)
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim())
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE'] } })
app.set('io', io)
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '1mb' }))
app.use(validateJsonBody)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/users', userRoutes)
app.use('/api/notifications', notificationRoutes)
app.use(notFound)
app.use(errorHandler)

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token
  if (!token) return next(new Error('Authentication required.'))
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET)
    return next()
  } catch {
    return next(new Error('Invalid or expired session.'))
  }
})

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`)
  socket.on('project:join', async (projectId) => {
    try {
      await requireProjectMember(projectId, socket.user.id)
      socket.join(`project:${projectId}`)
    } catch (error) {
      if (error.status === 404 || error.status === 403) {
        socket.emit('project:access-denied')
      } else {
        console.error('Socket project membership check failed:', error)
        socket.emit('project:join-error', { message: 'Unable to join this project right now.' })
      }
    }
  })
  socket.on('project:leave', (projectId) => socket.leave(`project:${projectId}`))
})

const port = Number(process.env.PORT || 4000)
server.listen(port, async () => {
  console.log(`TeamFlow API listening on port ${port}`)
  try {
    await pool.query('SELECT 1')
    console.log('MySQL connection ready')
  } catch (error) {
    console.error('MySQL connection failed:', error.message)
  }
})

module.exports = { app, server, io }
