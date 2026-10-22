const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const multer = require('multer')
const { storageRoot } = require('../attachments/storage')
const { isAllowedUpload } = require('../attachments/fileValidation')

const maxFileSize = 10 * 1024 * 1024

const storage = multer.diskStorage({
  destination(req, file, callback) {
    fs.mkdir(storageRoot, { recursive: true }, (error) => callback(error, storageRoot))
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase()
    callback(null, `${randomUUID()}${extension}`)
  },
})

const uploadAttachment = multer({
  storage,
  limits: { fileSize: maxFileSize, files: 1 },
  fileFilter(req, file, callback) {
    if (!isAllowedUpload(file)) {
      const error = new Error('Only PDF, PNG, JPG, and JPEG files are allowed.')
      error.status = 400
      return callback(error)
    }
    return callback(null, true)
  },
}).single('file')

module.exports = { uploadAttachment, maxFileSize }
