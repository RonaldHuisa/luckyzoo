const pool = require("../config/db");

function maskEmail(email) {
    if (!email || !email.includes("@")) return "********";

    const [name, domain] = email.split("@");

    if (name.length <= 2) {
        return `${name[0]}***@${domain}`;
    }

    return `${name.slice(0, 2)}${"*".repeat(8)}@${domain}`;
}

function getBaseFrontendUrl() {
    return process.env.FRONTEND_URL || "http://localhost:3000";
}

async function getPromotionDashboard(req, res) {
    try {
        const userId = req.user.userId;

        const userResult = await pool.query(
            `
      SELECT id, email, referral_code
      FROM users
      WHERE id = $1
      `,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "Usuario no encontrado.",
            });
        }

        const user = userResult.rows[0];

        const teamResult = await pool.query(
            `
      WITH RECURSIVE team AS (
        SELECT 
          u.id,
          u.email,
          u.created_at,
          u.vip_level,
          1 AS level
        FROM users u
        WHERE u.referred_by_id = $1

        UNION ALL

        SELECT 
          child.id,
          child.email,
          child.created_at,
          child.vip_level,
          team.level + 1 AS level
        FROM users child
        INNER JOIN team ON child.referred_by_id = team.id
        WHERE team.level < 3
      ),
      team_with_amounts AS (
        SELECT
          team.id,
          team.level,
          team.created_at,
          team.vip_level,
          GREATEST(
            COALESCE(ma.invested_amount, 0),
            COALESCE(u.balance_usdt, 0),
            COALESCE(u.recharge_balance_usdt, 0),
            COALESCE((
              SELECT SUM(d.amount_usdt)
              FROM deposits d
              WHERE d.user_id = team.id
                AND d.status IN ('confirmed', 'completed', 'success')
            ), 0),
            COALESCE((
              SELECT SUM(al.amount_usdt)
              FROM account_ledger al
              WHERE al.user_id = team.id
                AND al.direction = 'credit'
                AND al.balance_type IN ('investment', 'recharge')
                AND al.type IN ('manual_recharge', 'manual_investment', 'deposit', 'deposit_confirmed')
            ), 0)
          ) AS recharge_amount,
          COALESCE((
            SELECT SUM(w.amount_requested)
            FROM withdrawals w
            WHERE w.user_id = team.id
              AND w.status IN ('pending', 'approved', 'paid', 'completed')
          ), 0) AS withdrawal_amount
        FROM team
        INNER JOIN users u ON u.id = team.id
        LEFT JOIN mining_accounts ma ON ma.user_id = team.id
      )
      SELECT
        level,
        COUNT(*) AS total_members,
        COUNT(*) FILTER (WHERE recharge_amount >= 5) AS active_members,
        COALESCE(SUM(recharge_amount), 0) AS team_recharge,
        COALESCE(SUM(withdrawal_amount), 0) AS team_withdrawals
      FROM team_with_amounts
      GROUP BY level
      ORDER BY level
      `,
            [userId]
        );

        const commissionsResult = await pool.query(
            `
      SELECT
        level,
        COALESCE(SUM(amount_usdt), 0) AS total_commission,
        COALESCE(SUM(amount_usdt) FILTER (
          WHERE created_at::date = CURRENT_DATE
        ), 0) AS today_commission
      FROM referral_commissions
      WHERE receiver_user_id = $1
      GROUP BY level
      ORDER BY level
      `,
            [userId]
        );

        const totalIncomeResult = await pool.query(
            `
      SELECT
        COALESCE(SUM(amount_usdt), 0) AS total_income,
        COALESCE(SUM(amount_usdt) FILTER (
          WHERE created_at::date = CURRENT_DATE
        ), 0) AS today_income
      FROM referral_commissions
      WHERE receiver_user_id = $1
      `,
            [userId]
        );

        const todayAddedResult = await pool.query(
            `
      SELECT COUNT(*) AS today_added
      FROM users
      WHERE referred_by_id = $1
      AND created_at::date = CURRENT_DATE
      `,
            [userId]
        );

        const levels = [1, 2, 3].map((level) => {
            const team = teamResult.rows.find((item) => Number(item.level) === level);
            const commission = commissionsResult.rows.find(
                (item) => Number(item.level) === level
            );

            return {
                level,
                totalMembers: Number(team?.total_members || 0),
                activeMembers: Number(team?.active_members || 0),
                teamRecharge: Number(team?.team_recharge || 0),
                teamWithdrawals: Number(team?.team_withdrawals || 0),
                totalCommission: Number(commission?.total_commission || 0),
                todayCommission: Number(commission?.today_commission || 0),
            };
        });

        const totalMembers = levels.reduce(
            (sum, item) => sum + item.totalMembers,
            0
        );

        const totalTeamRecharge = levels.reduce(
            (sum, item) => sum + item.teamRecharge,
            0
        );

        const totalTeamWithdrawals = levels.reduce(
            (sum, item) => sum + item.teamWithdrawals,
            0
        );

        return res.json({
            referralCode: user.referral_code,
            referralLink: `${getBaseFrontendUrl()}/register?ref=${user.referral_code}`,
            totalIncome: totalIncomeResult.rows[0]?.total_income || "0",
            todayIncome: totalIncomeResult.rows[0]?.today_income || "0",
            todayAdded: Number(todayAddedResult.rows[0]?.today_added || 0),
            totalMembers,
            totalTeamRecharge,
            totalTeamWithdrawals,
            levels,
        });
    } catch (error) {
        console.error("GET PROMOTION DASHBOARD ERROR:", error);

        return res.status(500).json({
            message: "Error al obtener datos de promoción.",
            detail: error.message,
        });
    }
}

async function getMembersByLevel(req, res) {
    try {
        const userId = req.user.userId;
        const level = Number(req.params.level);

        if (![1, 2, 3].includes(level)) {
            return res.status(400).json({
                message: "Nivel inválido.",
            });
        }

        const result = await pool.query(
            `
            WITH RECURSIVE team AS (
                SELECT
                    u.id,
                    u.email,
                    u.created_at,
                    1 AS level
                FROM users u
                WHERE u.referred_by_id = $1

                UNION ALL

                SELECT
                    child.id,
                    child.email,
                    child.created_at,
                    team.level + 1 AS level
                FROM users child
                INNER JOIN team ON child.referred_by_id = team.id
                WHERE team.level < 3
            )
            SELECT
                team.id,
                team.email,
                team.created_at,
                (
                    SELECT COUNT(*)
                    FROM users direct
                    WHERE direct.referred_by_id = team.id
                ) AS direct_subordinates,
                COALESCE(
                    ma.invested_amount,
                    u.balance_usdt,
                    u.recharge_balance_usdt,
                    0
                ) AS invested_amount,
                CASE
                    WHEN COALESCE(ma.invested_amount, u.balance_usdt, u.recharge_balance_usdt, 0) >= 5
                    THEN TRUE
                    ELSE FALSE
                END AS is_active
            FROM team
            INNER JOIN users u ON u.id = team.id
            LEFT JOIN mining_accounts ma ON ma.user_id = team.id
            WHERE team.level = $2
            ORDER BY team.created_at DESC
            `,
            [userId, level]
        );

        const members = result.rows.map((item) => ({
            id: item.id,
            email: maskEmail(item.email),
            directSubordinates: Number(item.direct_subordinates || 0),
            investedAmount: Number(item.invested_amount || 0),
            isActive: Boolean(item.is_active),
            registeredAt: item.created_at,
        }));

        return res.json({
            level,
            members,
        });
    } catch (error) {
        console.error("GET MEMBERS BY LEVEL ERROR:", error);

        return res.status(500).json({
            message: "Error al obtener lista de miembros.",
            detail: error.message,
        });
    }
}

async function getReferralRewardsStatus(req, res) {
    try {
        const userId = req.user.userId;

        const directInvitesResult = await pool.query(
            `
            SELECT COUNT(DISTINCT u.id)::int AS direct_invites
            FROM users u
            WHERE u.referred_by_id = $1
            AND EXISTS (
                SELECT 1
                FROM vip_purchases vp
                WHERE vp.user_id = u.id
                AND vp.status IN ('active', 'completed', 'expired')
                AND COALESCE(vp.price_usdt, 0) > 0
            )
            `,
            [userId]
        );

        const directInvites = Number(
            directInvitesResult.rows[0]?.direct_invites || 0
        );

        const tiersResult = await pool.query(
            `
            SELECT
                id,
                required_invites,
                reward_usdt,
                sort_order
            FROM referral_reward_tiers
            WHERE is_active = TRUE
            ORDER BY sort_order ASC, required_invites ASC
            `
        );

        const claimedResult = await pool.query(
            `
            SELECT
                tier_id,
                status,
                invite_count_snapshot,
                reward_usdt,
                claimed_at,
                created_at
            FROM user_referral_rewards
            WHERE user_id = $1
            `,
            [userId]
        );

        const claimedMap = new Map(
            claimedResult.rows.map((item) => [Number(item.tier_id), item])
        );

        const tiers = tiersResult.rows.map((tier) => {
            const requiredInvites = Number(tier.required_invites || 0);
            const claimed = claimedMap.get(Number(tier.id));
            const reached = directInvites >= requiredInvites;

            let status = "locked";

            if (claimed) {
                status = claimed.status || "claimed";
            } else if (reached) {
                status = "available";
            }

            return {
                id: Number(tier.id),
                requiredInvites,
                rewardUsdt: Number(tier.reward_usdt || 0),
                sortOrder: Number(tier.sort_order || 0),
                status,
                reached,
                claimedAt: claimed?.claimed_at || null,
                inviteCountSnapshot: claimed
                    ? Number(claimed.invite_count_snapshot || 0)
                    : null,
            };
        });

        const nextTier =
            tiers.find((tier) => tier.status === "available") ||
            tiers.find((tier) => tier.status === "locked") ||
            null;

        const progressTarget = nextTier?.requiredInvites || tiers.at(-1)?.requiredInvites || 1;
        const progressPercent = Math.min(
            100,
            Math.round((directInvites / progressTarget) * 100)
        );

        const totalClaimedUsdt = tiers
            .filter((tier) => tier.status === "claimed" || tier.status === "paid")
            .reduce((sum, tier) => sum + Number(tier.rewardUsdt || 0), 0);

        return res.json({
            directInvites,
            nextTier,
            progressTarget,
            progressPercent,
            totalClaimedUsdt,
            tiers,
        });
    } catch (error) {
        console.error("GET REFERRAL REWARDS STATUS ERROR:", error);

        return res.status(500).json({
            message: "Error al obtener premios por invitación.",
            detail: error.message,
        });
    }
}

async function claimReferralReward(req, res) {
    const client = await pool.connect();

    try {
        const userId = req.user.userId;
        const tierId = Number(req.body.tierId);

        if (!tierId) {
            return res.status(400).json({
                message: "Premio inválido.",
            });
        }

        await client.query("BEGIN");

        const tierResult = await client.query(
            `
            SELECT
                id,
                required_invites,
                reward_usdt
            FROM referral_reward_tiers
            WHERE id = $1
            AND is_active = TRUE
            FOR UPDATE
            `,
            [tierId]
        );

        if (tierResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Premio no encontrado.",
            });
        }

        const tier = tierResult.rows[0];

        const directInvitesResult = await client.query(
            `
            SELECT COUNT(DISTINCT u.id)::int AS direct_invites
            FROM users u
            WHERE u.referred_by_id = $1
            AND EXISTS (
                SELECT 1
                FROM vip_purchases vp
                WHERE vp.user_id = u.id
                AND vp.status IN ('active', 'completed', 'expired')
                AND COALESCE(vp.price_usdt, 0) > 0
            )
            `,
            [userId]
        );

        const directInvites = Number(
            directInvitesResult.rows[0]?.direct_invites || 0
        );

        const requiredInvites = Number(tier.required_invites || 0);
        const rewardUsdt = Number(tier.reward_usdt || 0);

        if (directInvites < requiredInvites) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: `Necesitas ${requiredInvites} invitados directos con VIP comprado para reclamar este premio.`,
            });
        }

        const rewardResult = await client.query(
            `
            INSERT INTO user_referral_rewards
            (
                user_id,
                tier_id,
                invite_count_snapshot,
                reward_usdt,
                status,
                claimed_at
            )
            VALUES ($1, $2, $3, $4, 'claimed', CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, tier_id) DO NOTHING
            RETURNING id
            `,
            [userId, tierId, directInvites, rewardUsdt]
        );

        if (rewardResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Este premio ya fue reclamado.",
            });
        }

        const rewardId = rewardResult.rows[0].id;

        await client.query(
            `
            UPDATE users
            SET withdrawable_usdt = COALESCE(withdrawable_usdt, 0) + $1
            WHERE id = $2
            `,
            [rewardUsdt, userId]
        );

        await client.query(
            `
            INSERT INTO account_ledger
            (
                user_id,
                balance_type,
                direction,
                type,
                title,
                amount_usdt,
                description,
                reference_type,
                reference_id,
                metadata,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
            `,
            [
                userId,
                "withdrawable",
                "credit",
                "referral_invite_reward",
                `Premio por ${requiredInvites} invitados`,
                rewardUsdt,
                `Premio por alcanzar ${requiredInvites} invitados directos con VIP comprado.`,
                "referral_reward",
                rewardId,
                JSON.stringify({
                    tierId,
                    requiredInvites,
                    directInvites,
                    rewardUsdt,
                }),
                "completed",
            ]
        );

        await client.query("COMMIT");

        return res.json({
            message: `Premio reclamado: ${rewardUsdt.toFixed(2)} USDT.`,
            rewardUsdt,
            directInvites,
            requiredInvites,
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("CLAIM REFERRAL REWARD ERROR:", error);

        return res.status(500).json({
            message: "Error al reclamar premio por invitación.",
            detail: error.message,
        });
    } finally {
        client.release();
    }
}


module.exports = {
    getPromotionDashboard,
    getMembersByLevel,
    getReferralRewardsStatus,
    claimReferralReward,
};