function notFound(req, res) {
  res.status(404).json({ error: 'The requested endpoint was not found.' })
}

function validateJsonBody(req, res, next) {
  if (req.body === undefined) req.body = {}
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' })
  }
  return next()
}

function safeErrorMessage(message) {
  return String(message)
    .replace(/\b(password|secret|token)\s*[:=]\s*('[^']*'|"[^"]*"|\S+)/gi, '$1=[redacted]')
    .replace(/\bfor user\s+('[^']*'|"[^"]*")/gi, 'for user [redacted]')
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  const logEntry = {
    method: req.method,
    path: req.path,
    status: error.status || 500,
    name: error.name,
    code: error.code,
    errno: error.errno,
    sqlState: error.sqlState,
    message: safeErrorMessage(error.message),
    stack: error.stack?.split('\n').slice(1).join('\n'),
  }
  console.error('[api-error]', JSON.stringify(logEntry))
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File exceeds the 10 MB upload limit.' })
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'Upload one file at a time using the "file" field.' })
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email is already registered.' })
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'A referenced user or project does not exist.' })
  res.status(error.status || 500).json({ error: error.status ? error.message : 'An unexpected server error occurred.' })
}

module.exports = { notFound, validateJsonBody, safeErrorMessage, errorHandler }
