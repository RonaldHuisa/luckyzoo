#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const pool = require("../../src/config/db");
const { syncAlchemyWebhookAddresses } = require("../../src/services/alchemyWebhookService");

async function main() {
  const networkArg = process.argv[2] || "";
  const networkCode = networkArg ? networkArg.toUpperCase() : null;

  console.log("Sincronizando direcciones con Alchemy...");
  console.log("Red:", networkCode || "BEP20-USDT + POLYGON-USDT");

  const result = await syncAlchemyWebhookAddresses({ networkCode });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("SYNC ALCHEMY ADDRESSES ERROR:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
