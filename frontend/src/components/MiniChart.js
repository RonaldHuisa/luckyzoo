import React, { useMemo } from "react";

const BASE_PRICE = {
  BTC: 63240,
  ETH: 2860,
  SOL: 146,
  MARKET: 24000,
};

const SCENARIO_PROFILES = {
  uptrend: [
    { length: 8, drift: 0.10, volatility: 0.30 },
    { length: 6, drift: -0.08, volatility: 0.28 },
    { length: 14, drift: 0.24, volatility: 0.42 },
    { length: 8, drift: 0.06, volatility: 0.30 },
  ],
  downtrend: [
    { length: 8, drift: 0.03, volatility: 0.28 },
    { length: 9, drift: -0.13, volatility: 0.34 },
    { length: 10, drift: -0.28, volatility: 0.46 },
    { length: 9, drift: -0.07, volatility: 0.32 },
  ],
  sideways: [
    { length: 9, drift: 0.04, volatility: 0.34 },
    { length: 8, drift: -0.04, volatility: 0.36 },
    { length: 10, drift: 0.03, volatility: 0.31 },
    { length: 9, drift: -0.02, volatility: 0.30 },
  ],
  volatile: [
    { length: 7, drift: 0.22, volatility: 0.70 },
    { length: 8, drift: -0.26, volatility: 0.76 },
    { length: 9, drift: 0.30, volatility: 0.84 },
    { length: 12, drift: -0.02, volatility: 0.54 },
  ],
  recovery: [
    { length: 10, drift: -0.17, volatility: 0.38 },
    { length: 8, drift: -0.05, volatility: 0.32 },
    { length: 7, drift: 0.05, volatility: 0.36 },
    { length: 11, drift: 0.30, volatility: 0.58 },
  ],
  breakdown: [
    { length: 12, drift: 0.02, volatility: 0.26 },
    { length: 6, drift: -0.05, volatility: 0.30 },
    { length: 9, drift: -0.34, volatility: 0.58 },
    { length: 9, drift: -0.12, volatility: 0.38 },
  ],
};

function hashSeed(value) {
  return String(value || "MARKET").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function wave(index, seed, strength = 1) {
  return (
    Math.sin((index + seed) * 0.91) * 0.55 +
    Math.sin((index + seed * 0.37) * 1.74) * 0.30 +
    Math.cos((index + seed) * 0.43) * 0.20
  ) * strength;
}

function pickBase(asset) {
  return BASE_PRICE[String(asset || "MARKET").toUpperCase()] || BASE_PRICE.MARKET;
}

function targetCountByLevel(level) {
  if (Number(level) >= 5) return 52;
  if (Number(level) >= 3) return 46;
  if (Number(level) >= 1) return 40;
  return 32;
}

function scaleProfile(profile, count) {
  const total = profile.reduce((sum, part) => sum + part.length, 0);
  let used = 0;
  return profile.map((part, index) => {
    const length = index === profile.length - 1
      ? Math.max(3, count - used)
      : Math.max(3, Math.round((part.length / total) * count));
    used += length;
    return { ...part, length };
  });
}

function buildCandles({ type, asset, level }) {
  const base = pickBase(asset);
  const seed = hashSeed(`${asset}-${type}-${level}`);
  const count = targetCountByLevel(level);
  const profile = scaleProfile(SCENARIO_PROFILES[type] || SCENARIO_PROFILES.uptrend, count);
  const unit = Math.max(base * 0.0038, 10);
  const candles = [];
  let close = base * (1 + wave(0, seed, 0.006));

  profile.forEach((segment, segmentIndex) => {
    for (let i = 0; i < segment.length; i += 1) {
      const index = candles.length;
      const open = close;
      const directionNoise = wave(index, seed + segmentIndex * 11, segment.volatility);
      const alternating = (index % 3 === 0 ? -0.38 : index % 4 === 0 ? 0.42 : 0) * segment.volatility;
      const bodyMove = (segment.drift + directionNoise * 0.42 + alternating * 0.18) * unit;
      const impulse = (type === "breakdown" && segmentIndex === 2 && i === 1)
        ? -unit * 2.4
        : (type === "recovery" && segmentIndex === 3 && i === 2)
          ? unit * 2.2
          : (type === "uptrend" && segmentIndex === 2 && i === 3)
            ? unit * 1.55
            : (type === "downtrend" && segmentIndex === 2 && i === 2)
              ? -unit * 1.75
              : 0;

      close = open + bodyMove + impulse;
      const body = Math.abs(close - open);
      const wickBase = unit * (0.55 + Math.abs(wave(index, seed + 33, 0.65)));
      const upperWick = wickBase * (0.55 + ((index + seed) % 5) * 0.18);
      const lowerWick = wickBase * (0.55 + ((index + seed) % 4) * 0.22);
      const high = Math.max(open, close) + upperWick + body * 0.18;
      const low = Math.min(open, close) - lowerWick - body * 0.14;
      const volume = Math.max(
        12,
        30 + Math.abs(bodyMove / unit) * 16 + Math.abs(impulse / unit) * 22 + Math.abs(wave(index, seed + 90, 18))
      );

      candles.push([
        Math.round(open),
        Math.round(high),
        Math.round(low),
        Math.round(close),
        Math.round(volume),
      ]);
    }
  });

  return candles.slice(0, count);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function movingAveragePath(candles, period, scaleY, xStep) {
  const closes = candles.map((item) => item[3]);
  return closes.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const slice = closes.slice(start, index + 1);
    const value = average(slice);
    const x = 8 + index * xStep + xStep / 2;
    const y = scaleY(value);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

export default function MiniChart({ type = "uptrend", asset = "BTC", level = 0 }) {
  const candles = useMemo(() => buildCandles({ type, asset, level }), [type, asset, level]);

  const view = useMemo(() => {
    const lows = candles.map((c) => c[2]);
    const highs = candles.map((c) => c[1]);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const pad = Math.max((max - min) * 0.08, pickBase(asset) * 0.0018);
    const scaleY = (value) => 118 - ((value - min + pad) / (max - min + pad * 2)) * 96;
    return { min: min - pad, max: max + pad, scaleY };
  }, [candles, asset]);

  const volumeView = useMemo(() => {
    const maxVolume = Math.max(...candles.map((c) => c[4]), 1);
    const scaleVolume = (volume) => 145 - (volume / maxVolume) * 21;
    return { maxVolume, scaleVolume };
  }, [candles]);

  const lastClose = candles[candles.length - 1][3];
  const firstOpen = candles[0][0];
  const change = (((lastClose - firstOpen) / firstOpen) * 100).toFixed(2);
  const isPositive = lastClose >= firstOpen;
  const xStep = 296 / candles.length;
  const bodyWidth = Math.max(3.6, Math.min(7.2, xStep * 0.72));
  const axis = [view.max, (view.max + view.min) / 2, view.min];
  const ma7 = movingAveragePath(candles, 7, view.scaleY, xStep);
  const ma18 = movingAveragePath(candles, 18, view.scaleY, xStep);
  const ma35 = movingAveragePath(candles, Math.min(35, candles.length), view.scaleY, xStep);

  return (
    <div className={`mini-chart exchange-chart binance-chart pro-trading-chart ${type}`}>
      <div className="chart-meta exchange-meta">
        <span>{asset}</span>
        <em>1D · Mercado</em>
      </div>
      <div className="exchange-symbol-row">
        <strong>{asset} · USDT</strong>
        <span className={isPositive ? "market-up" : "market-down"}>{isPositive ? "+" : ""}{change}%</span>
      </div>
      <svg viewBox="0 0 330 150" preserveAspectRatio="none" role="img" aria-label={`Gráfico de velas de ${asset}`}>
        <g className="exchange-grid-lines">
          {[18, 38, 58, 78, 98, 118, 138].map((y) => <line key={`h-${y}`} x1="0" x2="304" y1={y} y2={y} />)}
          {[22, 46, 70, 94, 118, 142, 166, 190, 214, 238, 262, 286].map((x) => <line key={`v-${x}`} x1={x} x2={x} y1="14" y2="145" />)}
        </g>

        <g className="volume-bars">
          {candles.map(([open, , , close, volume], index) => {
            const x = 8 + index * xStep + xStep / 2;
            const y = volumeView.scaleVolume(volume);
            const up = close >= open;
            return (
              <rect
                key={`vol-${index}`}
                className={up ? "volume-up" : "volume-down"}
                x={x - bodyWidth / 2}
                y={y}
                width={bodyWidth}
                height={145 - y}
                rx="0.4"
              />
            );
          })}
        </g>

        <path className="ma-line ma-fast" d={ma7} />
        <path className="ma-line ma-slow" d={ma18} />
        <path className="ma-line ma-long" d={ma35} />

        {candles.map(([open, high, low, close], index) => {
          const x = 8 + index * xStep + xStep / 2;
          const yHigh = view.scaleY(high);
          const yLow = view.scaleY(low);
          const yOpen = view.scaleY(open);
          const yClose = view.scaleY(close);
          const top = Math.min(yOpen, yClose);
          const height = Math.max(2.6, Math.abs(yOpen - yClose));
          const up = close >= open;
          return (
            <g key={`${index}-${open}-${close}`} className={up ? "candle candle-up" : "candle candle-down"}>
              <line x1={x} x2={x} y1={yHigh} y2={yLow} />
              <rect x={x - bodyWidth / 2} y={top} width={bodyWidth} height={height} rx="0.45" />
            </g>
          );
        })}

        <line className="last-price-line" x1="0" x2="304" y1={view.scaleY(lastClose)} y2={view.scaleY(lastClose)} />
        <g className="chart-axis">
          {axis.map((value, idx) => (
            <text key={idx} x="308" y={view.scaleY(value) + 4}>{Math.round(value).toLocaleString()}</text>
          ))}
        </g>
      </svg>
    </div>
  );
}
