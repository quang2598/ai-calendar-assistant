const express = require('express');
const historyController = require('../controllers/historyController');

const router = express.Router();

router.post('/', historyController.create);
router.get('/', historyController.list);
router.get('/:id', historyController.getOne);
router.put('/:id', historyController.update);
router.delete('/:id', historyController.remove);

module.exports = router;
