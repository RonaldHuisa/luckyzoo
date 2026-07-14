const { scanAllUsersDeposits } = require("../services/depositScannerService");

let isRunning = false;

function summarizeResults(results) {
  const addedDeposits = results.reduce((total, item) => total + Number(item.addedDeposits || 0), 0);
  const failed = results.filter((item) => item.status === "failed").length;

  return {
    scanned: results.length,
    addedDeposits,
    failed,
  };
}

async function runAutomaticDepositScan() {
  if (isRunning) {
    console.log("Escaneo automático de depósitos omitido: ya hay un escaneo en curso.");
    return;
  }

  isRunning = true;

  try {
    const results = await scanAllUsersDeposits({
      sweep: process.env.AUTO_SWEEP_ENABLED === "true",
    });

    const summary = summarizeResults(results);

    if (summary.addedDeposits > 0 || summary.failed > 0) {
      console.log("Resumen escaneo automático de depósitos:", summary);
    }
  } catch (error) {
    console.error("AUTO DEPOSIT SCANNER JOB ERROR:", error);
  } finally {
    isRunning = false;
  }
}

function startAutomaticDepositScanner() {
  if (process.env.AUTO_DEPOSIT_SCAN_ENABLED === "false") {
    console.log("Escaneo automático de depósitos desactivado por .env.");
    return;
  }

  const intervalMs = Number(process.env.AUTO_DEPOSIT_SCAN_INTERVAL_MS || 60000);
  const initialDelayMs = Number(process.env.AUTO_DEPOSIT_SCAN_INITIAL_DELAY_MS || 15000);

  console.log(`Escaneo automático de depósitos activo cada ${intervalMs / 1000}s.`);

  setTimeout(runAutomaticDepositScan, initialDelayMs);
  setInterval(runAutomaticDepositScan, intervalMs);
}

module.exports = {
  startAutomaticDepositScanner,
  runAutomaticDepositScan,
};
