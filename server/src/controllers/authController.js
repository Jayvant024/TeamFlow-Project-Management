const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../config/db')
const { httpError } = require('../utils')
const { verifyGoogleCredential, getOrCreateGoogleUser, linkGoogleUser } = require('../services/googleAuth')

function createToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

async function register(req, res) {
  const { name, email, password } = req.body
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    throw httpError(400, 'Name must be between 2 and 100 characters.')
  }
  if (!validEmail(email)) throw httpError(400, 'Enter a valid email address.')
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw httpError(400, 'Password must be between 8 and 72 characters.')
  }
  const normalizedEmail = email.trim().toLowerCase()
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail])
  if (existing.length) throw httpError(409, 'An account with this email already exists.')
  const passwordHash = await bcrypt.hash(password, 12)
  const [result] = await pool.execute('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [
    name.trim(), normalizedEmail, passwordHash,
  ])
  const user = { id: result.insertId, name: name.trim(), email: normalizedEmail }
  res.status(201).json({ user, token: createToken(user) })
}

async function login(req, res) {
  const { email, password } = req.body
  if (!validEmail(email) || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    throw httpError(400, 'Enter your email and password.')
  }
  const [rows] = await pool.execute('SELECT id, name, email, password_hash FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ])
  if (!rows.length || !rows[0].password_hash || !(await bcrypt.compare(password, rows[0].password_hash))) {
    throw httpError(401, 'Email or password is incorrect.')
  }
  const { id, name, email: userEmail } = rows[0]
  const user = { id, name, email: userEmail }
  res.json({ user, token: createToken(user) })
}

async function me(req, res) {
  const [rows] = await pool.execute('SELECT id, name, email FROM users WHERE id = ?', [req.user.id])
  if (!rows.length) throw httpError(401, 'Your account could not be found.')
  res.json({ user: rows[0] })
}

async function google(req, res) {
  const { credential, intent } = req.body
  if (intent !== 'login' && intent !== 'register') throw httpError(400, 'Choose login or register to continue.')
  const identity = await verifyGoogleCredential(credential, process.env.GOOGLE_CLIENT_ID)
  const user = await getOrCreateGoogleUser(identity, intent, pool)
  res.json({ user: { id: user.id, name: user.name, email: user.email }, token: createToken(user) })
}

async function linkGoogle(req, res) {
  const identity = await verifyGoogleCredential(req.body.credential, process.env.GOOGLE_CLIENT_ID)
  const user = await linkGoogleUser(identity, req.user.id, pool)
  res.json({ user: { id: user.id, name: user.name, email: user.email } })
}

module.exports = { register, login, me, google, linkGoogle }
