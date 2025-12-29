const router = require('express').Router();
const serviceController = require('../controllers/service.controller');

// Middleware to ensure user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
};

router.use(isAuthenticated);

router.get('/new', serviceController.renderNew);
router.post('/new', serviceController.create);

router.get('/:id/edit', serviceController.renderEdit);
router.post('/:id/edit', serviceController.update);

router.post('/:id/delete', serviceController.delete);

router.get('/:id', serviceController.show);

module.exports = router;
