const { ethers } = require("ethers");
const pool = require("../config/db");
const { decryptText } = require("../utils/cryptoUtil");
const {
  getPaymentNetwork,
  getNetworkRpcUrl,
  getNetworkTokenContract,
  getNetworkCollectionWallet,
  getNetworkPlatformPrivateKey,
  getNetworkTopupBuffer,
} = require("../utils/paymentNetworks");
require("dotenv").config();

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

function toBigInt(value) {
  return BigInt(String(value || "0"));
}

async function getGasPrice(provider, network) {
  const feeData = await provider.getFeeData();

  if (!feeData.gasPrice) {
    throw new Error(`No se pudo obtener gasPrice en ${network.code}.`);
  }

  return feeData.gasPrice;
}

function getEnvBps(envName, fallback) {
  const envValue = Number(process.env[envName]);

  if (Number.isFinite(envValue) && envValue >= 10000) {
    return BigInt(Math.floor(envValue));
  }

  return fallback;
}

function getGasSafetyMultiplierBps(network) {
  const envName = `${network.chain}_GAS_SAFETY_MULTIPLIER_BPS`;

  // Este multiplicador calcula cuánto gas debe tener la wallet del usuario
  // antes de recolectar. En Polygon debe ser más alto porque el gas varía rápido.
  if (network.code === "POLYGON-USDT") {
    return getEnvBps(envName, 18000n); // 1.8x
  }

  return getEnvBps(envName, 12000n); // 1.2x
}

function getTxGasPriceMultiplierBps(network) {
  const envName = `${network.chain}_TX_GAS_PRICE_MULTIPLIER_BPS`;

  // Este multiplicador acelera la transacción real de gas/recolección.
  // Para Polygon usamos 2x por defecto para reducir pendientes largos.
  if (network.code === "POLYGON-USDT") {
    return getEnvBps(envName, 20000n); // 2.0x
  }

  return getEnvBps(envName, 12000n); // 1.2x
}

function applyBps(value, bps) {
  return (value * bps) / 10000n;
}

function getCollectionGasLimit(estimatedGasLimit, network) {
  const envName = `${network.chain}_COLLECT_GAS_LIMIT`;
  const envValue = BigInt(String(process.env[envName] || "0"));

  if (envValue > 0n) {
    return envValue;
  }

  const withMargin = applyBps(estimatedGasLimit, network.code === "POLYGON-USDT" ? 15000n : 12000n);
  const minimum = network.code === "POLYGON-USDT" ? 140000n : 100000n;

  return withMargin > minimum ? withMargin : minimum;
}

async function getDepositContext(depositId, client = pool) {
  const result = await client.query(
    `
    SELECT
      d.id,
      d.user_id,
      d.wallet_id,
      d.network,
      d.tx_hash,
      d.amount_raw,
      d.amount_usdt,
      d.status,
      d.sweep_status,
      d.bnb_topup_tx_hash,
      d.sweep_tx_hash,
      d.swept_at,
      d.created_at,
      w.address,
      w.private_key_encrypted,
      u.email
    FROM deposits d
    JOIN wallets w ON w.id = d.wallet_id
    JOIN users u ON u.id = d.user_id
    WHERE d.id = $1
    LIMIT 1
    `,
    [depositId]
  );

  if (result.rows.length === 0) {
    throw new Error("Depósito no encontrado.");
  }

  const deposit = result.rows[0];

  if (deposit.status !== "confirmed") {
    throw new Error("El depósito todavía no está confirmado.");
  }

  if (deposit.sweep_status === "swept") {
    throw new Error("Este depósito ya fue recolectado.");
  }

  return deposit;
}

async function getCollectionStatusForDeposit(depositId) {
  const deposit = await getDepositContext(depositId);
  const network = getPaymentNetwork(deposit.network, { deposit: true });
  const provider = new ethers.JsonRpcProvider(getNetworkRpcUrl(network));
  const collectionWallet = getNetworkCollectionWallet(network);
  const tokenContractAddress = getNetworkTokenContract(network);
  const userPrivateKey = decryptText(deposit.private_key_encrypted);
  const userSigner = new ethers.Wallet(userPrivateKey, provider);
  const tokenContract = new ethers.Contract(tokenContractAddress, ERC20_ABI, provider);

  const amountRaw = toBigInt(deposit.amount_raw);
  const nativeBalance = await provider.getBalance(deposit.address);
  const tokenBalance = await tokenContract.balanceOf(deposit.address);
  const platformSigner = new ethers.Wallet(getNetworkPlatformPrivateKey(network), provider);
  const platformNativeBalance = await provider.getBalance(platformSigner.address);

  let estimatedGasLimit = 100000n;

  try {
    estimatedGasLimit = await tokenContract
      .connect(userSigner)
      .transfer
      .estimateGas(collectionWallet, amountRaw);
  } catch (_) {
    estimatedGasLimit = 100000n;
  }

  const baseGasPrice = await getGasPrice(provider, network);
  const txGasPriceMultiplierBps = getTxGasPriceMultiplierBps(network);
  const gasPrice = applyBps(baseGasPrice, txGasPriceMultiplierBps);
  const gasSafetyMultiplierBps = getGasSafetyMultiplierBps(network);
  const collectionGasLimit = getCollectionGasLimit(estimatedGasLimit, network);
  const estimatedGasCost = collectionGasLimit * gasPrice;
  const requiredNative = applyBps(estimatedGasCost, gasSafetyMultiplierBps) + getNetworkTopupBuffer(network);

  return {
    deposit,
    network,
    provider,
    tokenContract,
    userSigner,
    amountRaw,
    collectionWallet,
    balances: {
      userNativeRaw: nativeBalance.toString(),
      userNative: ethers.formatEther(nativeBalance),
      platformNative: ethers.formatEther(platformNativeBalance),
      userTokenRaw: tokenBalance.toString(),
      requiredNativeRaw: requiredNative.toString(),
      requiredNative: ethers.formatEther(requiredNative),
      topupBuffer: ethers.formatEther(getNetworkTopupBuffer(network)),
      estimatedGasLimit: estimatedGasLimit.toString(),
      collectionGasLimit: collectionGasLimit.toString(),
      baseGasPriceGwei: ethers.formatUnits(baseGasPrice, "gwei"),
      gasPriceRaw: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
      gasSafetyMultiplierBps: gasSafetyMultiplierBps.toString(),
      txGasPriceMultiplierBps: txGasPriceMultiplierBps.toString(),
      hasEnoughNative: nativeBalance >= requiredNative,
      hasEnoughToken: tokenBalance >= amountRaw,
      nativeSymbol: network.nativeSymbol,
      tokenSymbol: network.asset,
    },
  };
}

async function sendGasForDeposit(depositId) {
  const context = await getCollectionStatusForDeposit(depositId);
  const { deposit, network, provider, balances } = context;

  if (deposit.bnb_topup_tx_hash && deposit.sweep_status === "gas_pending") {
    const receipt = await provider.getTransactionReceipt(deposit.bnb_topup_tx_hash);

    if (!receipt) {
      return {
        status: "already_sent",
        message: "Ya existe una transacción de gas pendiente. Espera confirmación y luego verifica.",
        txHash: deposit.bnb_topup_tx_hash,
        balances,
      };
    }

    if (receipt.status === 0) {
      await pool.query(
        `
        UPDATE deposits
        SET sweep_status = 'pending', bnb_topup_tx_hash = NULL
        WHERE id = $1
        `,
        [deposit.id]
      );
    }
  }

  if (balances.hasEnoughNative) {
    await pool.query(
      `
      UPDATE deposits
      SET sweep_status = 'gas_ready'
      WHERE id = $1
      `,
      [deposit.id]
    );

    return {
      status: "gas_ready",
      message: `La wallet del usuario ya tiene ${network.nativeSymbol} suficiente.`,
      txHash: null,
      balances,
    };
  }

  const platformSigner = new ethers.Wallet(getNetworkPlatformPrivateKey(network), provider);
  const amountToSend = BigInt(balances.requiredNativeRaw) - BigInt(balances.userNativeRaw);

  if (amountToSend <= 0n) {
    await pool.query(
      `
      UPDATE deposits
      SET sweep_status = 'gas_ready'
      WHERE id = $1
      `,
      [deposit.id]
    );

    return {
      status: "gas_ready",
      message: `La wallet del usuario ya tiene ${network.nativeSymbol} suficiente.`,
      txHash: null,
      balances,
    };
  }

  const tx = await platformSigner.sendTransaction({
    to: deposit.address,
    value: amountToSend,
    gasPrice: BigInt(balances.gasPriceRaw),
  });

  await pool.query(
    `
    UPDATE deposits
    SET
      bnb_topup_tx_hash = $1,
      sweep_status = 'gas_pending'
    WHERE id = $2
    `,
    [tx.hash, deposit.id]
  );

  console.log(`Gas ${network.nativeSymbol} enviado para depósito ${deposit.id}:`, tx.hash);

  return {
    status: "gas_pending",
    message: `Gas enviado. Espera confirmación antes de recolectar.`,
    txHash: tx.hash,
    sentNative: ethers.formatEther(amountToSend),
    balances,
  };
}

async function collectDepositToCentral(depositId) {
  const context = await getCollectionStatusForDeposit(depositId);
  const { deposit, network, tokenContract, userSigner, amountRaw, collectionWallet, balances } = context;

  if (!balances.hasEnoughToken) {
    throw new Error("La wallet del usuario no tiene suficiente USDT para recolectar.");
  }

  if (!balances.hasEnoughNative) {
    throw new Error(`Primero envía gas ${network.nativeSymbol} y espera confirmación.`);
  }

  if (deposit.sweep_tx_hash) {
    return {
      status: "already_collecting",
      message: "Ya existe una transacción de recolección registrada.",
      txHash: deposit.sweep_tx_hash,
      balances,
    };
  }

  const sweepTx = await tokenContract
    .connect(userSigner)
    .transfer(collectionWallet, amountRaw, {
      gasLimit: BigInt(balances.collectionGasLimit),
      gasPrice: BigInt(balances.gasPriceRaw),
    });

  await pool.query(
    `
    UPDATE deposits
    SET
      sweep_status = 'collecting',
      sweep_tx_hash = $1
    WHERE id = $2
    `,
    [sweepTx.hash, deposit.id]
  );

  console.log(`Recolectando USDT ${network.code} depósito ${deposit.id}:`, sweepTx.hash);

  const receipt = await sweepTx.wait(1);

  await pool.query(
    `
    UPDATE deposits
    SET
      sweep_status = 'swept',
      sweep_tx_hash = $1,
      swept_at = CURRENT_TIMESTAMP
    WHERE id = $2
    `,
    [receipt.hash, deposit.id]
  );

  return {
    status: "swept",
    message: "USDT recolectado correctamente en la wallet central.",
    network: network.code,
    amountRawSwept: amountRaw.toString(),
    sweepTxHash: receipt.hash,
    balances,
  };
}

async function refreshDepositCollectionStatus(depositId) {
  const deposit = await getDepositContext(depositId);
  const network = getPaymentNetwork(deposit.network, { deposit: true });
  const provider = new ethers.JsonRpcProvider(getNetworkRpcUrl(network));

  let nextStatus = deposit.sweep_status;

  if (deposit.sweep_tx_hash) {
    const receipt = await provider.getTransactionReceipt(deposit.sweep_tx_hash);

    if (receipt && receipt.status === 1) {
      nextStatus = "swept";
      await pool.query(
        `
        UPDATE deposits
        SET sweep_status = 'swept', swept_at = COALESCE(swept_at, CURRENT_TIMESTAMP)
        WHERE id = $1
        `,
        [deposit.id]
      );
    }
  } else if (deposit.bnb_topup_tx_hash) {
    const receipt = await provider.getTransactionReceipt(deposit.bnb_topup_tx_hash);

    if (receipt && receipt.status === 1) {
      const context = await getCollectionStatusForDeposit(deposit.id);
      nextStatus = context.balances.hasEnoughNative ? "gas_ready" : "gas_short";

      await pool.query(
        `
        UPDATE deposits
        SET sweep_status = $2
        WHERE id = $1 AND sweep_status IN ('gas_pending', 'pending', 'gas_short')
        `,
        [deposit.id, nextStatus]
      );
    } else if (receipt && receipt.status === 0) {
      nextStatus = "pending";
      await pool.query(
        `
        UPDATE deposits
        SET sweep_status = 'pending', bnb_topup_tx_hash = NULL
        WHERE id = $1
        `,
        [deposit.id]
      );
    }
  }

  return {
    status: nextStatus,
    message: "Estado actualizado.",
  };
}

// Función antigua mantenida por compatibilidad. Ya no se recomienda usar para automático.
async function sweepUserPendingDeposits(userId, networkCode = "BEP20-USDT") {
  const result = await pool.query(
    `
    SELECT id
    FROM deposits
    WHERE user_id = $1
      AND network = $2
      AND status = 'confirmed'
      AND sweep_status IN ('pending', 'gas_ready', 'failed')
    ORDER BY id ASC
    LIMIT 1
    `,
    [userId, networkCode]
  );

  if (result.rows.length === 0) {
    return {
      status: "nothing_pending",
      message: "No hay depósitos pendientes para mover.",
      network: networkCode,
    };
  }

  const depositId = result.rows[0].id;
  const context = await getCollectionStatusForDeposit(depositId);

  if (!context.balances.hasEnoughNative) {
    return sendGasForDeposit(depositId);
  }

  return collectDepositToCentral(depositId);
}

async function sweepAllPendingDeposits(limit = 25) {
  const result = await pool.query(
    `
    SELECT id
    FROM deposits
    WHERE status = 'confirmed'
      AND sweep_status IN ('pending', 'gas_ready', 'failed')
    ORDER BY id ASC
    LIMIT $1
    `,
    [limit]
  );

  const results = [];

  for (const item of result.rows) {
    try {
      results.push(await collectDepositToCentral(item.id));
    } catch (error) {
      results.push({ depositId: item.id, status: "failed", message: error.message });
    }
  }

  return results;
}

module.exports = {
  getCollectionStatusForDeposit,
  sendGasForDeposit,
  collectDepositToCentral,
  refreshDepositCollectionStatus,
  sweepUserPendingDeposits,
  sweepAllPendingDeposits,
};
