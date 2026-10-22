const express = require('express')
const { authenticate } = require('../middleware/auth')
const { users } = require('../controllers/notificationController')
const router = express.Router()
router.get('/', authenticate, (req, res, next) => users(req, res).catch(next))
module.exports = router
