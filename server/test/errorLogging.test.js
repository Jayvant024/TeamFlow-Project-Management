const test = require('node:test')
const assert = require('node:assert/strict')
const { safeErrorMessage } = require('../src/middleware/errors')

test('redacts secrets and database usernames from diagnostic messages', () => {
  const message = safeErrorMessage("Access denied for user 'db-account' password='private-value' token=private-token")
  assert.match(message, /for user \[redacted\]/)
  assert.match(message, /password=\[redacted\]/)
  assert.match(message, /token=\[redacted\]/)
  assert.doesNotMatch(message, /db-account|private-value|private-token/)
})
