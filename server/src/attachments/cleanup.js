const pool = require('../config/db')
const { removeStoredFile } = require('./storage')

async function removeTaskFiles(taskId) {
  const [rows] = await pool.execute('SELECT stored_name FROM task_attachments WHERE task_id = ?', [taskId])
  for (const row of rows) await removeStoredFile(row.stored_name)
}

async function removeProjectFiles(projectId) {
  const [rows] = await pool.execute(
    `SELECT a.stored_name FROM task_attachments a
     JOIN tasks t ON t.id = a.task_id WHERE t.project_id = ?`,
    [projectId],
  )
  for (const row of rows) await removeStoredFile(row.stored_name)
}

module.exports = { removeTaskFiles, removeProjectFiles }
