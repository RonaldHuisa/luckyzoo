const pool = require("../config/db");
const { ethers } = require("ethers");
const { getEvmUsdtTransfers } = require("./moralisService");
const { refreshMiningAccountForUser } = require("./miningService");
const { createReferralCommissions } = require("./referralCommissionService");
const {
  getPaymentNetwork,
  getNetworkTokenDecimals,
  listPaymentNetworks,
} = require("../utils/paymentNetworks");

let scannerRunning = false;

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTokenRaw(rawAmount, decimals) {
  return ethers.formatUnits(rawAmount.toString(), decimals);
}

function getDepositScanMaxAttempts() {
  const parsed = Number(process.env.DEPOSIT_SCAN_MAX_ATTEMPTS || 5);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function getPendingWindowMinutes() {
  const parsed = Number(process.env.DEPOSIT_PENDING_WINDOW_MINUTES || 30);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

async function ensurePendingScanSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deposit_scan_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wallet_id INTEGER REFERENCES wallets(id) ON DELETE SET NULL,
      network VARCHAR(50) NOT NULL,
      wallet_address VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      added_deposits INTEGER NOT NULL DEFAULT 0,
      detected_transfers INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_checked_at TIMESTAMP WITHOUT TIME ZONE,
      expires_at TIMESTAMP WITHOUT TIME ZONE,
      completed_at TIMESTAMP WITHOUT TIME ZONE,
      metadata JSONB DEFAULT '{}'::jsonb
    )
  `);

  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS wallet_id INTEGER`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS network VARCHAR(50)`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(255)`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending'`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS added_deposits INTEGER DEFAULT 0`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS detected_transfers INTEGER DEFAULT 0`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS last_error TEXT`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP WITHOUT TIME ZONE`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITHOUT TIME ZONE`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITHOUT TIME ZONE`);
  await client.query(`ALTER TABLE deposit_scan_requests ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_deposit_scan_requests_pending
    ON deposit_scan_requests(status, expires_at, last_checked_at)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_deposit_scan_requests_user_network
    ON deposit_scan_requests(user_id, wallet_id, network, status)
  `);
}

async function markOrCreatePendingScanRequest({
  userId,
  walletId,
  networkCode,
  walletAddress,
  windowMinutes = getPendingWindowMinutes(),
  source = "button",
}) {
  const client = await pool.connect();
  try {
    await ensurePendingScanSchema(client);

    const active = await client.query(
      `
      SELECT *
      FROM deposit_scan_requests
      WHERE user_id = $1
        AND wallet_id = $2
        AND network = $3
        AND status = 'pending'
        AND COALESCE(expires_at, CURRENT_TIMESTAMP) > CURRENT_TIMESTAMP
      ORDER BY requested_at DESC
      LIMIT 1
      `,
      [userId, walletId, networkCode]
    );

    if (active.rows.length > 0) {
      const updated = await client.query(
        `
        UPDATE deposit_scan_requests
        SET
          requested_at = CURRENT_TIMESTAMP,
          expires_at = CURRENT_TIMESTAMP + ($3::text || ' minutes')::interval,
          wallet_address = $2,
          metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
        WHERE id = $1
        RETURNING *
        `,
        [
          active.rows[0].id,
          walletAddress,
          windowMinutes,
          JSON.stringify({ lastSource: source, refreshedAt: new Date().toISOString(), network: networkCode }),
        ]
      );
      return updated.rows[0];
    }

    const created = await client.query(
      `
      INSERT INTO deposit_scan_requests
      (
        user_id,
        wallet_id,
        network,
        wallet_address,
        status,
        attempts,
        added_deposits,
        detected_transfers,
        requested_at,
        expires_at,
        metadata
      )
      VALUES ($1,$2,$3,$4,'pending',0,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + ($5::text || ' minutes')::interval,$6::jsonb)
      RETURNING *
      `,
      [
        userId,
        walletId,
        networkCode,
        walletAddress,
        windowMinutes,
        JSON.stringify({ source, createdAt: new Date().toISOString() }),
      ]
    );

    return created.rows[0];
  } finally {
    client.release();
  }
}

async function ensurePaymentNetworkScan(client, walletId, networkCode) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS payment_network_scans (
      id SERIAL PRIMARY KEY,
      wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      network VARCHAR(30) NOT NULL,
      last_scanned_block BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_id, network)
    )
  `);

  const inserted = await client.query(
    `
    INSERT INTO payment_network_scans (wallet_id, network, last_scanned_block)
    VALUES ($1, $2, 0)
    ON CONFLICT (wallet_id, network) DO NOTHING
    RETURNING id, last_scanned_block
    `,
    [walletId, networkCode]
  );

  if (inserted.rows.length > 0) return inserted.rows[0];

  const existing = await client.query(
    `
    SELECT id, last_scanned_block
    FROM payment_network_scans
    WHERE wallet_id = $1 AND network = $2
    LIMIT 1
    `,
    [walletId, networkCode]
  );

  return existing.rows[0] || { last_scanned_block: 0 };
}

async function insertLedgerIfMissing(client, { userId, depositId, network, amountUsdt, transfer }) {
  const exists = await client.query(
    `
    SELECT id
    FROM account_ledger
    WHERE reference_type = 'deposit'
      AND reference_id = $1
      AND type = 'deposit_confirmed'
    LIMIT 1
    `,
    [depositId]
  );

  if (exists.rows.length > 0) return false;

  await client.query(
    `
    INSERT INTO account_ledger
    (
      user_id,
      type,
      title,
      amount_usdt,
      balance_type,
      direction,
      description,
      reference_type,
      reference_id,
      status,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    `,
    [
      userId,
      "deposit_confirmed",
      `Recarga ${network.code}`,
      amountUsdt,
      "investment",
      "credit",
      `Depósito USDT detectado automáticamente en ${network.displayName}`,
      "deposit",
      depositId,
      "completed",
      JSON.stringify({
        network: network.code,
        txHash: transfer.txHash,
        logIndex: transfer.logIndex,
        blockNumber: transfer.blockNumber,
        scanner: "moralis-luvensvc",
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
      }),
    ]
  );

  return true;
}

async function scanWalletNetwork(wallet, networkCode) {
  const network = getPaymentNetwork(networkCode, { deposit: true });
  const client = await pool.connect();

  let addedDeposits = 0;
  let detectedTransfers = 0;
  let addedAmountRaw = 0n;
  let creditedAmountRaw = 0n;
  let highestBlock = 0;
  let currentBalanceUsdt = "0";
  let currentRechargeBalanceUsdt = "0";

  try {
    const scanState = await ensurePaymentNetworkScan(client, wallet.id, network.code);
    const lastScannedBlock = Number(scanState?.last_scanned_block || 0);
    highestBlock = lastScannedBlock;

    const options = {};
    if (lastScannedBlock > 0) {
      const lookbackBlocks = Number(
        process.env.EVM_RESCAN_LOOKBACK_BLOCKS ||
        process.env.BSC_RESCAN_LOOKBACK_BLOCKS ||
        300
      );
      options.fromBlock = Math.max(lastScannedBlock - lookbackBlocks, 0);
    } else if (wallet.created_at) {
      const createdAt = new Date(wallet.created_at);
      createdAt.setMinutes(createdAt.getMinutes() - 10);
      options.fromDate = createdAt.toISOString();
    }

    const transfers = await getEvmUsdtTransfers(wallet.address, network.code, options);
    detectedTransfers = transfers.length;

    console.log(`MORALIS SCAN ${network.code} wallet=${wallet.address}: detected=${detectedTransfers}`);

    await client.query("BEGIN");

    for (const transfer of transfers) {
      if (Number(transfer.blockNumber) > highestBlock) highestBlock = Number(transfer.blockNumber);

      const insertedDeposit = await client.query(
        `
        INSERT INTO deposits
        (
          user_id,
          wallet_id,
          network,
          token_contract,
          tx_hash,
          log_index,
          block_number,
          amount_raw,
          amount_usdt,
          status,
          sweep_status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed','pending')
        ON CONFLICT (tx_hash, log_index) DO NOTHING
        RETURNING id, amount_usdt
        `,
        [
          wallet.user_id,
          wallet.id,
          network.code,
          transfer.tokenContract,
          transfer.txHash,
          transfer.logIndex,
          transfer.blockNumber,
          transfer.amountRaw,
          transfer.amountUsdt,
        ]
      );

      if (insertedDeposit.rows.length === 0) {
        continue;
      }

      const depositId = insertedDeposit.rows[0].id;
      const amountUsdt = insertedDeposit.rows[0].amount_usdt;

      addedDeposits += 1;
      addedAmountRaw += BigInt(transfer.amountRaw);

      await insertLedgerIfMissing(client, {
        userId: wallet.user_id,
        depositId,
        network,
        amountUsdt,
        transfer,
      });

      await client.query(
        `
        UPDATE users
        SET
          balance_usdt = COALESCE(balance_usdt, 0) + $1,
          recharge_balance_usdt = COALESCE(recharge_balance_usdt, 0) + $1
        WHERE id = $2
        `,
        [amountUsdt, wallet.user_id]
      );

      creditedAmountRaw += BigInt(transfer.amountRaw);

      await refreshMiningAccountForUser(client, wallet.user_id);

      await createReferralCommissions(
        client,
        wallet.user_id,
        "deposit",
        depositId,
        amountUsdt
      );
    }

    if (highestBlock > lastScannedBlock) {
      await client.query(
        `
        UPDATE payment_network_scans
        SET last_scanned_block = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE wallet_id = $2 AND network = $3
        `,
        [highestBlock, wallet.id, network.code]
      );
    }

    const balanceResult = await client.query(
      `
      SELECT
        COALESCE(balance_usdt, 0) AS balance_usdt,
        COALESCE(recharge_balance_usdt, 0) AS recharge_balance_usdt
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [wallet.user_id]
    );

    currentBalanceUsdt = String(balanceResult.rows[0]?.balance_usdt || "0");
    currentRechargeBalanceUsdt = String(balanceResult.rows[0]?.recharge_balance_usdt || "0");

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`DEPOSIT SCAN ERROR ${networkCode} wallet ${wallet.address}:`, error.message);
    return {
      userId: wallet.user_id,
      walletId: wallet.id,
      address: wallet.address,
      network: networkCode,
      status: "failed",
      detail: error.message,
      providersUsed: ["moralis"],
    };
  } finally {
    client.release();
  }

  return {
    userId: wallet.user_id,
    walletId: wallet.id,
    address: wallet.address,
    network: network.code,
    status: "ok",
    detectedTransfers,
    addedDeposits,
    addedAmount: formatTokenRaw(addedAmountRaw, getNetworkTokenDecimals(network)),
    creditedAmount: formatTokenRaw(creditedAmountRaw, getNetworkTokenDecimals(network)),
    repairedDeposits: 0,
    reconciledCreditAmount: "0",
    reconciledDepositTotal: "0",
    currentBalanceUsdt,
    currentRechargeBalanceUsdt,
    highestBlock,
    providersUsed: ["moralis"],
    sweep: null,
  };
}

function isCreditedScanResult(result) {
  return (
    Number(result?.creditedAmount || 0) > 0 ||
    Number(result?.addedDeposits || 0) > 0 ||
    Number(result?.addedAmount || 0) > 0
  );
}

async function scanPendingDepositRequests({ limit = 20 } = {}) {
  if (scannerRunning) {
    return { status: "skipped", message: "Scanner ya está ejecutándose." };
  }

  scannerRunning = true;
  const client = await pool.connect();

  try {
    await ensurePendingScanSchema(client);
    const maxAttempts = getDepositScanMaxAttempts();
    const pendingMinutes = Number(process.env.AUTO_DEPOSIT_SCAN_PENDING_MINUTES || 5);

    await client.query(
      `
      UPDATE deposit_scan_requests
      SET status = 'expired',
          last_error = COALESCE(last_error, 'Solicitud expirada sin depósito nuevo detectado')
      WHERE status = 'pending'
        AND (
          (expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP)
          OR COALESCE(attempts, 0) >= $1
        )
      `,
      [maxAttempts]
    );

    const pendingResult = await client.query(
      `
      SELECT
        dsr.id AS request_id,
        dsr.attempts,
        dsr.network AS request_network,
        w.id,
        w.user_id,
        w.network,
        w.address,
        w.created_at,
        w.last_scanned_block
      FROM deposit_scan_requests dsr
      JOIN wallets w ON w.id = dsr.wallet_id
      WHERE dsr.status = 'pending'
        AND COALESCE(dsr.attempts, 0) < $3
        AND COALESCE(dsr.expires_at, CURRENT_TIMESTAMP + INTERVAL '1 minute') > CURRENT_TIMESTAMP
        AND (
          dsr.last_checked_at IS NULL OR
          dsr.last_checked_at <= CURRENT_TIMESTAMP - ($2::text || ' minutes')::interval
        )
      ORDER BY dsr.requested_at ASC
      LIMIT $1
      `,
      [limit, pendingMinutes, maxAttempts]
    );

    const results = [];

    for (const row of pendingResult.rows) {
      const requestId = row.request_id;
      const wallet = {
        id: row.id,
        user_id: row.user_id,
        network: row.network,
        address: row.address,
        created_at: row.created_at,
        last_scanned_block: row.last_scanned_block,
      };

      const result = await scanWalletNetwork(wallet, row.request_network || wallet.network);
      const credited = isCreditedScanResult(result);

      await client.query(
        `
        UPDATE deposit_scan_requests
        SET
          attempts = COALESCE(attempts, 0) + 1,
          status = CASE WHEN $2::boolean THEN 'completed' ELSE status END,
          completed_at = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE completed_at END,
          added_deposits = COALESCE(added_deposits, 0) + $3,
          detected_transfers = $4,
          last_checked_at = CURRENT_TIMESTAMP,
          last_error = CASE WHEN $5::text IS NULL THEN last_error ELSE $5::text END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb
        WHERE id = $1
        `,
        [
          requestId,
          credited,
          Number(result.addedDeposits || 0),
          Number(result.detectedTransfers || 0),
          result.status === "ok" ? null : result.detail || "Error verificando depósito",
          JSON.stringify({
            lastAutoScanAt: new Date().toISOString(),
            credited,
            creditedAmount: result.creditedAmount || "0",
            addedAmount: result.addedAmount || "0",
          }),
        ]
      );

      results.push({ requestId, walletId: wallet.id, userId: wallet.user_id, ...result, credited });
    }

    return {
      status: "ok",
      scanned: results.length,
      credited: results.filter((item) => item.credited).length,
      addedDeposits: results.reduce((total, item) => total + Number(item.addedDeposits || 0), 0),
      results,
    };
  } finally {
    client.release();
    scannerRunning = false;
  }
}

async function scanAllDeposits({ limit = 100 } = {}) {
  if (scannerRunning) {
    return { status: "skipped", message: "Scanner automático ya está ejecutándose." };
  }

  scannerRunning = true;
  try {
    const networks = listPaymentNetworks().filter((item) => item.depositEnabled);
    const walletsResult = await pool.query(
      `
      SELECT DISTINCT ON (user_id, network, address)
        id, user_id, network, address, created_at, last_scanned_block
      FROM wallets
      WHERE address IS NOT NULL
      ORDER BY user_id, network, address, id ASC
      LIMIT $1
      `,
      [limit]
    );

    const results = [];
    for (const wallet of walletsResult.rows) {
      const walletNetworks = networks.filter((item) => item.code === wallet.network);
      const scanNetworks = walletNetworks.length > 0 ? walletNetworks : networks;
      for (const network of scanNetworks) {
        results.push(await scanWalletNetwork(wallet, network.code));
      }
    }

    return {
      status: "ok",
      wallets: walletsResult.rows.length,
      networks: networks.map((item) => item.code),
      addedDeposits: results.reduce((total, item) => total + Number(item.addedDeposits || 0), 0),
      results,
    };
  } finally {
    scannerRunning = false;
  }
}

function startAutomaticDepositScanner() {
  const enabled = String(process.env.AUTO_DEPOSIT_SCAN_ENABLED || "false").toLowerCase() === "true" ||
    String(process.env.AUTO_DEPOSIT_SCANNER_ENABLED || "false").toLowerCase() === "true";

  if (!enabled) {
    console.log("Scanner automático de depósitos desactivado.");
    return null;
  }

  const intervalMs = Number(process.env.AUTO_DEPOSIT_SCAN_INTERVAL_MS || 300000);
  const limit = Number(process.env.AUTO_DEPOSIT_SCAN_WALLET_LIMIT || 20);

  console.log(`Scanner automático de depósitos pendientes activo cada ${intervalMs}ms. Límite=${limit}`);

  const run = async () => {
    try {
      const result = await scanPendingDepositRequests({ limit });
      if (Number(result.scanned || 0) > 0 || Number(result.addedDeposits || 0) > 0) {
        console.log("Resumen scanner pendientes:", {
          scanned: result.scanned,
          credited: result.credited,
          addedDeposits: result.addedDeposits,
        });
      }
    } catch (error) {
      console.error("AUTO PENDING DEPOSIT SCANNER JOB ERROR:", error.message);
    }
  };

  const initialDelayMs = Number(process.env.AUTO_DEPOSIT_SCAN_INITIAL_DELAY_MS || 30000);
  setTimeout(run, initialDelayMs);
  return setInterval(run, intervalMs);
}

module.exports = {
  scanWalletNetwork,
  scanAllDeposits,
  scanAllUsersDeposits: scanAllDeposits,
  scanPendingDepositRequests,
  startAutomaticDepositScanner,
  ensurePendingScanSchema,
  markOrCreatePendingScanRequest,
};
