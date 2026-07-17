const { Wallet } = require("ethers");
const { encryptText } = require("./cryptoUtil");

function generateReferralCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateBep20Wallet() {
  const wallet = Wallet.createRandom();

  return {
    address: wallet.address,
    publicKey: wallet.signingKey.publicKey,
    privateKeyEncrypted: encryptText(wallet.privateKey),
  };
}

module.exports = {
  generateReferralCode,
  generateBep20Wallet,
};