const pool = require('../config/db')
const { httpError, requireProjectMember, getTaskAccess, notify } = require('../utils')
const { validateTask } = require('../validation/task')
const { removeTaskFiles } = require('../attachments/cleanup')

const validStatuses = ['todo', 'in_progress', 'done']
const validPriorities = ['low', 'medium', 'high', 'urgent']

async function list(req, res) {
  const project = await requireProjectMember(req.params.projectId, req.user.id)
  const filters = ['t.project_id = ?']
  const values = [project.id]
  if (req.query.status && validStatuses.includes(req.query.status)) { filters.push('t.status = ?'); values.push(req.query.status) }
  if (req.query.priority && validPriorities.includes(req.query.priority)) { filters.push('t.priority = ?'); values.push(req.query.priority) }
  if (req.query.assignee && /^\d+$/.test(req.query.assignee)) { filters.push('t.assignee_id = ?'); values.push(Number(req.query.assignee)) }
  const [tasks] = await pool.execute(
    `SELECT t.*, u.name AS assignee_name, c.name AS creator_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
     JOIN users c ON c.id = t.creator_id WHERE ${filters.join(' AND ')}
     ORDER BY t.created_at DESC`,
    values,
  )
  res.json({ tasks })
}

async function create(req, res) {
  const project = await requireProjectMember(req.params.projectId, req.user.id)
  validateTask(req.body)
  const { title, description = '', status = 'todo', priority = 'medium', due_date = null, assignee_id = null } = req.body
  if (assignee_id !== null) {
    const [eligible] = await pool.execute('SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?', [project.id, assignee_id])
    if (!eligible.length) throw httpError(400, 'Assignee must be a member of this project.')
  }
  const [result] = await pool.execute(
    'INSERT INTO tasks (project_id, creator_id, assignee_id, title, description, status, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [project.id, req.user.id, assignee_id, title.trim(), description.trim(), status, priority, due_date],
  )
  const task = { id: result.insertId, project_id: project.id, creator_id: req.user.id, assignee_id, title: title.trim(), description: description.trim(), status, priority, due_date }
  if (assignee_id && Number(assignee_id) !== Number(req.user.id)) {
    await notify(assignee_id, req.user.id, project.id, task.id, 'task_assigned', `${req.user.name} assigned you "${task.title}".`)
    req.app.get('io').to(`user:${assignee_id}`).emit('notification:new')
  }
  req.app.get('io').to(`project:${project.id}`).emit('task:created', task)
  res.status(201).json({ task })
}

async function update(req, res) {
  const current = await getTaskAccess(req.params.id, req.user.id)
  validateTask(req.body, true)
  const { title, description, status, priority, due_date, assignee_id } = req.body
  if (assignee_id !== undefined && assignee_id !== null) {
    const [eligible] = await pool.execute('SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?', [current.project_id, assignee_id])
    if (!eligible.length) throw httpError(400, 'Assignee must be a member of this project.')
  }
  await pool.execute(
    `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description),
      status = COALESCE(?, status), priority = COALESCE(?, priority),
      due_date = ?, assignee_id = ? WHERE id = ?`,
    [title === undefined ? null : title.trim(), description === undefined ? null : description.trim(),
      status || null, priority || null, due_date === undefined ? current.due_date : due_date,
      assignee_id === undefined ? current.assignee_id : assignee_id, current.id],
  )
  const [rows] = await pool.execute(
    `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`,
    [current.id],
  )
  if (rows[0].assignee_id && Number(rows[0].assignee_id) !== Number(current.assignee_id) && Number(rows[0].assignee_id) !== Number(req.user.id)) {
    await notify(rows[0].assignee_id, req.user.id, current.project_id, current.id, 'task_assigned', `${req.user.name} assigned you "${rows[0].title}".`)
    req.app.get('io').to(`user:${rows[0].assignee_id}`).emit('notification:new')
  }
  req.app.get('io').to(`project:${current.project_id}`).emit('task:updated', rows[0])
  res.json({ task: rows[0] })
}

async function remove(req, res) {
  const task = await getTaskAccess(req.params.id, req.user.id)
  await removeTaskFiles(task.id)
  await pool.execute('DELETE FROM tasks WHERE id = ?', [task.id])
  req.app.get('io').to(`project:${task.project_id}`).emit('task:deleted', { id: task.id })
  res.json({ message: 'Task deleted.' })
}

async function comments(req, res) {
  const task = await getTaskAccess(req.params.id, req.user.id)
  const [comments] = await pool.execute(
    `SELECT c.id, c.body, c.created_at, u.id AS author_id, u.name AS author_name
     FROM comments c JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at ASC`,
    [task.id],
  )
  res.json({ comments })
}

async function addComment(req, res) {
  const task = await getTaskAccess(req.params.id, req.user.id)
  if (typeof req.body.body !== 'string' || !req.body.body.trim() || req.body.body.trim().length > 2000) throw httpError(400, 'Comment must be between 1 and 2,000 characters.')
  const [result] = await pool.execute('INSERT INTO comments (task_id, author_id, body) VALUES (?, ?, ?)', [task.id, req.user.id, req.body.body.trim()])
  const comment = { id: result.insertId, task_id: task.id, author_id: req.user.id, author_name: req.user.name, body: req.body.body.trim(), created_at: new Date() }
  req.app.get('io').to(`project:${task.project_id}`).emit('comment:created', { taskId: task.id, comment })
  if (task.assignee_id && Number(task.assignee_id) !== Number(req.user.id)) {
    await notify(task.assignee_id, req.user.id, task.project_id, task.id, 'comment_added', `${req.user.name} commented on "${task.title}".`)
    req.app.get('io').to(`user:${task.assignee_id}`).emit('notification:new')
  }
  res.status(201).json({ comment })
}

async function removeComment(req, res) {
  const task = await getTaskAccess(req.params.id, req.user.id)
  const [comments] = await pool.execute('SELECT author_id FROM comments WHERE id = ? AND task_id = ?', [req.params.commentId, task.id])
  if (!comments.length) throw httpError(404, 'Comment not found.')
  if (Number(comments[0].author_id) !== Number(req.user.id)) throw httpError(403, 'You can only delete your own comments.')
  await pool.execute('DELETE FROM comments WHERE id = ?', [req.params.commentId])
  req.app.get('io').to(`project:${task.project_id}`).emit('comment:deleted', { id: Number(req.params.commentId), taskId: task.id })
  res.json({ message: 'Comment deleted.' })
}

module.exports = { list, create, update, remove, comments, addComment, removeComment }
