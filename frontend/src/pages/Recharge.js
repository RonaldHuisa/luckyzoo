import React, { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiCopy, FiRefreshCw } from "react-icons/fi";
import { QRCodeCanvas } from "qrcode.react";
import api from "../services/api";
import bep20Icon from "../assets/networks/usdt-bep20.png";
import polygonIcon from "../assets/networks/usdt-polygon.png";

const FALLBACK_NETWORKS = [
  { code: "BEP20-USDT", displayName: "BEP20" },
  { code: "POLYGON-USDT", displayName: "POLYGON" },
];

function networkInfo(code) {
  if (code === "POLYGON-USDT") {
    return {
      icon: polygonIcon,
      label: "POLYGON",
      sublabel: "USDT · Polygon",
      badge: "POLYGON",
    };
  }
  return {
    icon: bep20Icon,
    label: "BEP20",
    sublabel: "USDT · BNB Smart Chain",
    badge: "BEP20",
  };
}

export default function Recharge() {
  const [network, setNetwork] = useState("BEP20-USDT");
  const [wallet, setWallet] = useState(null);
  const [supported, setSupported] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const networks = useMemo(() => (supported.length ? supported : FALLBACK_NETWORKS), [supported]);
  const selectedNetwork = networkInfo(network);

  const showToast = (text) => {
    setToast(text);
    window.clearTimeout(window.__royalRechargeToastTimer);
    window.__royalRechargeToastTimer = window.setTimeout(() => setToast(""), 1200);
  };

  const loadWallet = async (selected = network) => {
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
    loadWallet();
    return () => window.clearTimeout(window.__royalRechargeToastTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeNetwork = (value) => {
    setNetwork(value);
    loadWallet(value);
  };

  const copyAddress = async () => {
    if (!wallet?.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      showToast("Copiado");
    } catch (err) {
      showToast("No se pudo copiar");
    }
  };

  const verify = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    window.dispatchEvent(new CustomEvent("royal:loading-message", { detail: "Verificando..." }));
    try {
      const { data } = await api.post("/deposits/scan-me", { network });
      setMessage(data.message || "Verificación enviada correctamente.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack recharge-page recharge-page-v22">
      {toast && (
        <div className="recharge-toast-backdrop" aria-live="polite">
          <div className="recharge-toast-box"><FiCheckCircle /><strong>{toast}</strong></div>
        </div>
      )}

      <section className="page-header-card recharge-hero-card compact-recharge-hero">
        <div>
          <span className="eyebrow">Recargas</span>
          <h2>Recarga USDT</h2>
          <p>Copia tu wallet personal y confirma cuando hayas enviado.</p>
        </div>
      </section>

      {error && <div className="alert error compact-alert">{error}</div>}
      {message && <div className="alert success compact-alert">{message}</div>}

      <section className="recharge-layout compact-recharge-layout">
        <article className="panel-card recharge-card-main compact-recharge-panel">
          <div className="section-title compact-section-title">
            <span>Red</span>
            <h3>Selecciona una red</h3>
          </div>

          <div className="recharge-network-select-card">
            <div className="selected-network-icon" aria-hidden="true">
              <img src={selectedNetwork.icon} alt="" />
            </div>
            <div className="network-select-field">
              <label htmlFor="deposit-network">Red de depósito</label>
              <select id="deposit-network" value={network} onChange={(event) => changeNetwork(event.target.value)}>
                {networks.map((item) => {
                  const meta = networkInfo(item.code);
                  return <option key={item.code} value={item.code}>{meta.label}</option>;
                })}
              </select>
              <small>{selectedNetwork.sublabel}</small>
            </div>
          </div>

          <div className="compact-wallet-box recharge-wallet-v22">
            <div className="wallet-title-row">
              <span>Wallet personal</span>
              <small>{selectedNetwork.badge}</small>
            </div>
            <code className="wallet-full-address" title={wallet?.address || ""}>{wallet?.address || "Cargando wallet..."}</code>
            <button className="copy-mini-btn wallet-copy-bottom" type="button" onClick={copyAddress} disabled={!wallet?.address}>
              <FiCopy /> Copiar wallet
            </button>
          </div>

          <button className="primary-btn verify-recharge-btn compact-verify-btn" disabled={loading || !wallet?.address} onClick={verify}>
            <FiRefreshCw className={loading ? "spin-icon" : ""} /> {loading ? "Verificando" : "Verificar recarga"}
          </button>
        </article>

        <article className="panel-card qr-card recharge-qr-card compact-qr-panel">
          <div className="qr-frame compact-qr-frame">
            {wallet?.address ? <QRCodeCanvas value={wallet.address} size={190} includeMargin /> : <span>Cargando QR...</span>}
          </div>
          <p className="recharge-mini-policy">
            Verifica que la red y la dirección coincidan antes de enviar. Las operaciones realizadas en una red distinta no pueden ser asumidas por Royal Imperial.
          </p>
          <p className="recharge-support-note compact-support-note">
            El abono suele reflejarse en 2 a 5 minutos. Si enviaste correctamente y no aparece, contacta a soporte.
          </p>
        </article>
      </section>
    </div>
  );
}
