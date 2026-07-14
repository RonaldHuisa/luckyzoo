const { ethers } = require("ethers");
require("dotenv").config();

const {
  getPaymentNetwork,
  getNetworkRpcUrl,
  getNetworkTokenContract,
  getNetworkTokenDecimals,
  isValidEvmAddress,
} = require("../utils/paymentNetworks");

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

function getWithdrawHotWalletPrivateKey(network) {
  if (network.code === "POLYGON-USDT") {
    return (
      process.env.WITHDRAW_POLYGON_HOT_WALLET_PRIVATE_KEY ||
      process.env.PLATFORM_POLYGON_PRIVATE_KEY ||
      process.env.WITHDRAW_HOT_WALLET_PRIVATE_KEY
    );
  }

  return (
    process.env.WITHDRAW_BEP20_HOT_WALLET_PRIVATE_KEY ||
    process.env.WITHDRAW_HOT_WALLET_PRIVATE_KEY
  );
}

function requireWithdrawConfig(network) {
  const privateKey = getWithdrawHotWalletPrivateKey(network);

  if (!privateKey) {
    if (network.code === "POLYGON-USDT") {
      throw new Error(
        "Falta WITHDRAW_POLYGON_HOT_WALLET_PRIVATE_KEY o PLATFORM_POLYGON_PRIVATE_KEY en .env"
      );
    }

    throw new Error(
      "Falta WITHDRAW_BEP20_HOT_WALLET_PRIVATE_KEY o WITHDRAW_HOT_WALLET_PRIVATE_KEY en .env"
    );
  }

  return privateKey;
}

async function sendUsdtWithdrawal(toAddress, amountUsdt, networkCode = "BEP20-USDT") {
  const network = getPaymentNetwork(networkCode, { withdraw: true });
  const hotWalletPrivateKey = requireWithdrawConfig(network);

  if (!isValidEvmAddress(toAddress)) {
    throw new Error(`Dirección inválida para ${network.code}.`);
  }

  const provider = new ethers.JsonRpcProvider(getNetworkRpcUrl(network));
  const signer = new ethers.Wallet(hotWalletPrivateKey, provider);

  const tokenContract = new ethers.Contract(
    getNetworkTokenContract(network),
    ERC20_ABI,
    signer
  );

  const tokenDecimals = getNetworkTokenDecimals(network);
  const amountRaw = ethers.parseUnits(String(amountUsdt), tokenDecimals);

  const hotWalletAddress = await signer.getAddress();

  const contractCode = await provider.getCode(getNetworkTokenContract(network));

  if (!contractCode || contractCode === "0x") {
    throw new Error(
      `El contrato USDT de ${network.code} no existe en la red configurada. Revisa RPC y contrato.`
    );
  }

  const tokenBalance = await tokenContract.balanceOf(hotWalletAddress);

  if (tokenBalance < amountRaw) {
    throw new Error(`La wallet hot no tiene suficiente USDT en ${network.code}.`);
  }

  const nativeBalance = await provider.getBalance(hotWalletAddress);

  if (nativeBalance <= 0n) {
    throw new Error(
      `La wallet hot no tiene ${network.nativeSymbol} para pagar gas en ${network.code}.`
    );
  }

  const tx = await tokenContract.transfer(toAddress, amountRaw);

  console.log(`WITHDRAW USDT TX ${network.code}:`, tx.hash);

  const receipt = await tx.wait(1);

  return {
    txHash: receipt.hash,
    network: network.code,
    from: hotWalletAddress,
    to: toAddress,
    amountUsdt,
  };
}

module.exports = {
  sendUsdtWithdrawal,
};
