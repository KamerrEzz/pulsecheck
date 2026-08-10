const router = require('express').Router();
const analysisController = require('../controllers/analysis.controller');

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Necesitás iniciar sesión.' });
};

router.use(isAuthenticated);

router.post('/:id/analyze', analysisController.analyze);
router.get('/:id/analysis', analysisController.latest);

module.exports = router;
