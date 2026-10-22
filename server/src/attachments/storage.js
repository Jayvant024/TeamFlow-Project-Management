const fs = require('node:fs/promises')
const path = require('node:path')

const storageRoot = path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads')
const storedNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg)$/i

function storedFilePath(storedName) {
  if (typeof storedName !== 'string' || !storedNamePattern.test(storedName)) {
    throw new Error('Attachment storage filename is invalid.')
  }
  const filePath = path.resolve(storageRoot, storedName)
  if (path.dirname(filePath) !== storageRoot) throw new Error('Attachment path is outside the storage directory.')
  return filePath
}

async function removeStoredFile(storedName) {
  try {
    await fs.unlink(storedFilePath(storedName))
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
}

module.exports = { storageRoot, storedFilePath, removeStoredFile }
