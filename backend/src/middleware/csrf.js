const crypto = require('crypto');

function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  if (req.originalUrl === '/api/auth/login') {
    return next();
  }

  if (!req.user || !req.user.csrfToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  const provided = req.headers['x-csrf-token'];

  if (!provided) {
    return res.status(403).json({ error: 'CSRF token required' });
  }

  let isValid = false;
  try {
    const providedBuf = Buffer.from(provided, 'utf8');
    const expectedBuf = Buffer.from(req.user.csrfToken, 'utf8');
    if (providedBuf.length === expectedBuf.length) {
      isValid = crypto.timingSafeEqual(providedBuf, expectedBuf);
    }
  } catch {
    isValid = false;
  }

  if (!isValid) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

module.exports = { csrfProtection, generateCSRFToken };
