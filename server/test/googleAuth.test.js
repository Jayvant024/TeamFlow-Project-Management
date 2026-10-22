const test = require('node:test')
const assert = require('node:assert/strict')
const { OAuth2Client } = require('google-auth-library')
const { verifyGoogleCredential, getOrCreateGoogleUser, linkGoogleUser } = require('../src/services/googleAuth')

const clientId = 'teamflow-test.apps.googleusercontent.com'
const validPayload = {
  iss: 'https://accounts.google.com',
  aud: clientId,
  exp: Math.floor(Date.now() / 1000) + 300,
  email_verified: true,
  email: 'person@example.com',
  sub: 'google-subject-123',
  name: 'Test Person',
}

function verifierFor(payload) {
  return {
    async verifyIdToken({ idToken, audience }) {
      assert.equal(idToken, 'signed-google-credential')
      assert.equal(audience, clientId)
      return { getPayload: () => payload }
    },
  }
}

function fakePool({ users = [] } = {}) {
  const records = users.map((user) => ({ ...user }))
  let nextId = Math.max(0, ...records.map((user) => Number(user.id))) + 1
  return {
    records,
    async execute(sql, params) {
      if (sql.startsWith('SELECT id, name, email, google_sub FROM users WHERE google_sub')) {
        return [records.filter((user) => user.google_sub === params[0])]
      }
      if (sql.startsWith('SELECT id, name, email, google_sub FROM users WHERE email')) {
        return [records.filter((user) => user.email === params[0])]
      }
      if (sql.startsWith('SELECT id, name, email, google_sub FROM users WHERE id')) {
        return [records.filter((user) => Number(user.id) === Number(params[0]))]
      }
      if (sql.startsWith('INSERT INTO users')) {
        const [name, email, sub] = params
        if (records.some((user) => user.email === email || user.google_sub === sub)) {
          const error = new Error('duplicate key')
          error.code = 'ER_DUP_ENTRY'
          throw error
        }
        const user = { id: nextId++, name, email, google_sub: sub, password_hash: null }
        records.push(user)
        return [{ insertId: user.id }]
      }
      if (sql.startsWith('UPDATE users SET google_sub')) {
        const [sub, id] = params
        if (records.some((user) => user.google_sub === sub && Number(user.id) !== Number(id))) {
          const error = new Error('duplicate key')
          error.code = 'ER_DUP_ENTRY'
          throw error
        }
        const user = records.find((item) => Number(item.id) === Number(id) && item.google_sub === null)
        if (!user) return [{ affectedRows: 0 }]
        user.google_sub = sub
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected query in test: ${sql}`)
    },
  }
}

test('verifies an ID token and checks its verified identity claims', async () => {
  const identity = await verifyGoogleCredential('signed-google-credential', clientId, verifierFor(validPayload))
  assert.deepEqual(identity, { sub: validPayload.sub, email: validPayload.email, name: validPayload.name })
})

test('rejects invalid credentials using the Google verification library', async () => {
  await assert.rejects(
    verifyGoogleCredential('not-a-google-id-token', clientId, new OAuth2Client()),
    { status: 401 },
  )
})

test('rejects wrong audiences and unverified emails', async () => {
  await assert.rejects(
    verifyGoogleCredential('signed-google-credential', clientId, verifierFor({ ...validPayload, aud: 'another-client' })),
    { status: 401 },
  )
  await assert.rejects(
    verifyGoogleCredential('signed-google-credential', clientId, verifierFor({ ...validPayload, email_verified: false })),
    { status: 401 },
  )
  await assert.rejects(
    verifyGoogleCredential('signed-google-credential', clientId, verifierFor({ ...validPayload, iss: 'https://attacker.example' })),
    { status: 401 },
  )
  await assert.rejects(
    verifyGoogleCredential('signed-google-credential', clientId, verifierFor({ ...validPayload, exp: 1 })),
    { status: 401 },
  )
})

test('returns an existing Google-linked account during login', async () => {
  const user = { id: 7, name: 'Existing User', email: validPayload.email, google_sub: validPayload.sub }
  const pool = fakePool({ users: [user] })
  assert.deepEqual(await getOrCreateGoogleUser(validPayload, 'login', pool), user)
})

test('creates new Google registrations but does not create accounts during login', async () => {
  const pool = fakePool()
  const user = await getOrCreateGoogleUser(validPayload, 'register', pool)
  assert.equal(user.id, 1)
  assert.equal(user.google_sub, validPayload.sub)
  assert.equal(pool.records[0].password_hash, null)
  await assert.rejects(getOrCreateGoogleUser({ ...validPayload, sub: 'unknown-sub', email: 'new@example.com' }, 'login', fakePool()), { status: 404 })
})

test('does not silently link a password account by matching email', async () => {
  const pool = fakePool({ users: [{ id: 8, name: 'Password User', email: validPayload.email, google_sub: null }] })
  await assert.rejects(getOrCreateGoogleUser(validPayload, 'register', pool), { status: 409 })
})

test('links only the matching authenticated account and rejects linked-account conflicts', async () => {
  const user = { id: 9, name: 'TeamFlow User', email: validPayload.email, google_sub: null }
  const pool = fakePool({ users: [user] })
  const linked = await linkGoogleUser(validPayload, user.id, pool)
  assert.equal(linked.google_sub, validPayload.sub)
  await assert.rejects(linkGoogleUser(validPayload, 10, pool), { status: 401 })

  const conflictPool = fakePool({
    users: [
      { id: 11, name: 'First', email: 'first@example.com', google_sub: validPayload.sub },
      { id: 12, name: 'Second', email: validPayload.email, google_sub: null },
    ],
  })
  await assert.rejects(linkGoogleUser(validPayload, 12, conflictPool), { status: 409 })
  await assert.rejects(linkGoogleUser({ ...validPayload, email: 'different@example.com' }, 12, fakePool({
    users: [{ id: 12, name: 'Second', email: validPayload.email, google_sub: null }],
  })), { status: 403 })
})
