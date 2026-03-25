const express = require('express');
const { authRequired, requireRoles } = require('../middleware/auth');
const {
  listOutlets,
  createOutlet,
  deleteOutlet,
  getOutletCredentials,
  updateOutletCredentials,
} = require('../controllers/outletController');

const router = express.Router();

router.use(authRequired);

router.get('/', listOutlets);
router.get('/:id/credentials', requireRoles('SUPER_USER'), getOutletCredentials);
router.put('/:id/credentials', requireRoles('SUPER_USER'), updateOutletCredentials);
router.post('/', requireRoles('SUPER_USER'), createOutlet);
router.delete('/:id', requireRoles('SUPER_USER'), deleteOutlet);

module.exports = router;
