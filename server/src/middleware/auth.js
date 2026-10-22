const jwt = require('jsonwebtoken')

function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' })
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' })
  }
}

module.exports = { authenticate }
