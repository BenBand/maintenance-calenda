const pool = require('../config/database');

/**
 * Returns published FAQ articles, optionally filtered by category.
 * Articles are seeded by the developer/admin and are read-only for everyone
 * with the FAQ_READ permission.
 */
async function getFaqArticles(req, res) {
  const { category, search, page, limit } = req.query;
  const offset = ((page || 1) - 1) * (limit || 50);
  const conditions = [];
  const params = [];
  let idx = 1;
  if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
  if (search) {
    conditions.push(`(title ILIKE $${idx} OR body ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM faq_articles ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    const result = await pool.query(
      `SELECT * FROM faq_articles ${whereClause} ORDER BY sort_order ASC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit || 50, offset]
    );
    res.json({
      data: result.rows,
      pagination: { total, page: parseInt(page || 1), limit: parseInt(limit || 50) },
    });
  } catch (error) {
    console.error('Get FAQ articles error:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ articles' });
  }
}

/**
 * Returns the distinct categories present in published articles.
 */
async function getFaqCategories(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM faq_articles WHERE category IS NOT NULL AND btrim(category) <> '' ORDER BY category ASC`
    );
    res.json({ data: result.rows.map((row) => row.category) });
  } catch (error) {
    console.error('Get FAQ categories error:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ categories' });
  }
}

module.exports = { getFaqArticles, getFaqCategories };