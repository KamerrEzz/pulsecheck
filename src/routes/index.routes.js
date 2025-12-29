const router = require('express').Router();
const serviceController = require('../controllers/service.controller');

// Middleware to ensure user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
};

router.get('/', (req, res) => {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.render('home');
});

router.get('/dashboard', isAuthenticated, serviceController.dashboard);

module.exports = router;
