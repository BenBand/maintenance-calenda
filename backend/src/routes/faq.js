const express = require('express');
const router = express.Router();
const { getFaqArticles, getFaqCategories } = require('../controllers/faqController');
const { authenticateToken, requirePermission, PERMISSIONS } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');

router.use(authenticateToken, csrfProtection);

// Everyone with a valid session can read the help articles.
router.get('/', requirePermission(PERMISSIONS.FAQ_READ), getFaqArticles);
router.get('/categories', requirePermission(PERMISSIONS.FAQ_READ), getFaqCategories);

module.exports = router;