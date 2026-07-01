// Royal Imperial AI compatibility service
// ------------------------------------------------------------
// Compatibilidad interna: algunos servicios de recarga llaman refreshMiningAccountForUser
// after a deposit is detected. In Royal Imperial AI there is no mining cycle;
// the user's active level is based on valid vip_purchases and AI task rules.
// This lightweight service keeps old deposit/webhook flows working while
// updating the user's Royal level state safely.

async function refreshMiningAccountForUser(client, userId) {
  if (!client || !userId) return { ok: false, skipped: true };

  try {
    // Expire old level purchases first.
    await client.query(
      `
      UPDATE vip_purchases
      SET status = 'expired'
      WHERE user_id = $1
        AND status = 'active'
        AND expires_at <= NOW()
      `,
      [userId]
    );

    // Find the highest active Royal level.
    const activeLevelResult = await client.query(
      `
      SELECT level, expires_at
      FROM vip_purchases
      WHERE user_id = $1
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY level DESC, expires_at DESC
      LIMIT 1
      `,
      [userId]
    );

    const active = activeLevelResult.rows[0];

    if (active) {
      await client.query(
        `
        UPDATE users
        SET
          vip_level = $1,
          vip_expires_at = $2,
          vip_purchased_at = COALESCE(vip_purchased_at, NOW())
        WHERE id = $3
        `,
        [active.level, active.expires_at, userId]
      );

      return { ok: true, vipLevel: Number(active.level), vipExpiresAt: active.expires_at };
    }

    await client.query(
      `
      UPDATE users
      SET vip_level = 0,
          vip_expires_at = NULL
      WHERE id = $1
      `,
      [userId]
    );

    return { ok: true, vipLevel: 0, vipExpiresAt: null };
  } catch (error) {
    // Deposit crediting should not crash because of a level refresh.
    console.warn("ROYAL LEVEL REFRESH WARNING:", error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = { refreshMiningAccountForUser };
