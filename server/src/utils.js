const pool = require('./config/db')
const { httpError } = require('./httpError')

async function requireProjectMember(projectId, userId) {
  const [rows] = await pool.execute(
    'SELECT p.id, p.owner_id, p.title FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE p.id = ? AND pm.user_id = ?',
    [projectId, userId],
  )
  if (!rows.length) throw httpError(404, 'Project not found.')
  return rows[0]
}

async function getTaskAccess(taskId, userId) {
  const [rows] = await pool.execute(
    `SELECT t.*, p.title AS project_title FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN project_members pm ON pm.project_id = p.id
     WHERE t.id = ? AND pm.user_id = ?`,
    [taskId, userId],
  )
  if (!rows.length) throw httpError(404, 'Task not found.')
  return rows[0]
}

async function notify(userId, actorId, projectId, taskId, type, message) {
  await pool.execute(
    'INSERT INTO notifications (user_id, actor_id, project_id, task_id, type, message) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, actorId || null, projectId || null, taskId || null, type, message],
  )
}

module.exports = { httpError, requireProjectMember, getTaskAccess, notify }
