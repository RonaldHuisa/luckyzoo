const pool = require('../config/db');
const { getBonusStatus, claimCheckin, claimTaskTier } = require('../services/bonusService');
const { isNoPlanBalanceCapError } = require('../services/noPlanBalanceCapService');

function getAuthUserId(req) {
  return req.user?.userId || req.user?.id;
}

async function getStatus(req, res) {
  const userId = getAuthUserId(req);
  try {
    const status = await getBonusStatus(userId, pool);
    if (!status) return res.status(404).json({ message: 'Usuario no encontrado.' });
    return res.json(status);
  } catch (error) {
    console.error('BONUS STATUS ERROR:', error);
    return res.status(500).json({ message: 'Error al obtener los bonos.', detail: error.message });
  }
}

async function postCheckin(req, res) {
  const userId = getAuthUserId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await claimCheckin(userId, client);
    const status = await getBonusStatus(userId, client);
    await client.query('COMMIT');
    return res.json({ message: row.creditMessage || 'Check-in acreditado correctamente.', checkin: row, status });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const message = error.message || 'No se pudo completar el check-in.';
    if (message.includes('ya fue registrado')) {
      try {
        const status = await getBonusStatus(userId, pool);
        return res.json({ message, status });
      } catch (_) {
        return res.json({ message });
      }
    }
    if (!isNoPlanBalanceCapError(error)) {
      console.error('BONUS CHECKIN ERROR:', error);
    }
    return res.status(400).json({ message, code: error.code || null });
  } finally {
    client.release();
  }
}

async function postTaskClaim(req, res) {
  const userId = getAuthUserId(req);
  const tierKey = String(req.body?.tierKey || '').trim();
  if (!tierKey) return res.status(400).json({ message: 'Selecciona una tarea válida.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await claimTaskTier(userId, tierKey, client);
    const status = await getBonusStatus(userId, client);
    await client.query('COMMIT');
    return res.json({ message: row.creditMessage || 'Recompensa acreditada correctamente.', claim: row, status });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (!isNoPlanBalanceCapError(error)) {
      console.error('BONUS TASK CLAIM ERROR:', error);
    }
    const message = error.message || 'No se pudo reclamar la recompensa.';
    return res.status(400).json({ message, code: error.code || null });
  } finally {
    client.release();
  }
}

module.exports = {
  getStatus,
  postCheckin,
  postTaskClaim,
};
