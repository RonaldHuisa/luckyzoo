const crypto = require("crypto");
require("dotenv").config();

function getEncryptionKey() {
  const keyFromEnv = process.env.WALLET_ENCRYPTION_KEY;

  if (!keyFromEnv) {
    throw new Error("Falta WALLET_ENCRYPTION_KEY en el archivo .env");
  }

  const key = Buffer.from(keyFromEnv, "base64");

  if (key.length !== 32) {
    throw new Error("WALLET_ENCRYPTION_KEY debe ser una llave base64 de 32 bytes.");
  }

  return key;
}

function encryptText(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptText(encryptedText) {
  const key = getEncryptionKey();

  const [ivBase64, authTagBase64, encryptedBase64] = encryptedText.split(":");

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encryptText,
  decryptText,
};