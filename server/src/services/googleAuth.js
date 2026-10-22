const { OAuth2Client } = require('google-auth-library')
const { httpError } = require('../httpError')

const validIssuers = new Set(['accounts.google.com', 'https://accounts.google.com'])
const googleClient = new OAuth2Client()

async function verifyGoogleCredential(credential, clientId, verifier = googleClient) {
  if (typeof credential !== 'string' || !credential || credential.length > 16384) {
    throw httpError(400, 'A valid Google credential is required.')
  }
  if (typeof clientId !== 'string' || !clientId) {
    throw httpError(503, 'Google Sign-In is not configured on this server.')
  }

  let payload
  try {
    const ticket = await verifier.verifyIdToken({ idToken: credential, audience: clientId })
    payload = ticket.getPayload()
  } catch {
    throw httpError(401, 'Google could not verify this sign-in. Please try again.')
  }

  if (!payload || !validIssuers.has(payload.iss) || payload.aud !== clientId ||
    !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
    throw httpError(401, 'This Google sign-in token is invalid or expired.')
  }
  if (payload.email_verified !== true || typeof payload.email !== 'string' || payload.email.length > 254 ||
    typeof payload.sub !== 'string' || !payload.sub || typeof payload.name !== 'string' || !payload.name.trim()) {
    throw httpError(401, 'Use a Google account with a verified email address.')
  }
  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name.trim().slice(0, 100),
  }
}

async function findByGoogleSub(pool, sub) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, google_sub FROM users WHERE google_sub = ?',
    [sub],
  )
  return rows[0] || null
}

async function findByEmail(pool, email) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, google_sub FROM users WHERE email = ?',
    [email],
  )
  return rows[0] || null
}

async function getOrCreateGoogleUser(identity, intent, pool) {
  const linkedUser = await findByGoogleSub(pool, identity.sub)
  if (linkedUser) return linkedUser

  const emailUser = await findByEmail(pool, identity.email)
  if (emailUser) {
    throw httpError(409, 'An account already uses this email. Sign in with your password, then link Google from your account menu.')
  }
  if (intent === 'login') {
    throw httpError(404, 'No Google account is linked yet. Register with Google or sign in with your password and link it from your account menu.')
  }
  if (intent !== 'register') throw httpError(400, 'Choose login or register to continue.')

  try {
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, google_sub) VALUES (?, ?, NULL, ?)',
      [identity.name, identity.email, identity.sub],
    )
    return { id: result.insertId, name: identity.name, email: identity.email, google_sub: identity.sub }
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error

    const racedLinkedUser = await findByGoogleSub(pool, identity.sub)
    if (racedLinkedUser) return racedLinkedUser
    const racedEmailUser = await findByEmail(pool, identity.email)
    if (racedEmailUser) {
      throw httpError(409, 'An account already uses this email. Sign in with your password, then link Google from your account menu.')
    }
    throw error
  }
}

async function linkGoogleUser(identity, userId, pool) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, google_sub FROM users WHERE id = ?',
    [userId],
  )
  const currentUser = rows[0]
  if (!currentUser) throw httpError(401, 'Your account could not be found.')
  if (currentUser.email.toLowerCase() !== identity.email) {
    throw httpError(403, 'Sign in to Google with the same verified email address as your TeamFlow account.')
  }

  const linkedUser = await findByGoogleSub(pool, identity.sub)
  if (linkedUser && Number(linkedUser.id) !== Number(currentUser.id)) {
    throw httpError(409, 'This Google account is already linked to another TeamFlow account.')
  }
  if (currentUser.google_sub && currentUser.google_sub !== identity.sub) {
    throw httpError(409, 'A different Google account is already linked to this TeamFlow account.')
  }
  if (currentUser.google_sub === identity.sub) return currentUser

  try {
    const [result] = await pool.execute(
      'UPDATE users SET google_sub = ? WHERE id = ? AND google_sub IS NULL',
      [identity.sub, currentUser.id],
    )
    if (!result.affectedRows) {
      const refreshedUser = await findByGoogleSub(pool, identity.sub)
      if (refreshedUser && Number(refreshedUser.id) === Number(currentUser.id)) return refreshedUser
      throw httpError(409, 'This account’s Google link changed. Refresh and try again.')
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'This Google account is already linked to another TeamFlow account.')
    }
    throw error
  }
  return { ...currentUser, google_sub: identity.sub }
}

module.exports = { verifyGoogleCredential, getOrCreateGoogleUser, linkGoogleUser }
