const express = require('express');
const historyController = require('../controllers/historyController');

const router = express.Router();

router.get('/', historyController.list);
router.get('/:id', historyController.getOne);
router.get('/:id/messages', historyController.getMessages);
router.delete('/:id', historyController.remove);

module.exports = router;
