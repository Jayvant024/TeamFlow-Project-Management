const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const pool = require('../config/db')
const { httpError, getTaskAccess } = require('../utils')
const { storedFilePath, removeStoredFile } = require('../attachments/storage')
const { matchesFileSignature } = require('../attachments/fileValidation')

async function requireTaskAccess(req, res, next) {
  try {
    req.task = await getTaskAccess(req.params.id, req.user.id)
    return next()
  } catch (error) {
    return next(error)
  }
}

async function list(req, res) {
  const [attachments] = await pool.execute(
    `SELECT a.id, a.original_name, a.mime_type, a.file_size, a.created_at,
       a.uploader_id, u.name AS uploader_name
     FROM task_attachments a JOIN users u ON u.id = a.uploader_id
     WHERE a.task_id = ? ORDER BY a.created_at DESC`,
    [req.task.id],
  )
  res.json({ attachments })
}

async function upload(req, res) {
  if (!req.file) throw httpError(400, 'Choose a file to upload.')
  const file = req.file
  let safeOriginalName
  try {
    const handle = await fs.open(file.path, 'r')
    const header = Buffer.alloc(8)
    let bytesRead
    try {
      ({ bytesRead } = await handle.read(header, 0, header.length, 0))
    } finally {
      await handle.close()
    }
    if (!matchesFileSignature(file.mimetype, header.subarray(0, bytesRead))) {
      throw httpError(400, 'The uploaded file contents do not match its file type.')
    }
    safeOriginalName = path.basename(file.originalname.replace(/\\/g, '/'))
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 255)
    if (!safeOriginalName) throw httpError(400, 'The uploaded filename is invalid.')
  } catch (error) {
    try {
      await removeStoredFile(file.filename)
    } catch (cleanupError) {
      console.error('Failed to remove an incomplete attachment upload:', cleanupError.message)
    }
    throw error
  }
  let insertResult
  try {
    const [result] = await pool.execute(
      `INSERT INTO task_attachments
       (task_id, uploader_id, stored_name, original_name, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.task.id, req.user.id, file.filename, safeOriginalName, file.mimetype, file.size],
    )
    insertResult = result
  } catch (error) {
    try {
      await removeStoredFile(file.filename)
    } catch (cleanupError) {
      console.error('Failed to remove an incomplete attachment upload:', cleanupError.message)
    }
    throw error
  }
  const attachment = {
    id: insertResult.insertId,
    original_name: safeOriginalName,
    mime_type: file.mimetype,
    file_size: file.size,
    created_at: new Date(),
    uploader_id: req.user.id,
    uploader_name: req.user.name,
  }
  req.app.get('io').to(`project:${req.task.project_id}`).emit('attachment:created', { taskId: req.task.id, attachment })
  return res.status(201).json({ attachment })
}

async function download(req, res) {
  const attachment = await findAttachment(req.params.attachmentId, req.task.id)
  const filePath = storedFilePath(attachment.stored_name)
  try {
    await fs.access(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') throw httpError(404, 'Attachment file is no longer available.')
    throw error
  }
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return res.download(filePath, attachment.original_name)
}

async function remove(req, res) {
  const attachment = await findAttachment(req.params.attachmentId, req.task.id)
  await removeStoredFile(attachment.stored_name)
  const [result] = await pool.execute(
    'DELETE FROM task_attachments WHERE id = ? AND task_id = ?',
    [attachment.id, req.task.id],
  )
  if (!result.affectedRows) throw httpError(404, 'Attachment not found.')
  req.app.get('io').to(`project:${req.task.project_id}`).emit('attachment:deleted', { taskId: req.task.id, id: attachment.id })
  return res.json({ message: 'Attachment deleted.' })
}

async function findAttachment(id, taskId) {
  if (!/^\d+$/.test(String(id))) throw httpError(404, 'Attachment not found.')
  const [rows] = await pool.execute(
    `SELECT id, stored_name, original_name FROM task_attachments WHERE id = ? AND task_id = ?`,
    [id, taskId],
  )
  if (!rows.length) throw httpError(404, 'Attachment not found.')
  return rows[0]
}

module.exports = { requireTaskAccess, list, upload, download, remove }
