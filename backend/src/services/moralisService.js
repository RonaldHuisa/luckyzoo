const { ethers } = require("ethers");
require("dotenv").config();

const {
  getPaymentNetwork,
  getNetworkTokenContract,
  getNetworkTokenDecimals,
} = require("../utils/paymentNetworks");

function parseMoralisApiKeys() {
  const keys = [];

  if (process.env.MORALIS_API_KEYS) {
    keys.push(
      ...String(process.env.MORALIS_API_KEYS)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  if (process.env.MORALIS_API_KEY) {
    keys.push(String(process.env.MORALIS_API_KEY).trim());
  }

  if (process.env.MORALIS_API_KEY_BACKUP) {
    keys.push(String(process.env.MORALIS_API_KEY_BACKUP).trim());
  }

  // Quita duplicados manteniendo orden.
  return [...new Set(keys.filter(Boolean))];
}

const MORALIS_API_KEYS = parseMoralisApiKeys();

if (MORALIS_API_KEYS.length === 0) {
  throw new Error("Falta MORALIS_API_KEY o MORALIS_API_KEYS en el archivo .env");
}

function normalizeAddress(address) {
  return String(address || "").toLowerCase();
}

function formatTokenAmount(rawValue, decimals) {
  return ethers.formatUnits(rawValue.toString(), decimals);
}

function shouldTryNextMoralisKey(response, data) {
  const status = Number(response?.status || 0);
  const message = String(
    data?.message || data?.error || data?.details || data?.detail || ""
  ).toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    status >= 500 ||
    message.includes("budget") ||
    message.includes("limit") ||
    message.includes("rate") ||
    message.includes("quota") ||
    message.includes("compute") ||
    message.includes("cu")
  );
}

async function fetchMoralisWithFallback(url, headers = {}) {
  let lastError = null;

  for (let index = 0; index < MORALIS_API_KEYS.length; index += 1) {
    const apiKey = MORALIS_API_KEYS[index];

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          ...headers,
          "X-API-Key": apiKey,
          accept: "application/json",
        },
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (response.ok) {
        if (index > 0) {
          console.warn(`Moralis fallback usado correctamente: API key #${index + 1}`);
        }
        return data;
      }

      const message =
        data?.message ||
        data?.error ||
        data?.details ||
        data?.detail ||
        `Moralis HTTP ${response.status}`;

      lastError = new Error(message);
      lastError.status = response.status;
      lastError.data = data;

      console.warn(`Moralis API key #${index + 1} falló:`, message);

      if (!shouldTryNextMoralisKey(response, data)) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      console.warn(`Moralis API key #${index + 1} error:`, error.message);
    }
  }

  const finalMessage =
    lastError?.message || "Todas las API keys de Moralis fallaron.";

  const error = new Error(finalMessage);
  error.cause = lastError;
  throw error;
}

async function getEvmUsdtTransfers(walletAddress, networkCode = "BEP20-USDT", options = {}) {
  const network = getPaymentNetwork(networkCode, { deposit: true });
  const tokenContract = getNetworkTokenContract(network);
  const tokenDecimals = getNetworkTokenDecimals(network);

  const transfers = [];
  let cursor = null;

  const walletLower = normalizeAddress(walletAddress);
  const contractLower = normalizeAddress(tokenContract);

  do {
    const url = new URL(
      `https://deep-index.moralis.io/api/v2.2/${walletAddress}/erc20/transfers`
    );

    url.searchParams.set("chain", network.moralisChain);
    url.searchParams.append("contract_addresses", tokenContract);
    url.searchParams.set("limit", "100");
    url.searchParams.set("order", "ASC");

    if (options.fromBlock && Number(options.fromBlock) > 0) {
      url.searchParams.set("from_block", String(options.fromBlock));
    } else if (options.fromDate) {
      url.searchParams.set("from_date", options.fromDate);
    }

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const data = await fetchMoralisWithFallback(url);
    const result = Array.isArray(data.result) ? data.result : [];

    for (const tx of result) {
      const toAddress = normalizeAddress(tx.to_address);
      const contractAddress = normalizeAddress(tx.address);

      if (toAddress !== walletLower) continue;
      if (contractAddress !== contractLower) continue;

      const decimals = Number(tx.token_decimals || tokenDecimals);
      const amountUsdt = formatTokenAmount(tx.value, decimals);

      transfers.push({
        txHash: tx.transaction_hash,
        logIndex: Number(tx.log_index || 0),
        blockNumber: Number(tx.block_number),
        amountRaw: tx.value.toString(),
        amountUsdt,
        tokenContract: tx.address,
        fromAddress: tx.from_address,
        toAddress: tx.to_address,
        blockTimestamp: tx.block_timestamp,
        tokenDecimals: decimals,
        network: network.code,
      });
    }

    cursor = data.cursor || null;
  } while (cursor);

  return transfers;
}

// Compatibilidad con el código anterior
async function getBep20UsdtTransfers(walletAddress, options = {}) {
  return getEvmUsdtTransfers(walletAddress, "BEP20-USDT", options);
}

module.exports = {
  getEvmUsdtTransfers,
  getBep20UsdtTransfers,
};
