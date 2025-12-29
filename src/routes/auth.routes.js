const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const passport = require('passport');

router.get('/register', authController.renderRegister);
router.post('/register', authController.register);

router.get('/login', authController.renderLogin);
router.post('/login', passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/auth/login',
    failureFlash: false // We can add flash messages later if needed
}));

router.get('/logout', authController.logout);

module.exports = router;
