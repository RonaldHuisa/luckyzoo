const pool = require("../config/db");
const { ensureContentSchema, slugify, sanitizeSections } = require("../services/contentService");

function adminId(req) { return req.user.userId || req.user.id || null; }

function normalizePublishedAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
function getLimit(value, fallback = 12, max = 100) {
  const n = Number(value || fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
function getPage(value) {
  const n = Number(value || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function normalizeArticle(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    sections: Array.isArray(row.sections) ? row.sections : [],
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listAdminSupportChannels(req, res) {
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const limit = getLimit(req.query.limit, 12, 100);
    const page = getPage(req.query.page);
    const offset = (page - 1) * limit;
    const [countResult, result] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM support_channels`),
      client.query(`SELECT * FROM support_channels ORDER BY sort_order ASC, id ASC LIMIT $1 OFFSET $2`, [limit, offset]),
    ]);
    return res.json({ channels: result.rows.map(normalizeChannel), pagination: { page, limit, total: Number(countResult.rows[0]?.total || 0) } });
  } catch (error) {
    console.error("LIST ADMIN SUPPORT CHANNELS ERROR:", error);
    return res.status(500).json({ message: "Error al listar soporte.", detail: error.message });
  } finally { client.release(); }
}

async function createAdminSupportChannel(req, res) {
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const result = await client.query(
      `INSERT INTO support_channels(channel_type,label,value,url,description,sort_order,is_active,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [body.type || "whatsapp", body.label || "Nuevo contacto", body.value || "", body.url || "", body.description || "", Number(body.sortOrder || 0), body.isActive !== false]
    );
    return res.status(201).json({ channel: normalizeChannel(result.rows[0]) });
  } catch (error) {
    console.error("CREATE ADMIN SUPPORT CHANNEL ERROR:", error);
    return res.status(500).json({ message: "Error al crear contacto.", detail: error.message });
  } finally { client.release(); }
}

async function updateAdminSupportChannel(req, res) {
  const id = Number(req.params.id || 0);
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const result = await client.query(
      `UPDATE support_channels SET
        channel_type=COALESCE($2, channel_type),
        label=COALESCE($3, label),
        value=COALESCE($4, value),
        url=COALESCE($5, url),
        description=COALESCE($6, description),
        sort_order=COALESCE($7, sort_order),
        is_active=COALESCE($8, is_active),
        updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, body.type ?? null, body.label ?? null, body.value ?? null, body.url ?? null, body.description ?? null, body.sortOrder ?? null, body.isActive ?? null]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Contacto no encontrado." });
    return res.json({ channel: normalizeChannel(result.rows[0]) });
  } catch (error) {
    console.error("UPDATE ADMIN SUPPORT CHANNEL ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar contacto.", detail: error.message });
  } finally { client.release(); }
}

async function deleteAdminSupportChannel(req, res) {
  const id = Number(req.params.id || 0);
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    await client.query(`DELETE FROM support_channels WHERE id=$1`, [id]);
    return res.json({ message: "Contacto eliminado." });
  } catch (error) {
    console.error("DELETE ADMIN SUPPORT CHANNEL ERROR:", error);
    return res.status(500).json({ message: "Error al eliminar contacto.", detail: error.message });
  } finally { client.release(); }
}

async function listAdminArticles(req, res) {
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const limit = getLimit(req.query.limit, 12, 100);
    const page = getPage(req.query.page);
    const offset = (page - 1) * limit;
    const [countResult, result] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM royal_articles`),
      client.query(`SELECT * FROM royal_articles ORDER BY sort_order ASC, created_at DESC, id DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    ]);
    return res.json({ articles: result.rows.map(normalizeArticle), pagination: { page, limit, total: Number(countResult.rows[0]?.total || 0) } });
  } catch (error) {
    console.error("LIST ADMIN ARTICLES ERROR:", error);
    return res.status(500).json({ message: "Error al listar noticias.", detail: error.message });
  } finally { client.release(); }
}

async function createAdminArticle(req, res) {
  const body = req.body || {};
  const title = String(body.title || "Nueva noticia").trim();
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    let slug = slugify(body.slug || title);
    const exists = await client.query(`SELECT id FROM royal_articles WHERE slug=$1`, [slug]);
    if (exists.rows.length) slug = `${slug}-${Date.now()}`;
    const sections = sanitizeSections(body.sections);
    const status = body.status === "published" ? "published" : "draft";
    const publishedAt = status === "published" ? (normalizePublishedAt(body.publishedAt || body.published_at) || new Date().toISOString()) : null;
    const result = await client.query(
      `INSERT INTO royal_articles(title,slug,summary,cover_image_url,status,sort_order,sections,created_by,published_at,updated_at)
       VALUES ($1::varchar,$2::varchar,$3::text,$4::text,$5::varchar,$6::integer,$7::jsonb,$8::integer,$9::timestamp,NOW()) RETURNING *`,
      [title, slug, body.summary || "", body.coverImageUrl || "", status, Number(body.sortOrder || 0), JSON.stringify(sections), adminId(req), publishedAt]
    );
    return res.status(201).json({ article: normalizeArticle(result.rows[0]) });
  } catch (error) {
    console.error("CREATE ADMIN ARTICLE ERROR:", error);
    return res.status(500).json({ message: "Error al crear noticia.", detail: error.message });
  } finally { client.release(); }
}

async function updateAdminArticle(req, res) {
  const id = Number(req.params.id || 0);
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    const current = await client.query(`SELECT * FROM royal_articles WHERE id=$1`, [id]);
    if (!current.rows.length) return res.status(404).json({ message: "Noticia no encontrada." });
    const row = current.rows[0];
    const title = body.title !== undefined ? String(body.title || row.title).trim() : row.title;
    let slug = body.slug !== undefined ? slugify(body.slug || title) : row.slug;
    if (slug !== row.slug) {
      const exists = await client.query(`SELECT id FROM royal_articles WHERE slug=$1 AND id<>$2`, [slug, id]);
      if (exists.rows.length) slug = `${slug}-${Date.now()}`;
    }
    const status = body.status === "published" ? "published" : body.status === "archived" ? "archived" : "draft";
    const sections = body.sections !== undefined ? sanitizeSections(body.sections) : (Array.isArray(row.sections) ? row.sections : []);
    const publishedAt = status === "published"
      ? (normalizePublishedAt(body.publishedAt || body.published_at) || row.published_at || new Date().toISOString())
      : null;
    const result = await client.query(
      `UPDATE royal_articles SET
        title=$2::varchar, slug=$3::varchar, summary=$4::text, cover_image_url=$5::text, status=$6::varchar, sort_order=$7::integer, sections=$8::jsonb,
        published_at=$9::timestamp,
        updated_at=NOW()
       WHERE id=$1::integer RETURNING *`,
      [id, title, slug, body.summary ?? row.summary ?? "", body.coverImageUrl ?? row.cover_image_url ?? "", status, Number(body.sortOrder ?? row.sort_order ?? 0), JSON.stringify(sections), publishedAt]
    );
    return res.json({ article: normalizeArticle(result.rows[0]) });
  } catch (error) {
    console.error("UPDATE ADMIN ARTICLE ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar noticia.", detail: error.message });
  } finally { client.release(); }
}

async function deleteAdminArticle(req, res) {
  const id = Number(req.params.id || 0);
  const client = await pool.connect();
  try {
    await ensureContentSchema(client);
    await client.query(`DELETE FROM royal_articles WHERE id=$1`, [id]);
    return res.json({ message: "Noticia eliminada." });
  } catch (error) {
    console.error("DELETE ADMIN ARTICLE ERROR:", error);
    return res.status(500).json({ message: "Error al eliminar noticia.", detail: error.message });
  } finally { client.release(); }
}

module.exports = {
  listAdminSupportChannels,
  createAdminSupportChannel,
  updateAdminSupportChannel,
  deleteAdminSupportChannel,
  listAdminArticles,
  createAdminArticle,
  updateAdminArticle,
  deleteAdminArticle,
};
