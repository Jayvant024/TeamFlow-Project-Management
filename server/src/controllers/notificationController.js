const pool = require('../config/db')
const { httpError, requireProjectMember } = require('../utils')

async function list(req, res) {
  const [[{ unreadCount }]] = await pool.execute('SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id])
  const [notifications] = await pool.execute(
    'SELECT id, type, message, project_id, task_id, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id],
  )
  res.json({ notifications, unreadCount: Number(unreadCount) })
}

async function markRead(req, res) {
  const id = req.params.id
  if (id === 'all') {
    await pool.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id])
  } else {
    const [result] = await pool.execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [id, req.user.id])
    if (!result.affectedRows) throw httpError(404, 'Notification not found.')
  }
  res.json({ message: 'Notification updated.' })
}

async function users(req, res) {
  const query = String(req.query.q || '').trim()
  const projectId = req.query.project_id
  if (!projectId || !/^\d+$/.test(String(projectId))) throw httpError(400, 'A valid project_id is required.')
  const project = await requireProjectMember(projectId, req.user.id)
  if (project.owner_id !== req.user.id) throw httpError(403, 'Only the project owner can search for new members.')
  if (query.length < 2) return res.json({ users: [] })
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email FROM users u
     WHERE (u.name LIKE ? OR u.email LIKE ?) AND u.id <> ?
       AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = u.id)
     ORDER BY u.name LIMIT 10`,
    [
      `%${query}%`, `%${query}%`, req.user.id, projectId,
  ])
  res.json({ users: rows })
}

async function dashboard(req, res) {
  const [projects] = await pool.execute(
    `SELECT p.id, p.title, p.description, p.status, p.updated_at,
       COUNT(DISTINCT t.id) AS task_count,
       SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_count,
       COUNT(DISTINCT pm.user_id) AS member_count
     FROM project_members mine JOIN projects p ON p.id = mine.project_id
     LEFT JOIN tasks t ON t.project_id = p.id
     LEFT JOIN project_members pm ON pm.project_id = p.id
     WHERE mine.user_id = ? GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 5`,
    [req.user.id],
  )
  const [counts] = await pool.execute(
    `SELECT t.status, COUNT(*) AS count FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
     WHERE t.assignee_id = ? GROUP BY t.status`,
    [req.user.id, req.user.id],
  )
  const [tasks] = await pool.execute(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, p.id AS project_id, p.title AS project_title
     FROM tasks t JOIN projects p ON p.id = t.project_id
     JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
     WHERE t.assignee_id = ? AND t.status <> 'done' ORDER BY t.due_date IS NULL, t.due_date LIMIT 6`,
    [req.user.id, req.user.id],
  )
  res.json({ projects, tasks, taskCounts: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])) })
}

module.exports = { list, markRead, users, dashboard }
