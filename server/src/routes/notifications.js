const express = require('express')
const controller = require('../controllers/notificationController')
const { authenticate } = require('../middleware/auth')
const router = express.Router()
const handle = (fn) => (req, res, next) => fn(req, res).catch(next)

router.use(authenticate)
router.get('/', handle(controller.list))
router.patch('/:id/read', handle(controller.markRead))
router.get('/dashboard', handle(controller.dashboard))
module.exports = router
