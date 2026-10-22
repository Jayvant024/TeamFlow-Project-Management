const test = require('node:test')
const assert = require('node:assert/strict')
const { validateTask } = require('../src/validation/task')

test('accepts a valid task payload', () => {
  assert.doesNotThrow(() => validateTask({
    title: 'Prepare project brief',
    description: 'Outline the first milestone.',
    status: 'todo',
    priority: 'high',
    due_date: '2026-12-31',
    assignee_id: 4,
  }))
})

test('accepts partial updates without requiring a title', () => {
  assert.doesNotThrow(() => validateTask({ status: 'done' }, true))
})

test('rejects invalid task fields with a client error', () => {
  for (const payload of [
    { title: '   ' },
    { title: 'Valid title', status: 'blocked' },
    { title: 'Valid title', priority: 'critical' },
    { title: 'Valid title', due_date: '2026-02-31' },
    { title: 'Valid title', due_date: '2026-13-01' },
    { title: 'Valid title', assignee_id: 'not-a-user' },
  ]) {
    assert.throws(() => validateTask(payload), { status: 400 })
  }
})
