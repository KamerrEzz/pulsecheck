const express = require('express');
const router = express.Router();
const statusController = require('../controllers/status.controller');

router.get('/:userId', statusController.publicStatus);

module.exports = router;