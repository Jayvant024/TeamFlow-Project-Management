const test = require('node:test')
const assert = require('node:assert/strict')
const { isAllowedUpload, matchesFileSignature } = require('../src/attachments/fileValidation')
const { storedFilePath } = require('../src/attachments/storage')

test('allows only supported extensions paired with their matching MIME types', () => {
  for (const [originalname, mimetype] of [
    ['brief.pdf', 'application/pdf'],
    ['image.png', 'image/png'],
    ['image.jpg', 'image/jpeg'],
    ['image.jpeg', 'image/jpeg'],
  ]) {
    assert.equal(isAllowedUpload({ originalname, mimetype }), true)
  }
  assert.equal(isAllowedUpload({ originalname: 'image.png', mimetype: 'image/jpeg' }), false)
  assert.equal(isAllowedUpload({ originalname: 'payload.exe', mimetype: 'application/octet-stream' }), false)
})

test('checks content signatures for PDF, PNG, and JPEG uploads', () => {
  assert.equal(matchesFileSignature('application/pdf', Buffer.from('%PDF-1.7')), true)
  assert.equal(matchesFileSignature('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true)
  assert.equal(matchesFileSignature('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true)
  assert.equal(matchesFileSignature('image/png', Buffer.from('not a PNG')), false)
  assert.equal(matchesFileSignature('image/gif', Buffer.from('GIF89a')), false)
})

test('only resolves generated attachment filenames inside the upload directory', () => {
  assert.match(storedFilePath('550e8400-e29b-41d4-a716-446655440000.pdf'), /550e8400-e29b-41d4-a716-446655440000\.pdf$/)
  assert.throws(() => storedFilePath('..\\secret.pdf'), /invalid/)
  assert.throws(() => storedFilePath('report.pdf'), /invalid/)
})
