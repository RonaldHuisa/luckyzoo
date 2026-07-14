const slugify = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 90) || `article-${Date.now()}`;

function sanitizeSections(value) {
  const input = Array.isArray(value) ? value : [];
  return input.slice(0, 24).map((section, index) => {
    const type = ["heading", "paragraph", "image", "quote"].includes(section.type) ? section.type : "paragraph";
    return {
      id: section.id || `${Date.now()}-${index}`,
      type,
      title: String(section.title || "").slice(0, 180),
      text: String(section.text || "").slice(0, 6000),
      imageUrl: String(section.imageUrl || section.image_url || "").slice(0, 600),
      imageAlt: String(section.imageAlt || section.image_alt || "").slice(0, 180),
    };
  });
}

async function ensureContentSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS support_channels (
      id SERIAL PRIMARY KEY,
      channel_type VARCHAR(40) NOT NULL DEFAULT 'whatsapp',
      label VARCHAR(120) NOT NULL,
      value VARCHAR(255) NOT NULL,
      url TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_support_channels_active_order ON support_channels(is_active, sort_order, id)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS royal_articles (
      id SERIAL PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      slug VARCHAR(220) NOT NULL UNIQUE,
      summary TEXT,
      cover_image_url TEXT,
      status VARCHAR(30) DEFAULT 'draft' NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      sections JSONB DEFAULT '[]'::jsonb NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP WITHOUT TIME ZONE
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_royal_articles_status_order ON royal_articles(status, sort_order, published_at DESC, id DESC)`);

  const channels = await client.query(`SELECT COUNT(*)::int AS total FROM support_channels`);
  if (Number(channels.rows[0]?.total || 0) === 0) {
    await client.query(
      `INSERT INTO support_channels(channel_type,label,value,url,description,sort_order,is_active) VALUES
       ('whatsapp','Canal oficial WhatsApp','Royal Imperial AI','https://wa.me/','Canal principal para anuncios y soporte general.',1,true),
       ('manager','Gerente de soporte','Configurar número','https://wa.me/','Contacto directo para incidencias de recargas y retiros.',2,true)`
    );
  }
}

module.exports = { ensureContentSchema, slugify, sanitizeSections };
