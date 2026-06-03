const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "SOLUSDT",
  "DOGEUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "TRXUSDT",
  "AVAXUSDT",
  "BCHUSDT",
];

const BINANCE_API_BASE = process.env.BINANCE_API_BASE || "https://api.binance.com";
const CACHE_TTL_MS = Number(process.env.MARKET_PRICES_CACHE_MS || 30000);

let cache = {
  expiresAt: 0,
  data: null,
};

function getConfiguredSymbols() {
  const raw = process.env.MARKET_PRICE_SYMBOLS;
  if (!raw) return DEFAULT_SYMBOLS;

  const values = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  return values.length > 0 ? values : DEFAULT_SYMBOLS;
}

function symbolToBaseAsset(symbol) {
  return String(symbol || "").replace(/USDT$/i, "");
}

function formatMarketRow(item) {
  const symbol = item.symbol;
  const baseAsset = symbolToBaseAsset(symbol);

  return {
    symbol,
    asset: baseAsset,
    pair: `${baseAsset}/USDT`,
    lastPrice: Number(item.lastPrice || 0),
    priceChangePercent: Number(item.priceChangePercent || 0),
    highPrice: Number(item.highPrice || 0),
    lowPrice: Number(item.lowPrice || 0),
    volume: Number(item.volume || 0),
    quoteVolume: Number(item.quoteVolume || 0),
    closeTime: item.closeTime || null,
  };
}

async function fetchBinancePrices() {
  const symbols = getConfiguredSymbols();
  const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
  const url = `${BINANCE_API_BASE}/api/v3/ticker/24hr?symbols=${symbolsParam}&type=FULL`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.msg || data?.message || `Binance HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!Array.isArray(data)) {
    throw new Error("Respuesta inesperada de Binance.");
  }

  const order = new Map(symbols.map((symbol, index) => [symbol, index]));

  return data
    .map(formatMarketRow)
    .sort((a, b) => (order.get(a.symbol) ?? 999) - (order.get(b.symbol) ?? 999));
}

async function getMarketPrices({ force = false } = {}) {
  const now = Date.now();

  if (!force && cache.data && cache.expiresAt > now) {
    return {
      source: "cache",
      updatedAt: cache.updatedAt,
      prices: cache.data,
    };
  }

  const prices = await fetchBinancePrices();

  cache = {
    data: prices,
    updatedAt: new Date().toISOString(),
    expiresAt: now + CACHE_TTL_MS,
  };

  return {
    source: "binance",
    updatedAt: cache.updatedAt,
    prices,
  };
}

module.exports = {
  getMarketPrices,
};
