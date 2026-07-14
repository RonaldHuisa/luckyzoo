const pool = require("../config/db");
const { ensureContentSchema } = require("../services/contentService");

function normalizeChannel(row) {
  return {
    id: row.id,
    type: row.channel_type,
    label: row.label,
    value: row.value,
    url: row.url,
    description: row.description,
    sortOrder: Number(row.sort_order || 0),
    isActive: row.is_active,
  };
}

function normalizeArticle(row, full = false) {
  const sections = Array.isArray(row.sections) ? row.sections : [];
  const base = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (full) base.sections = sections;
  return base;
}

async function getSupportChannels(req, res) {
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const result = await client.query(
      `SELECT * FROM support_channels WHERE is_active = true ORDER BY sort_order ASC, id ASC`
    );
    return res.json({ channels: result.rows.map(normalizeChannel) });
  } catch (error) {
    console.error("GET SUPPORT CHANNELS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar canales de soporte.", detail: error.message });
  } finally { client.release(); }
}

async function listPublishedArticles(req, res) {
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const result = await client.query(
      `SELECT id,title,slug,summary,cover_image_url,status,sort_order,published_at,created_at,updated_at,sections
       FROM royal_articles
       WHERE status = 'published'
       ORDER BY sort_order ASC, COALESCE(published_at, created_at) DESC, id DESC`
    );
    return res.json({ articles: result.rows.map((row) => normalizeArticle(row, false)) });
  } catch (error) {
    console.error("LIST PUBLISHED ARTICLES ERROR:", error);
    return res.status(500).json({ message: "Error al cargar noticias.", detail: error.message });
  } finally { client.release(); }
}

async function getPublishedArticle(req, res) {
  const slug = String(req.params.slug || "").trim();
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const result = await client.query(
      `SELECT * FROM royal_articles WHERE slug=$1 AND status='published' LIMIT 1`,
      [slug]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Noticia no encontrada." });
    return res.json({ article: normalizeArticle(result.rows[0], true) });
  } catch (error) {
    console.error("GET PUBLISHED ARTICLE ERROR:", error);
    return res.status(500).json({ message: "Error al cargar noticia.", detail: error.message });
  } finally { client.release(); }
}

module.exports = { getSupportChannels, listPublishedArticles, getPublishedArticle };
