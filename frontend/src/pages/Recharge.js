import React, { useEffect, useMemo, useState } from "react";
import { FiCopy } from "react-icons/fi";
import { SiBinance, SiPolygon, SiTether } from "react-icons/si";
import { QRCodeCanvas } from "qrcode.react";
import api from "../services/api";
import rechargeBanner from "../assets/recharge/recharge-banner.png";

const fallbackNetworks = ["BEP20-USDT", "POLYGON-USDT"];

const NETWORK_META = {
  "BEP20-USDT": {
    short: "BEP20",
    walletLabel: "BEP20",
    badge: "Recomendada",
    icon: SiBinance,
    tone: "recommended"
  },
  "POLYGON-USDT": {
    short: "POLYGON",
    walletLabel: "POLYGON",
    badge: "Secundaria",
    icon: SiPolygon,
    tone: "secondary"
  }
};

export default function Recharge() {
  const [network, setNetwork] = useState("BEP20-USDT");
  const [wallet, setWallet] = useState(null);
  const [supported, setSupported] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [changeFx, setChangeFx] = useState(0);

  const networks = useMemo(() => {
    const source = supported.length ? supported.map((n) => n.code || n) : fallbackNetworks;
    const filtered = source.filter((code) => ["BEP20-USDT", "POLYGON-USDT"].includes(code));
    return filtered.length ? filtered : fallbackNetworks;
  }, [supported]);

  const load = async (selected = network) => {
    setError("");
    try {
      const { data } = await api.get(`/wallet/me?network=${encodeURIComponent(selected)}`);
      setWallet(data.wallet);
      setSupported(data.supportedNetworks || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const copy = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setToast("Dirección copiada.");
    setTimeout(() => setToast(""), 1400);
  };

  const selected = NETWORK_META[network] || NETWORK_META["BEP20-USDT"];
  const SelectedIcon = selected.icon;

  return (
    <div className="page-stack recharge-page recharge-page-flat recharge-page-v30 recharge-page-v32">
      {toast && <div className="recharge-v62-toast">{toast}</div>}

      <section className="recharge-banner-head">
        <img src={rechargeBanner} alt="Banner de recarga" className="recharge-banner-image" />
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="recharge-network-grid flat-network-grid flat-network-grid-v30">
        {networks.map((item) => {
          const meta = NETWORK_META[item] || NETWORK_META["BEP20-USDT"];
          const Icon = meta.icon;
          const active = network === item;
          return (
            <button
              key={item}
              type="button"
              className={`recharge-network-card flat-network-card flat-network-card-v30 ${active ? "active" : ""} ${meta.tone}`}
              onClick={() => {
                setNetwork(item);
                setChangeFx((prev) => prev + 1);
                load(item);
              }}
            >
              <div className="flat-network-icons flat-network-icons-v30">
                <span className="flat-token-icon"><SiTether /></span>
                <span className={`flat-main-icon ${meta.tone}`}><Icon /></span>
              </div>
              <div className="flat-network-labels-v30">
                <strong>{meta.short}</strong>
                {meta.tone === "recommended" ? <small>Recomendada</small> : null}
              </div>
            </button>
          );
        })}
      </section>

      <section className="wallet-card recharge-flat-card recharge-flat-card-v30 recharge-flat-card-v32">
        <div className="recharge-flat-layout recharge-flat-layout-v30 recharge-flat-layout-v32">
          <div className="flat-qr-side flat-qr-side-v30 flat-qr-side-v32">
            <div className="flat-qr-box flat-qr-box-v30 flat-qr-box-v32">
              {wallet?.address ? <QRCodeCanvas key={`qr-${network}`} value={wallet.address} size={124} className="wallet-fade-fx" /> : <span>QR</span>}
            </div>
          </div>

          <div className="flat-address-side flat-address-side-v30 flat-address-side-v32">
            <div key={`addr-${network}-${changeFx}`} className="flat-address-block flat-address-block-v30 flat-address-block-v32 wallet-fade-fx">
              <span className="wallet-line-title">
                Dirección wallet <em>- {selected.walletLabel}</em>
              </span>
              <strong>{wallet?.address || "Cargando dirección..."}</strong>
            </div>

            <button className="flat-copy-btn flat-copy-btn-v30 flat-copy-btn-v32" onClick={copy}>
              <FiCopy /> Copiar dirección
            </button>

            <small>La acreditación se detecta automáticamente cuando se confirme el depósito.</small>
          </div>
        </div>
      </section>

      <section className="recharge-steps-flat recharge-steps-flat-v30">
        <h3>Cómo recargar</h3>
        <ol>
          <li>Selecciona la red.</li>
          <li>Copia la dirección wallet y envía tu depósito.</li>
          <li>La plataforma detectará tu recarga automáticamente.</li>
        </ol>
      </section>
    </div>
  );
}
