#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const pool = require("../../src/config/db");

function mask(value, visible = 6) {
  const text = String(value || "");
  if (!text) return "NO CONFIGURADO";
  if (text.length <= visible * 2) return `${text.slice(0, 3)}...`;
  return `${text.slice(0, visible)}...${text.slice(-visible)}`;
}

async function main() {
  const token = process.env.ALCHEMY_NOTIFY_AUTH_TOKEN || process.env.ALCHEMY_AUTH_TOKEN;
  const configured = [
    { network: "BEP20-USDT", alchemyNetwork: "BNB_MAINNET", id: process.env.ALCHEMY_BSC_WEBHOOK_ID || process.env.ALCHEMY_BEP20_WEBHOOK_ID, key: process.env.ALCHEMY_BSC_WEBHOOK_SIGNING_KEY || process.env.ALCHEMY_BEP20_WEBHOOK_SIGNING_KEY },
    { network: "POLYGON-USDT", alchemyNetwork: "MATIC_MAINNET", id: process.env.ALCHEMY_POLYGON_WEBHOOK_ID, key: process.env.ALCHEMY_POLYGON_WEBHOOK_SIGNING_KEY },
  ];

  const counts = await pool.query(`
    SELECT network, COUNT(DISTINCT LOWER(address))::int AS total
    FROM wallets
    WHERE address IS NOT NULL AND address <> ''
    GROUP BY network
    ORDER BY network ASC
  `);

  console.log("\n=== Royal Imperial AI · Alchemy config ===");
  console.table(configured.map((item) => ({
    network: item.network,
    alchemyNetwork: item.alchemyNetwork,
    webhookId: mask(item.id),
    signingKey: mask(item.key),
    dbWallets: counts.rows.find((row) => row.network === item.network)?.total || 0,
  })));
  console.log("Notify Auth Token:", mask(token));
  console.log("Sync Secret:", mask(process.env.ALCHEMY_SYNC_SECRET));

  if (!token) {
    console.log("\nFalta ALCHEMY_NOTIFY_AUTH_TOKEN. No puedo consultar team-webhooks.");
    return;
  }

  const response = await fetch("https://dashboard.alchemy.com/api/team-webhooks", {
    headers: { "X-Alchemy-Token": token },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.log("Alchemy team-webhooks ERROR:", response.status, data);
    return;
  }

  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  console.log("\n=== Webhooks en Alchemy ===");
  console.table(list.map((item) => ({
    id: item.id,
    network: item.network,
    type: item.webhook_type,
    active: item.is_active,
    url: item.webhook_url,
    signingKey: mask(item.signing_key),
  })));

  console.log("\nIDs configurados encontrados en Alchemy:");
  configured.forEach((item) => {
    const found = list.find((hook) => hook.id === item.id);
    console.log(`${item.network}: ${found ? "OK" : "NO ENCONTRADO"} (${mask(item.id)})`);
  });
}

main()
  .catch((error) => {
    console.error("CHECK ALCHEMY CONFIG ERROR:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
