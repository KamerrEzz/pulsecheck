const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const passport = require('passport');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Demasiados intentos, intenta de nuevo en 15 minutos'
});

router.get('/register', authController.renderRegister);
router.post('/register', authLimiter, authController.register);

router.get('/login', authController.renderLogin);
router.post('/login', authLimiter, passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/auth/login',
    failureFlash: false // We can add flash messages later if needed
}));

router.get('/logout', authController.logout);

module.exports = router;
