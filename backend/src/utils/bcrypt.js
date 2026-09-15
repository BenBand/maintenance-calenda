const bcrypt = require('bcrypt');

async function hashPassword(password) {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
  return await bcrypt.hash(password, saltRounds);
}

async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

module.exports = { hashPassword, comparePassword };
