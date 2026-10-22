const path = require('node:path')

const fileSignatures = {
  'application/pdf': (header) => header.subarray(0, 5).toString('ascii') === '%PDF-',
  'image/png': (header) => header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (header) => header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff,
}

const allowedExtensions = new Map([
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
])

function isAllowedUpload(file) {
  const extension = path.extname(file.originalname).toLowerCase()
  return allowedExtensions.get(extension) === file.mimetype
}

function matchesFileSignature(mimeType, header) {
  return Boolean(fileSignatures[mimeType]?.(header))
}

module.exports = { isAllowedUpload, matchesFileSignature }
