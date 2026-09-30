const express = require('express');
const router = express.Router();
const {
  getCommentsByIncident, createComment, updateComment, deleteComment,
} = require('../controllers/commentController');
const { authenticateToken, requirePermission, PERMISSIONS } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const {
  idParamValidation, incidentIdParamValidation, commentValidation,
} = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/incident/:incidentId',
  requirePermission(PERMISSIONS.INCIDENT_READ),
  incidentIdParamValidation,
  getCommentsByIncident
);

// The thread stays two-way: the requester posts here and so does the IT team
// responding, so every role that can read an incident can also write to it.
router.post('/incident/:incidentId',
  requirePermission(PERMISSIONS.COMMENT_WRITE),
  incidentIdParamValidation,
  commentValidation,
  createComment
);

router.put('/:id',
  requirePermission(PERMISSIONS.COMMENT_WRITE),
  idParamValidation,
  commentValidation,
  updateComment
);

router.delete('/:id',
  requirePermission(PERMISSIONS.COMMENT_WRITE),
  idParamValidation,
  deleteComment
);

module.exports = router;