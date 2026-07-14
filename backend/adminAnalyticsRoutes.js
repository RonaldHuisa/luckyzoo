const pool = require("../config/db");

async function adminMiddleware(req, res, next) {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      SELECT id, is_admin
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Usuario no encontrado.",
      });
    }

    if (!result.rows[0].is_admin) {
      return res.status(403).json({
        message: "Acceso denegado. Solo administrador.",
      });
    }

    next();
  } catch (error) {
    console.error("ADMIN MIDDLEWARE ERROR:", error);
    return res.status(500).json({
      message: "Error validando administrador.",
    });
  }
}

module.exports = adminMiddleware;