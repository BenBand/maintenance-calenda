const express = require('express');
const router = express.Router();
const {
  listUsers, getUserById, createUser, updateUser, deleteUser,
} = require('../controllers/userController');
const { authenticateToken, requirePermission, PERMISSIONS } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { userCreateValidation, userUpdateValidation, idParamValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/', requirePermission(PERMISSIONS.USER_READ), listUsers);
router.get('/:id', requirePermission(PERMISSIONS.USER_READ), idParamValidation, getUserById);
router.post('/', requirePermission(PERMISSIONS.USER_WRITE), userCreateValidation, createUser);
router.put('/:id', requirePermission(PERMISSIONS.USER_WRITE), idParamValidation, userUpdateValidation, updateUser);
router.delete('/:id', requirePermission(PERMISSIONS.USER_DELETE), idParamValidation, deleteUser);

module.exports = router;
