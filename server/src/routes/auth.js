const express = require('express')
const { register, login, me, google, linkGoogle } = require('../controllers/authController')
const { authenticate } = require('../middleware/auth')
const router = express.Router()

router.post('/register', (req, res, next) => register(req, res).catch(next))
router.post('/login', (req, res, next) => login(req, res).catch(next))
router.post('/google', (req, res, next) => google(req, res).catch(next))
router.post('/google/link', authenticate, (req, res, next) => linkGoogle(req, res).catch(next))
router.get('/me', authenticate, (req, res, next) => me(req, res).catch(next))

module.exports = router
