const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const pool = require("../config/db");

const MAX_IMAGE_SIZE_BYTES = 500 * 1024;
const MAX_IMAGES_PER_MESSAGE = 3;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);

const rawSupportImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: MAX_IMAGES_PER_MESSAGE,
  },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const validExt = [".jpg", ".jpeg", ".png"].includes(ext);
    if (!ALLOWED_IMAGE_MIMES.has(file.mimetype) || !validExt) {
      return cb(new Error("Solo se permiten imágenes JPG o PNG."));
    }
    return cb(null, true);
  },
}).array("images", MAX_IMAGES_PER_MESSAGE);

function uploadSupportImages(req, res, next) {
  rawSupportImageUpload(req, res, (error) => {
    if (!error) return next();

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Cada imagen debe pesar máximo 500kB." });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ message: `Puedes enviar máximo ${MAX_IMAGES_PER_MESSAGE} imágenes por mensaje.` });
    }

    return res.status(400).json({ message: error.message || "No se pudo subir la imagen." });
  });
}

async function ensureSupportSchema(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(180) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_user_read_at TIMESTAMP NULL,
      last_admin_read_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id BIGSERIAL PRIMARY KEY,
      ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      sender_role VARCHAR(16) NOT NULL CHECK (sender_role IN ('user','admin')),
      body TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS support_message_attachments (
      id BIGSERIAL PRIMARY KEY,
      message_id BIGINT NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
      file_url TEXT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NULL,
      mime_type VARCHAR(80) NOT NULL,
      size_bytes INTEGER NOT NULL,
      file_data BYTEA NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`ALTER TABLE support_message_attachments ADD COLUMN IF NOT EXISTS file_data BYTEA NULL`);
  await client.query(`ALTER TABLE support_message_attachments ALTER COLUMN file_url DROP NOT NULL`);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, last_message_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, last_message_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at ASC, id ASC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_support_attachments_message ON support_message_attachments(message_id, id ASC)`);
}

function cleanSubject(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function cleanMessage(value) {
  return String(value || "").trim().slice(0, 4000);
}

function mapTicket(row) {
  return {
    id: Number(row.id),
    userId: row.user_id ? Number(row.user_id) : null,
    email: row.email || "",
    subject: row.subject || "",
    status: row.status || "open",
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unreadAdminMessages: Number(row.unread_admin_messages || 0),
    unreadUserMessages: Number(row.unread_user_messages || 0),
    totalMessages: Number(row.total_messages || 0),
    lastMessage: row.last_message || "",
  };
}

function mapAttachment(row) {
  const buffer = row.file_data || null;
  const dataUrl = buffer
    ? `data:${row.mime_type};base64,${Buffer.from(buffer).toString("base64")}`
    : null;

  return {
    id: Number(row.id),
    messageId: Number(row.message_id),
    fileUrl: row.file_url || "",
    dataUrl,
    fileName: row.file_name,
    originalName: row.original_name || "",
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    createdAt: row.created_at,
  };
}

function mapMessage(row) {
  return {
    id: Number(row.id),
    ticketId: Number(row.ticket_id),
    senderUserId: row.sender_user_id ? Number(row.sender_user_id) : null,
    senderRole: row.sender_role,
    body: row.body || "",
    createdAt: row.created_at,
    email: row.email || "",
    attachments: row.attachments || [],
  };
}

async function insertAttachments(client, messageId, files = []) {
  if (!Array.isArray(files) || files.length === 0) return [];

  const saved = [];
  for (const file of files) {
    const ext = file.mimetype === "image/png" ? ".png" : ".jpg";
    const fileName = `support-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const result = await client.query(
      `
      INSERT INTO support_message_attachments
        (message_id, file_url, file_name, original_name, mime_type, size_bytes, file_data)
      VALUES ($1, NULL, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [messageId, fileName, file.originalname || fileName, file.mimetype, file.size, file.buffer]
    );
    saved.push(mapAttachment(result.rows[0]));
  }
  return saved;
}

async function attachFilesToMessages(client, messages = []) {
  if (!messages.length) return [];

  const ids = messages.map((item) => item.id);
  const result = await client.query(
    `
    SELECT *
    FROM support_message_attachments
    WHERE message_id = ANY($1::bigint[])
    ORDER BY id ASC
    `,
    [ids]
  );

  const grouped = new Map();
  for (const row of result.rows) {
    const key = Number(row.message_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(mapAttachment(row));
  }

  return messages.map((message) => ({
    ...message,
    attachments: grouped.get(Number(message.id)) || [],
  }));
}

async function getUserSupportSummary(req, res) {
  const userId = req.user.userId;

  try {
    await ensureSupportSchema();
    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE t.status <> 'closed')::int AS open_tickets,
        COALESCE(SUM((
          SELECT COUNT(*)
          FROM support_messages m
          WHERE m.ticket_id = t.id
            AND m.sender_role = 'admin'
            AND (t.last_user_read_at IS NULL OR m.created_at > t.last_user_read_at)
        )), 0)::int AS unread_admin_messages
      FROM support_tickets t
      WHERE t.user_id = $1
      `,
      [userId]
    );

    return res.json({
      openTickets: Number(result.rows[0]?.open_tickets || 0),
      unreadAdminMessages: Number(result.rows[0]?.unread_admin_messages || 0),
    });
  } catch (error) {
    console.error("SUPPORT SUMMARY ERROR:", error);
    return res.status(500).json({ message: "No se pudo cargar soporte." });
  }
}

async function listUserTickets(req, res) {
  const userId = req.user.userId;

  try {
    await ensureSupportSchema();
    const result = await pool.query(
      `
      SELECT
        t.*,
        (
          SELECT COUNT(*)
          FROM support_messages m
          WHERE m.ticket_id = t.id
            AND m.sender_role = 'admin'
            AND (t.last_user_read_at IS NULL OR m.created_at > t.last_user_read_at)
        )::int AS unread_admin_messages,
        (
          SELECT COUNT(*)
          FROM support_messages m
          WHERE m.ticket_id = t.id
        )::int AS total_messages,
        (
          SELECT m.body
          FROM support_messages m
          WHERE m.ticket_id = t.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message
      FROM support_tickets t
      WHERE t.user_id = $1
      ORDER BY t.last_message_at DESC, t.id DESC
      LIMIT 50
      `,
      [userId]
    );

    return res.json({ tickets: result.rows.map(mapTicket) });
  } catch (error) {
    console.error("LIST USER SUPPORT TICKETS ERROR:", error);
    return res.status(500).json({ message: "No se pudieron cargar tus tickets." });
  }
}

async function createUserTicket(req, res) {
  const userId = req.user.userId;
  const subject = cleanSubject(req.body?.subject);
  const body = cleanMessage(req.body?.message || req.body?.body);
  const files = Array.isArray(req.files) ? req.files : [];

  if (!subject || subject.length < 4) {
    return res.status(400).json({ message: "Escribe un asunto válido." });
  }

  if ((!body || body.length < 2) && files.length === 0) {
    return res.status(400).json({ message: "Escribe el detalle de tu consulta o adjunta una imagen." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureSupportSchema(client);

    const ticketResult = await client.query(
      `
      INSERT INTO support_tickets
        (user_id, subject, status, last_message_at, last_user_read_at, updated_at)
      VALUES ($1, $2, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [userId, subject]
    );

    const ticket = ticketResult.rows[0];

    const messageResult = await client.query(
      `
      INSERT INTO support_messages (ticket_id, sender_user_id, sender_role, body)
      VALUES ($1, $2, 'user', $3)
      RETURNING *
      `,
      [ticket.id, userId, body || "Imagen adjunta"]
    );

    await insertAttachments(client, messageResult.rows[0].id, files);

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Ticket creado correctamente.",
      ticket: mapTicket({ ...ticket, total_messages: 1, unread_admin_messages: 0, last_message: body || "Imagen adjunta" }),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CREATE USER SUPPORT TICKET ERROR:", error);
    return res.status(500).json({ message: "No se pudo crear el ticket." });
  } finally {
    client.release();
  }
}

async function readUserTicket(req, res) {
  const userId = req.user.userId;
  const ticketId = Number(req.params.ticketId);

  if (!ticketId) return res.status(400).json({ message: "Ticket inválido." });

  try {
    await ensureSupportSchema();

    const ticketResult = await pool.query(
      `
      SELECT t.*
      FROM support_tickets t
      WHERE t.id = $1 AND t.user_id = $2
      LIMIT 1
      `,
      [ticketId, userId]
    );

    if (!ticketResult.rows.length) {
      return res.status(404).json({ message: "Ticket no encontrado." });
    }

    await pool.query(
      `UPDATE support_tickets SET last_user_read_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`,
      [ticketId, userId]
    );

    const messagesResult = await pool.query(
      `
      SELECT m.*, u.email
      FROM support_messages m
      LEFT JOIN users u ON u.id = m.sender_user_id
      WHERE m.ticket_id = $1
      ORDER BY m.created_at ASC, m.id ASC
      `,
      [ticketId]
    );

    const messages = await attachFilesToMessages(pool, messagesResult.rows.map(mapMessage));

    return res.json({
      ticket: mapTicket({ ...ticketResult.rows[0], unread_admin_messages: 0 }),
      messages,
    });
  } catch (error) {
    console.error("READ USER SUPPORT TICKET ERROR:", error);
    return res.status(500).json({ message: "No se pudo abrir el ticket." });
  }
}

async function addUserTicketMessage(req, res) {
  const userId = req.user.userId;
  const ticketId = Number(req.params.ticketId);
  const body = cleanMessage(req.body?.message || req.body?.body);
  const files = Array.isArray(req.files) ? req.files : [];

  if (!ticketId) return res.status(400).json({ message: "Ticket inválido." });
  if ((!body || body.length < 2) && files.length === 0) return res.status(400).json({ message: "Escribe una respuesta o adjunta una imagen." });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureSupportSchema(client);

    const ticketResult = await client.query(
      `
      SELECT id, user_id, status
      FROM support_tickets
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
      `,
      [ticketId, userId]
    );

    if (!ticketResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Ticket no encontrado." });
    }

    const messageResult = await client.query(
      `
      INSERT INTO support_messages (ticket_id, sender_user_id, sender_role, body)
      VALUES ($1, $2, 'user', $3)
      RETURNING *
      `,
      [ticketId, userId, body || "Imagen adjunta"]
    );

    await insertAttachments(client, messageResult.rows[0].id, files);

    await client.query(
      `
      UPDATE support_tickets
      SET status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
          last_message_at = CURRENT_TIMESTAMP,
          last_user_read_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [ticketId]
    );

    await client.query("COMMIT");

    return res.status(201).json({ message: "Respuesta enviada." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADD USER SUPPORT MESSAGE ERROR:", error);
    return res.status(500).json({ message: "No se pudo enviar la respuesta." });
  } finally {
    client.release();
  }
}

async function listAdminTickets(req, res) {
  try {
    await ensureSupportSchema();
    const result = await pool.query(
      `
      SELECT
        t.*,
        u.email,
        (
          SELECT COUNT(*)
          FROM support_messages m
          WHERE m.ticket_id = t.id
            AND m.sender_role = 'user'
            AND (t.last_admin_read_at IS NULL OR m.created_at > t.last_admin_read_at)
        )::int AS unread_user_messages,
        (
          SELECT COUNT(*)
          FROM support_messages m
          WHERE m.ticket_id = t.id
        )::int AS total_messages,
        (
          SELECT m.body
          FROM support_messages m
          WHERE m.ticket_id = t.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      ORDER BY
        CASE WHEN t.status = 'open' THEN 0 WHEN t.status = 'answered' THEN 1 ELSE 2 END,
        t.last_message_at DESC,
        t.id DESC
      LIMIT 120
      `
    );

    const unreadTotal = result.rows.reduce((sum, row) => sum + Number(row.unread_user_messages || 0), 0);

    return res.json({ tickets: result.rows.map(mapTicket), unreadUserMessages: unreadTotal });
  } catch (error) {
    console.error("LIST ADMIN SUPPORT TICKETS ERROR:", error);
    return res.status(500).json({ message: "No se pudieron cargar tickets de soporte." });
  }
}

async function readAdminTicket(req, res) {
  const ticketId = Number(req.params.ticketId);
  if (!ticketId) return res.status(400).json({ message: "Ticket inválido." });

  try {
    await ensureSupportSchema();

    const ticketResult = await pool.query(
      `
      SELECT t.*, u.email
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = $1
      LIMIT 1
      `,
      [ticketId]
    );

    if (!ticketResult.rows.length) return res.status(404).json({ message: "Ticket no encontrado." });

    await pool.query(`UPDATE support_tickets SET last_admin_read_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticketId]);

    const messagesResult = await pool.query(
      `
      SELECT m.*, u.email
      FROM support_messages m
      LEFT JOIN users u ON u.id = m.sender_user_id
      WHERE m.ticket_id = $1
      ORDER BY m.created_at ASC, m.id ASC
      `,
      [ticketId]
    );

    const messages = await attachFilesToMessages(pool, messagesResult.rows.map(mapMessage));

    return res.json({
      ticket: mapTicket({ ...ticketResult.rows[0], unread_user_messages: 0 }),
      messages,
    });
  } catch (error) {
    console.error("READ ADMIN SUPPORT TICKET ERROR:", error);
    return res.status(500).json({ message: "No se pudo abrir ticket." });
  }
}

async function addAdminTicketMessage(req, res) {
  const adminUserId = req.user.userId;
  const ticketId = Number(req.params.ticketId);
  const body = cleanMessage(req.body?.message || req.body?.body);
  const files = Array.isArray(req.files) ? req.files : [];

  if (!ticketId) return res.status(400).json({ message: "Ticket inválido." });
  if ((!body || body.length < 2) && files.length === 0) return res.status(400).json({ message: "Escribe una respuesta o adjunta una imagen." });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureSupportSchema(client);

    const ticketResult = await client.query(
      `SELECT id, status FROM support_tickets WHERE id = $1 FOR UPDATE`,
      [ticketId]
    );

    if (!ticketResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Ticket no encontrado." });
    }

    const messageResult = await client.query(
      `
      INSERT INTO support_messages (ticket_id, sender_user_id, sender_role, body)
      VALUES ($1, $2, 'admin', $3)
      RETURNING *
      `,
      [ticketId, adminUserId, body || "Imagen adjunta"]
    );

    await insertAttachments(client, messageResult.rows[0].id, files);

    await client.query(
      `
      UPDATE support_tickets
      SET status = 'answered',
          last_message_at = CURRENT_TIMESTAMP,
          last_admin_read_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [ticketId]
    );

    await client.query("COMMIT");

    return res.status(201).json({ message: "Respuesta enviada." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADD ADMIN SUPPORT MESSAGE ERROR:", error);
    return res.status(500).json({ message: "No se pudo responder ticket." });
  } finally {
    client.release();
  }
}

async function updateAdminTicketStatus(req, res) {
  const ticketId = Number(req.params.ticketId);
  const status = String(req.body?.status || "").trim().toLowerCase();

  if (!ticketId) return res.status(400).json({ message: "Ticket inválido." });
  if (!["open", "answered", "closed"].includes(status)) {
    return res.status(400).json({ message: "Estado inválido." });
  }

  try {
    await ensureSupportSchema();
    const result = await pool.query(
      `
      UPDATE support_tickets
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [status, ticketId]
    );

    if (!result.rows.length) return res.status(404).json({ message: "Ticket no encontrado." });

    return res.json({ message: "Estado actualizado.", ticket: mapTicket(result.rows[0]) });
  } catch (error) {
    console.error("UPDATE ADMIN SUPPORT STATUS ERROR:", error);
    return res.status(500).json({ message: "No se pudo actualizar ticket." });
  }
}

module.exports = {
  ensureSupportSchema,
  uploadSupportImages,
  getUserSupportSummary,
  listUserTickets,
  createUserTicket,
  readUserTicket,
  addUserTicketMessage,
  listAdminTickets,
  readAdminTicket,
  addAdminTicketMessage,
  updateAdminTicketStatus,
};
