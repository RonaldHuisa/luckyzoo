const { ethers } = require("ethers");
require("dotenv").config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const USDT_CONTRACT = process.env.BSC_USDT_CONTRACT;
const USDT_DECIMALS = Number(process.env.BSC_USDT_DECIMALS || 18);

const LOG_CHUNK_SIZE = Number(process.env.BSC_LOG_CHUNK_SIZE || 1000);
const LOG_DELAY_MS = Number(process.env.BSC_LOG_DELAY_MS || 300);

if (!BSC_RPC_URL) {
  throw new Error("Falta BSC_RPC_URL en .env");
}

if (!USDT_CONTRACT) {
  throw new Error("Falta BSC_USDT_CONTRACT en .env");
}

const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addressToTopic(address) {
  return ethers.zeroPadValue(ethers.getAddress(address), 32);
}

function formatUsdtAmount(amountRaw) {
  return ethers.formatUnits(amountRaw, USDT_DECIMALS);
}

async function getCurrentBlock() {
  return provider.getBlockNumber();
}

async function getLogsWithRetry(filter, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await provider.getLogs(filter);
    } catch (error) {
      console.error(`Error en getLogs intento ${attempt}:`, error.shortMessage || error.message);

      if (attempt === retries) {
        throw error;
      }

      await sleep(1000 * attempt);
    }
  }
}

async function scanUsdtDepositsToWallet(walletAddress, fromBlock, toBlock) {
  const allLogs = [];

  const toTopic = addressToTopic(walletAddress);

  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);

    console.log(`Escaneando USDT BEP20 desde bloque ${start} hasta ${end}`);

    const logs = await getLogsWithRetry({
      address: USDT_CONTRACT,
      fromBlock: start,
      toBlock: end,
      topics: [
        TRANSFER_TOPIC,
        null,
        toTopic,
      ],
    });

    allLogs.push(...logs);

    await sleep(LOG_DELAY_MS);
  }

  return allLogs.map((log) => {
    const amountRaw = BigInt(log.data);
    const amountUsdt = formatUsdtAmount(amountRaw);

    return {
      txHash: log.transactionHash,
      logIndex: Number(log.index ?? log.logIndex ?? 0),
      blockNumber: Number(log.blockNumber),
      amountRaw: amountRaw.toString(),
      amountUsdt,
      tokenContract: USDT_CONTRACT,
    };
  });
}

module.exports = {
  getCurrentBlock,
  scanUsdtDepositsToWallet,
};