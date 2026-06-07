import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { FiArrowLeft, FiCopy, FiCheckCircle } from "react-icons/fi";
import { getMyWalletFromApi, scanMyDeposits } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";
import usdtBep20Icon from "../assets/networks/usdt-bep20.png";
import usdtPolygonIcon from "../assets/networks/usdt-polygon.png";

const PAYMENT_NETWORKS = [
  {
    code: "BEP20-USDT",
    label: "BEP20-USDT",
    chain: "BNB Smart Chain BEP20",
    tokenBadge: "BNB",
    icon: usdtBep20Icon,
  },
  {
    code: "POLYGON-USDT",
    label: "POLYGON-USDT",
    chain: "Polygon",
    tokenBadge: "POLYGON",
    icon: usdtPolygonIcon,
  },
];

export default function Recharge() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const toastTimerRef = useRef(null);

  const [selectedNetwork, setSelectedNetwork] = useState("BEP20-USDT");
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("info");
  const [error, setError] = useState("");

  const currentNetwork = useMemo(
    () => PAYMENT_NETWORKS.find((item) => item.code === selectedNetwork) || PAYMENT_NETWORKS[0],
    [selectedNetwork]
  );

  const showToast = useCallback((message, type = "info", duration = 3800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    setToast(message);
    setToastType(type);

    toastTimerRef.current = setTimeout(() => {
      setToast("");
    }, duration);
  }, []);

  const showTempCopied = useCallback(() => {
    setCopied(true);
    showToast(t("Dirección copiada"), "success", 2200);

    setTimeout(() => {
      setCopied(false);
    }, 1800);
  }, [showToast, t]);

  const loadWallet = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getMyWalletFromApi(selectedNetwork);
      setWallet(data.wallet || data);
    } catch (err) {
      const message = err.message || t("No se pudo cargar la dirección de depósito.");
      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [selectedNetwork, showToast, t]);

  useEffect(() => {
    loadWallet();

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [loadWallet]);

  const address =
    wallet?.address ||
    wallet?.wallet_address ||
    wallet?.walletAddress ||
    wallet?.deposit_address ||
    wallet?.depositAddress ||
    wallet?.usdt_address ||
    wallet?.usdtAddress ||
    wallet?.bep20_address ||
    wallet?.bep20Address ||
    "";

  const handleCopy = async () => {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      showTempCopied();
    } catch {
      const message = t("No se pudo copiar la dirección.");
      setError(message);
      showToast(message, "error");
    }
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      setError("");

      await scanMyDeposits(selectedNetwork);

      showToast(
        t("Éxito. La plataforma revisará y acreditará tu recarga automáticamente."),
        "success",
        5200
      );

      await loadWallet();
    } catch (err) {
      const message = err.message || t("No se pudo registrar la confirmación de recarga.");
      setError(message);
      showToast(message, "error", 5200);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="page recharge-page recharge-pro-page">
      {toast && (
        <div className={`luven-toast luven-toast-${toastType}`}>
          <strong>{toast}</strong>
        </div>
      )}

      <div className="recharge-header recharge-pro-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/home")}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">{currentNetwork.label}</div>
          <h2>{t("Recargar")}</h2>
        </div>

        <button className="icon-btn ghost-icon" type="button" onClick={handleCopy}>
          <FiCopy />
        </button>
      </div>

      <div className="panel network-select-panel">
        <div className="network-select-title">
          <strong>{t("Selecciona red de depósito")}</strong>
          <span>{t("Elige la red antes de enviar fondos.")}</span>
        </div>

        <div className="network-option-grid">
          {PAYMENT_NETWORKS.map((network) => (
            <button
              key={network.code}
              type="button"
              className={`network-option-card ${selectedNetwork === network.code ? "active" : ""}`}
              onClick={() => setSelectedNetwork(network.code)}
            >
              <span className="network-option-icon">
                <img src={network.icon} alt={network.label} />
              </span>
              <span className="network-option-text">
                <strong>{network.label}</strong>
                <small>{network.chain}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="panel recharge-loading-card">
          <p>{t("Cargando dirección de depósito...")}</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="panel auth-error recharge-error-inline">
              {error}
            </div>
          )}

          <div className="panel recharge-pro-card">
            <div className="recharge-network-top recharge-network-top-centered">
              <h3>{t("Red de depósito")}</h3>
              <div className="selected-network-card">
                <img
                  className="selected-network-icon"
                  src={currentNetwork.icon}
                  alt={currentNetwork.label}
                />
                <div className="selected-network-copy">
                  <strong>{currentNetwork.label}</strong>
                  <span>{currentNetwork.chain}</span>
                </div>
              </div>
            </div>

            <div className="qr-frame">
              <div className="qr-wrapper">
                <QRCodeCanvas
                  value={address}
                  size={190}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                  includeMargin={true}
                />
              </div>
            </div>
          </div>

          <div className="panel deposit-panel deposit-pro-panel">
            <div className="deposit-title-row deposit-title-row-clean">
              <div>
                <h3 className="deposit-title">{t("Dirección de depósito")}</h3>
                <span className="deposit-subtitle">Wallet</span>
              </div>
              <span className="wallet-tag">{currentNetwork.label}</span>
            </div>

            <div className="deposit-box deposit-pro-box deposit-box-clean">
              <span className="deposit-address">
                {address || t("Sin dirección disponible")}
              </span>

              <button
                className="copy-btn deposit-copy-btn"
                type="button"
                onClick={handleCopy}
                disabled={!address}
              >
                <FiCopy />
                <span>{copied ? t("Copiado") : t("Copiar")}</span>
              </button>
            </div>
          </div>

          <button
            className="primary-btn recharge-main-btn"
            type="button"
            onClick={handleScan}
            disabled={scanning || !address}
          >
            {scanning ? t("Confirmando...") : t("He realizado mi recarga")}
          </button>

          <div className="recharge-notes recharge-pro-notes">
            <div className="notes-title">
              <FiCheckCircle />
              <span>{t("Recordatorio importante")}</span>
            </div>

            <ol>
              <li>{t("Copia la dirección superior o escanea el código QR.")}</li>
              <li>
                {t("Usa únicamente la red")}{" "}
                <strong>{currentNetwork.chain}</strong>{" "}
                {t("para enviar USDT.")}
              </li>
              <li>
                {t("Después de enviar el pago, presiona")}{" "}
                <strong>“{t("Recarga completa")}”</strong>.{" "}
                {t("Este paso es vital para verificar la blockchain y abonar tu saldo.")}
              </li>
              <li>
                {t("El botón solo muestra una confirmación. No fuerza el escaneo manual ni duplica depósitos.")}
              </li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
