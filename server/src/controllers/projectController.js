const pool = require('../config/db')
const { httpError, requireProjectMember, notify } = require('../utils')
const { removeProjectFiles } = require('../attachments/cleanup')

async function list(req, res) {
  const [projects] = await pool.execute(
    `SELECT p.id, p.title, p.description, p.status, p.owner_id, p.created_at, p.updated_at,
      COUNT(DISTINCT t.id) AS task_count,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_count,
      COUNT(DISTINCT pm.user_id) AS member_count
     FROM project_members mine JOIN projects p ON p.id = mine.project_id
     LEFT JOIN tasks t ON t.project_id = p.id
     LEFT JOIN project_members pm ON pm.project_id = p.id
     WHERE mine.user_id = ?
     GROUP BY p.id ORDER BY p.updated_at DESC`,
    [req.user.id],
  )
  res.json({ projects })
}

async function create(req, res) {
  const { title, description = '', status = 'active' } = req.body
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) throw httpError(400, 'Project title is required (160 characters max).')
  if (typeof description !== 'string' || description.length > 5000) throw httpError(400, 'Description must be 5,000 characters or fewer.')
  if (!['planning', 'active', 'completed', 'on-hold'].includes(status)) throw httpError(400, 'Choose a valid project status.')
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.execute(
      'INSERT INTO projects (owner_id, title, description, status) VALUES (?, ?, ?, ?)',
      [req.user.id, title.trim(), description.trim(), status],
    )
    await connection.execute('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [result.insertId, req.user.id, 'owner'])
    await connection.commit()
    res.status(201).json({ project: { id: result.insertId, owner_id: req.user.id, title: title.trim(), description: description.trim(), status } })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function getOne(req, res) {
  const project = await requireProjectMember(req.params.id, req.user.id)
  const [rows] = await pool.execute(
    `SELECT p.id, p.title, p.description, p.status, p.owner_id, p.created_at, p.updated_at,
      u.id AS member_id, u.name AS member_name, u.email AS member_email, pm.role
     FROM projects p JOIN project_members pm ON pm.project_id = p.id
     JOIN users u ON u.id = pm.user_id WHERE p.id = ? ORDER BY pm.role DESC, u.name`,
    [project.id],
  )
  const first = rows[0]
  res.json({ project: { id: first.id, title: first.title, description: first.description, status: first.status, owner_id: first.owner_id, created_at: first.created_at, updated_at: first.updated_at, members: rows.map((row) => ({ id: row.member_id, name: row.member_name, email: row.member_email, role: row.role })) } })
}

async function update(req, res) {
  const project = await requireProjectMember(req.params.id, req.user.id)
  if (project.owner_id !== req.user.id) throw httpError(403, 'Only the project owner can edit project details.')
  const { title, description, status } = req.body
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.trim().length > 160)) throw httpError(400, 'Project title is required (160 characters max).')
  if (description !== undefined && (typeof description !== 'string' || description.length > 5000)) throw httpError(400, 'Description must be 5,000 characters or fewer.')
  if (status !== undefined && !['planning', 'active', 'completed', 'on-hold'].includes(status)) throw httpError(400, 'Choose a valid project status.')
  await pool.execute('UPDATE projects SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?', [
    title === undefined ? null : title.trim(), description === undefined ? null : description.trim(), status || null, project.id,
  ])
  res.json({ project: { ...project, title: title === undefined ? project.title : title.trim(), description: description === undefined ? project.description : description.trim(), status: status || project.status } })
}

async function remove(req, res) {
  const project = await requireProjectMember(req.params.id, req.user.id)
  if (project.owner_id !== req.user.id) throw httpError(403, 'Only the project owner can delete this project.')
  await removeProjectFiles(project.id)
  await pool.execute('DELETE FROM projects WHERE id = ?', [project.id])
  res.json({ message: 'Project deleted.' })
}

async function searchUsers(req, res) {
  const project = await requireProjectMember(req.params.id, req.user.id)
  if (project.owner_id !== req.user.id) throw httpError(403, 'Only the project owner can manage members.')
  const query = String(req.query.q || '').trim()
  if (query.length < 2) return res.json({ users: [] })
  const [users] = await pool.execute(
    `SELECT u.id, u.name, u.email FROM users u
     WHERE u.id <> ? AND (u.email LIKE ? OR u.name LIKE ?)
       AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = u.id)
     LIMIT 10`,
    [req.user.id, `%${query}%`, `%${query}%`, project.id],
  )
  res.json({ users })
}

async function addMember(req, res) {
  const project = await requireProjectMember(req.params.id, req.user.id)
  if (project.owner_id !== req.user.id) throw httpError(403, 'Only the project owner can manage members.')
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!email) throw httpError(400, 'Enter the email of a registered user.')
  const [users] = await pool.execute('SELECT id, name, email FROM users WHERE email = ?', [email])
  if (!users.length) throw httpError(404, 'No registered user found with that email.')
  const member = users[0]
  const [existing] = await pool.execute('SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?', [project.id, member.id])
  if (existing.length) throw httpError(409, 'This person is already a project member.')
  await pool.execute('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [project.id, member.id, 'member'])
  await notify(member.id, req.user.id, project.id, null, 'project_added', `${req.user.name} added you to ${project.title}.`)
  req.app.get('io').to(`user:${member.id}`).emit('notification:new')
  req.app.get('io').to(`project:${project.id}`).emit('project:member-added', { user: member })
  res.status(201).json({ member })
}

async function removeMember(req, res) {
  const project = await requireProjectMember(req.params.id, req.user.id)
  if (project.owner_id !== req.user.id) throw httpError(403, 'Only the project owner can manage members.')
  const userId = Number(req.params.userId)
  if (userId === Number(project.owner_id)) throw httpError(400, 'The project owner cannot be removed.')
  const [result] = await pool.execute('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [project.id, userId])
  if (!result.affectedRows) throw httpError(404, 'Project member not found.')
  await pool.execute('UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?', [project.id, userId])
  const io = req.app.get('io')
  await io.in(`user:${userId}`).socketsLeave(`project:${project.id}`)
  io.to(`user:${userId}`).emit('project:access-revoked', { projectId: project.id })
  io.to(`project:${project.id}`).emit('project:member-removed', { userId })
  res.json({ message: 'Member removed.' })
}

module.exports = { list, create, getOne, update, remove, searchUsers, addMember, removeMember }
