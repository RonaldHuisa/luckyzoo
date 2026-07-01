const { ethers } = require("ethers");

const SUPPORTED_PAYMENT_NETWORKS = {
  "BEP20-USDT": {
    code: "BEP20-USDT",
    asset: "USDT",
    chain: "BSC",
    moralisChain: process.env.BSC_CHAIN || "bsc",
    displayName: "BNB Smart Chain BEP20",
    shortName: "BEP20",
    nativeSymbol: "BNB",
    rpcUrlEnv: "BSC_RPC_URL",
    tokenContractEnv: "BSC_USDT_CONTRACT",
    tokenContractDefault: "0x55d398326f99059fF775485246999027B3197955",
    tokenDecimalsEnv: "BSC_USDT_DECIMALS",
    tokenDecimalsDefault: 18,
    collectionWalletEnv: "COLLECTION_USDT_WALLET",
    platformPrivateKeyEnv: "PLATFORM_BNB_PRIVATE_KEY",
    topupBufferEnv: "BNB_TOPUP_BUFFER",
    topupBufferDefault: "0.00008",
    minWithdrawEnv: "BEP20_MIN_WITHDRAW_USDT",
    minWithdrawDefault: 3,
    withdrawFeePercentEnv: "BEP20_WITHDRAW_FEE_PERCENT",
    withdrawFeePercentDefault: 10,
    depositEnabled: true,
    withdrawEnabled: true,
  },

  "POLYGON-USDT": {
    code: "POLYGON-USDT",
    asset: "USDT",
    chain: "POLYGON",
    moralisChain: process.env.POLYGON_CHAIN || "polygon",
    displayName: "Polygon",
    shortName: "POLYGON",
    nativeSymbol: "MATIC",
    rpcUrlEnv: "POLYGON_RPC_URL",
    tokenContractEnv: "POLYGON_USDT_CONTRACT",
    tokenContractDefault: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    tokenDecimalsEnv: "POLYGON_USDT_DECIMALS",
    tokenDecimalsDefault: 6,
    collectionWalletEnv: "COLLECTION_POLYGON_USDT_WALLET",
    platformPrivateKeyEnv: "PLATFORM_POLYGON_PRIVATE_KEY",
    topupBufferEnv: "POLYGON_TOPUP_BUFFER",
    topupBufferDefault: "0.05",
    minWithdrawEnv: "POLYGON_MIN_WITHDRAW_USDT",
    minWithdrawDefault: 3,
    withdrawFeePercentEnv: "POLYGON_WITHDRAW_FEE_PERCENT",
    withdrawFeePercentDefault: 10,
    depositEnabled: true,
    withdrawEnabled: true,
  },
};

function normalizeNetworkCode(value) {
  return String(value || "BEP20-USDT").trim().toUpperCase();
}

function getPaymentNetwork(value, options = {}) {
  const code = normalizeNetworkCode(value);
  const network = SUPPORTED_PAYMENT_NETWORKS[code];

  if (!network) {
    throw new Error(`Red no soportada: ${value}`);
  }

  if (options.deposit && !network.depositEnabled) {
    throw new Error(`La red ${code} no está habilitada para recargas.`);
  }

  if (options.withdraw && !network.withdrawEnabled) {
    throw new Error(`La red ${code} no está habilitada para retiros.`);
  }

  return network;
}

function listPaymentNetworks() {
  return Object.values(SUPPORTED_PAYMENT_NETWORKS).map((network) => ({
    code: network.code,
    asset: network.asset,
    chain: network.chain,
    displayName: network.displayName,
    shortName: network.shortName,
    nativeSymbol: network.nativeSymbol,
    depositEnabled: network.depositEnabled,
    withdrawEnabled: network.withdrawEnabled,
    minWithdraw: getNetworkMinWithdraw(network),
    withdrawFeePercent: getNetworkWithdrawFeePercent(network),
  }));
}

function requireNetworkEnv(network, envName) {
  const value = process.env[envName];

  if (!value) {
    throw new Error(`Falta ${envName} en .env para ${network.code}`);
  }

  return value;
}

function getNetworkRpcUrl(network) {
  return requireNetworkEnv(network, network.rpcUrlEnv);
}

function getNetworkTokenContract(network) {
  return process.env[network.tokenContractEnv] || network.tokenContractDefault || requireNetworkEnv(network, network.tokenContractEnv);
}

function getNetworkCollectionWallet(network) {
  return requireNetworkEnv(network, network.collectionWalletEnv);
}

function getNetworkPlatformPrivateKey(network) {
  return requireNetworkEnv(network, network.platformPrivateKeyEnv);
}

function getNetworkTokenDecimals(network) {
  return Number(process.env[network.tokenDecimalsEnv] || network.tokenDecimalsDefault);
}

function getNetworkTopupBuffer(network) {
  return ethers.parseEther(
    process.env[network.topupBufferEnv] || network.topupBufferDefault
  );
}

function getNetworkMinWithdraw(network) {
  return Number(process.env[network.minWithdrawEnv] || network.minWithdrawDefault);
}

function getNetworkWithdrawFeePercent(network) {
  return Number(
    process.env[network.withdrawFeePercentEnv] || network.withdrawFeePercentDefault
  );
}

function isValidEvmAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address || ""));
}

module.exports = {
  SUPPORTED_PAYMENT_NETWORKS,
  normalizeNetworkCode,
  getPaymentNetwork,
  listPaymentNetworks,
  requireNetworkEnv,
  getNetworkRpcUrl,
  getNetworkTokenContract,
  getNetworkCollectionWallet,
  getNetworkPlatformPrivateKey,
  getNetworkTokenDecimals,
  getNetworkTopupBuffer,
  getNetworkMinWithdraw,
  getNetworkWithdrawFeePercent,
  isValidEvmAddress,
};
