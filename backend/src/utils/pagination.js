function getPagination(query, defaultLimit = 25, maxLimit = 100) {
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || defaultLimit, 1),
    maxLimit
  );
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  return { limit, offset };
}

module.exports = { getPagination };
