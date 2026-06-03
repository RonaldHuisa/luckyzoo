const { ethers } = require("ethers");
const {
  getPaymentNetwork,
  getNetworkRpcUrl,
  getNetworkTokenContract,
  getNetworkTokenDecimals,
} = require("../utils/paymentNetworks");

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addressToTopic(address) {
  return ethers.zeroPadValue(ethers.getAddress(address), 32);
}

function toSafeNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toHexBlock(blockNumber) {
  return `0x${Number(blockNumber).toString(16)}`;
}

function fromHexQuantity(value) {
  if (value === null || value === undefined) return 0;
  return Number.parseInt(String(value), 16);
}

function getNetworkPrefix(network) {
  return network.chain === "POLYGON" ? "POLYGON" : "BSC";
}

function getNetworkEnvValue(network, keySuffix, fallback) {
  const chainPrefix = getNetworkPrefix(network);
  return process.env[`${chainPrefix}_${keySuffix}`] ?? process.env[`EVM_${keySuffix}`] ?? fallback;
}

function getRpcUrls(network) {
  const prefix = getNetworkPrefix(network);
  const csv = process.env[`${prefix}_RPC_URLS`] || process.env.EVM_RPC_URLS || "";
  const urls = csv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const primary = getNetworkRpcUrl(network);

  return Array.from(new Set([primary, ...urls].filter(Boolean)));
}

function getChunkSize(network) {
  // Hard caps protect free/public RPC endpoints from eth_getLogs rate-limit.
  const fallback = network.chain === "POLYGON" ? 500 : 100;
  const configured = toSafeNumber(getNetworkEnvValue(network, "GETLOGS_BLOCK_RANGE", fallback), fallback);
  const maxAllowed = network.chain === "POLYGON" ? 800 : 200;
  return clamp(configured, 25, maxAllowed);
}

function getInitialLookbackBlocks(network) {
  // The deposit button is meant to be pressed soon after sending funds.
  // Keep the first scan small. Increase per-chain env only if truly needed.
  const fallback = network.chain === "POLYGON" ? 1200 : 600;
  const configured = toSafeNumber(getNetworkEnvValue(network, "DEPOSIT_INITIAL_LOOKBACK_BLOCKS", fallback), fallback);
  const maxAllowed = network.chain === "POLYGON" ? 3000 : 1200;
  return clamp(configured, 100, maxAllowed);
}

function getRescanLookbackBlocks(network) {
  const configured = toSafeNumber(getNetworkEnvValue(network, "RESCAN_LOOKBACK_BLOCKS", 60), 60);
  return clamp(configured, 10, 120);
}

function getRpcDelayMs(network) {
  const fallback = network.chain === "POLYGON" ? 300 : 1000;
  const configured = toSafeNumber(getNetworkEnvValue(network, "RPC_REQUEST_DELAY_MS", fallback), fallback);
  const minAllowed = network.chain === "POLYGON" ? 150 : 700;
  return clamp(configured, minAllowed, 5000);
}

function getRpcRetries(network) {
  const configured = toSafeNumber(getNetworkEnvValue(network, "RPC_RETRIES", 1), 1);
  return clamp(configured, 0, 3);
}

function getStartBlockOverride(network) {
  const value = getNetworkEnvValue(network, "DEPOSIT_START_BLOCK", "");
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isRateLimitError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("limit exceeded") ||
    message.includes("-32005") ||
    message.includes("exceeded")
  );
}

function makeUserFriendlyRpcError(error, networkCode) {
  if (isRateLimitError(error)) {
    const friendly = new Error(
      `El nodo RPC de ${networkCode} está limitado temporalmente. Espera 2-3 minutos e intenta nuevamente.`
    );
    friendly.code = "RPC_RATE_LIMIT";
    friendly.originalMessage = error?.message || String(error || "");
    return friendly;
  }

  return error;
}

async function rpcRequest(rpcUrl, method, params = [], { retries = 1, delayMs = 500 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error?.message || `RPC HTTP ${response.status}`);
      }

      if (payload?.error) {
        const code = payload.error.code !== undefined ? `${payload.error.code} ` : "";
        throw new Error(`${code}${payload.error.message || "RPC error"}`.trim());
      }

      return payload?.result;
    } catch (error) {
      lastError = error;

      if (attempt >= retries) break;

      const multiplier = isRateLimitError(error) ? attempt + 4 : attempt + 1;
      await sleep(delayMs * multiplier);
    }
  }

  throw lastError;
}

async function rpcGetBlockNumber(rpcUrl, network) {
  const result = await rpcRequest(rpcUrl, "eth_blockNumber", [], {
    retries: getRpcRetries(network),
    delayMs: getRpcDelayMs(network),
  });

  return fromHexQuantity(result);
}

async function rpcGetLogs(rpcUrl, network, filter) {
  const result = await rpcRequest(rpcUrl, "eth_getLogs", [filter], {
    retries: getRpcRetries(network),
    delayMs: getRpcDelayMs(network),
  });

  return Array.isArray(result) ? result : [];
}

async function getLatestBlockWithFallback(rpcUrls, network) {
  let lastError;

  for (const rpcUrl of rpcUrls) {
    try {
      const latestBlock = await rpcGetBlockNumber(rpcUrl, network);
      return { rpcUrl, latestBlock };
    } catch (error) {
      lastError = error;
      console.warn(`RPC blockNumber failed ${network.code}:`, error.message);
    }
  }

  throw makeUserFriendlyRpcError(lastError, network.code);
}

async function getLogsWithFallback(rpcUrls, network, filter) {
  let lastError;

  for (const rpcUrl of rpcUrls) {
    try {
      return await rpcGetLogs(rpcUrl, network, filter);
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error)) {
        console.warn(`RPC getLogs rate-limited ${network.code}:`, error.message);
        continue;
      }

      throw makeUserFriendlyRpcError(error, network.code);
    }
  }

  throw makeUserFriendlyRpcError(lastError, network.code);
}

async function getRpcUsdtTransfers(walletAddress, networkCode = "BEP20-USDT", options = {}) {
  const network = getPaymentNetwork(networkCode, { deposit: true });
  const rpcUrls = getRpcUrls(network);
  const tokenContract = ethers.getAddress(getNetworkTokenContract(network));
  const tokenDecimals = getNetworkTokenDecimals(network);
  const { latestBlock } = await getLatestBlockWithFallback(rpcUrls, network);

  const configuredStartBlock = getStartBlockOverride(network);
  const initialLookbackBlocks = getInitialLookbackBlocks(network);
  const rescanLookbackBlocks = getRescanLookbackBlocks(network);

  let fromBlock;

  if (options.fromBlock && Number(options.fromBlock) > 0) {
    fromBlock = Math.max(Number(options.fromBlock) - rescanLookbackBlocks, 0);
  } else if (configuredStartBlock !== null) {
    fromBlock = configuredStartBlock;
  } else {
    fromBlock = Math.max(latestBlock - initialLookbackBlocks, 0);
  }

  const toBlock = options.toBlock && Number(options.toBlock) > 0
    ? Math.min(Number(options.toBlock), latestBlock)
    : latestBlock;

  if (fromBlock > toBlock) {
    return {
      transfers: [],
      fromBlock,
      toBlock,
      latestBlock,
      scannedToBlock: latestBlock,
    };
  }

  const chunkSize = getChunkSize(network);
  const delayMs = getRpcDelayMs(network);
  const toTopic = addressToTopic(walletAddress);
  const transfers = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);

    const logs = await getLogsWithFallback(rpcUrls, network, {
      address: tokenContract,
      fromBlock: toHexBlock(start),
      toBlock: toHexBlock(end),
      topics: [TRANSFER_TOPIC, null, toTopic],
    });

    for (const log of logs) {
      const amountRaw = BigInt(log.data || "0x0");
      const amountUsdt = ethers.formatUnits(amountRaw, tokenDecimals);
      const logIndex = fromHexQuantity(log.logIndex ?? log.index ?? "0x0");
      const blockNumber = fromHexQuantity(log.blockNumber);

      transfers.push({
        txHash: log.transactionHash,
        logIndex,
        blockNumber,
        amountRaw: amountRaw.toString(),
        amountUsdt,
        tokenContract,
        fromAddress: log.topics?.[1] ? ethers.getAddress(`0x${log.topics[1].slice(26)}`) : null,
        toAddress: ethers.getAddress(walletAddress),
        blockTimestamp: null,
        tokenDecimals,
        network: network.code,
        scanner: "rpc_getLogs",
      });
    }

    if (end < toBlock && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return {
    transfers,
    fromBlock,
    toBlock,
    latestBlock,
    scannedToBlock: toBlock,
  };
}

module.exports = {
  getRpcUsdtTransfers,
};
