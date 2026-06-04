import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import {
  FiArrowLeft,
  FiChevronRight,
  FiCopy,
  FiInfo,
  FiList,
} from "react-icons/fi";
import { getMyWalletFromApi, scanMyDeposits } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

const PAYMENT_NETWORKS = [
  {
    code: "BEP20-USDT",
    label: "BEP20-USDT",
    shortLabel: "BEP20-USDT",
    chain: "BNB Smart Chain BEP20",
    description: "BNB Smart Chain",
    token: "USDT",
    icon: "/images/networks/bep20-usdt.webp",
    enabled: true,
  },
  {
    code: "POLYGON-USDT",
    label: "POLYGON-USDT",
    shortLabel: "POLYGON-USDT",
    chain: "Polygon",
    description: "Polygon",
    token: "USDT",
    icon: "/images/networks/polygon-usdt.webp",
    enabled: true,
  },
];

function getNetworkByCode(code) {
  return PAYMENT_NETWORKS.find((item) => item.code === code) || PAYMENT_NETWORKS[0];
}

export default function Recharge() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();
  const toastTimerRef = useRef(null);

  const initialNetwork = searchParams.get("network") || "";
  const [selectedNetwork, setSelectedNetwork] = useState(initialNetwork);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("info");
  const [error, setError] = useState("");

  const isSelectingNetwork = !selectedNetwork;

  const currentNetwork = useMemo(
    () => getNetworkByCode(selectedNetwork || "BEP20-USDT"),
    [selectedNetwork]
  );

  const showToast = useCallback((message, type = "info", duration = 3200) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    setToast(message);
    setToastType(type);

    toastTimerRef.current = setTimeout(() => {
      setToast("");
    }, duration);
  }, []);

  const loadWallet = useCallback(async () => {
    if (!selectedNetwork) return;

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

  const handleSelectNetwork = (networkCode) => {
    setWallet(null);
    setError("");
    setSelectedNetwork(networkCode);
    setSearchParams({ network: networkCode });
  };

  const handleBack = () => {
    if (!isSelectingNetwork) {
      setSelectedNetwork("");
      setWallet(null);
      setError("");
      setSearchParams({});
      return;
    }

    navigate("/home");
  };

  const handleCopy = async () => {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      showToast(t("Dirección copiada"), "success", 2200);

      setTimeout(() => {
        setCopied(false);
      }, 1600);
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

      const scanResult = await scanMyDeposits(selectedNetwork);
      const addedAmount = Number(scanResult?.addedAmount || 0);
      const addedDeposits = Number(scanResult?.addedDeposits || 0);
      const reconciledCreditAmount = Number(scanResult?.reconciledCreditAmount || 0);
      const credited = Boolean(scanResult?.credited) || addedDeposits > 0 || addedAmount > 0 || reconciledCreditAmount > 0;
      const alreadyProcessed = Boolean(scanResult?.alreadyProcessed);
      const pendingVerification = Boolean(scanResult?.pendingVerification);

      if (credited) {
        showToast(t("Éxito"), "success", 1800);

        localStorage.setItem("greenvest_balance_refresh", String(Date.now()));
        window.dispatchEvent(new Event("greenvest:balance-refresh"));

        setTimeout(() => {
          navigate(`/home?refresh=${Date.now()}`, { replace: true });
        }, 900);
      } else if (pendingVerification || alreadyProcessed) {
        showToast(t("Éxito"), "success", 1800);
      } else {
        showToast(t("Éxito"), "success", 1800);
      }

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
    <div className="page recharge-simple-page">
      {loading && (
        <div className="garden-loading-overlay app-loading-overlay">
          <div className="garden-loading-popup app-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>{t("Cargando...")}</strong>
          </div>
        </div>
      )}
      {toast && (
        <div className={`center-simple-toast center-simple-toast-${toastType}`}>
          <span>{toast}</span>
        </div>
      )}

      <div className="recharge-simple-header">
        <button className="recharge-simple-back" type="button" onClick={handleBack}>
          <FiArrowLeft />
        </button>

        <h2>{isSelectingNetwork ? t("Método de depósito") : t("Recargar plantas")}</h2>

        {!isSelectingNetwork ? (
          <button className="recharge-simple-action" type="button" onClick={handleCopy}>
            <FiCopy />
          </button>
        ) : (
          <span className="recharge-simple-placeholder" />
        )}
      </div>

      {isSelectingNetwork ? (
        <div className="deposit-method-wrap">
          <div className="deposit-method-note">
            <span className="deposit-method-note-leaf">🌿</span>
            <span>{t("Selecciona la red correcta para recargar tus plantas con USDT de forma segura.")}</span>
          </div>

          <section className="deposit-method-panel">
            {PAYMENT_NETWORKS.filter((network) => network.enabled).map((network) => (
              <button
                key={network.code}
                type="button"
                className="deposit-method-row"
                onClick={() => handleSelectNetwork(network.code)}
              >
                <span className="deposit-method-icon">
                  <img src={network.icon} alt={network.label} />
                </span>

                <span className="deposit-method-text">
                  <strong>{network.label}</strong>
                  <small>{network.description} · USDT</small>
                </span>

                <FiChevronRight className="deposit-method-chevron" />
              </button>
            ))}
          </section>
        </div>
      ) : (
        <section className="deposit-detail-simple">
          <div className="deposit-premium-hero">
            <div className="deposit-premium-logo">
              <img src="/GreenVest_ico.png" alt="GreenVest" />
            </div>
            <div>
              <span>{t("Recarga tu jardín")}</span>
              <strong>{t("Depósito USDT")}</strong>
            </div>
          </div>

          <div className="deposit-selected-network-simple">
            <span className="deposit-detail-network-icon">
              <img src={currentNetwork.icon} alt={currentNetwork.label} />
            </span>
            <strong>{currentNetwork.label}</strong>
          </div>

          {loading ? null : (
            <>
              {error && <div className="auth-error recharge-error-inline">{error}</div>}

              <div className="deposit-qr-simple">
                <QRCodeCanvas
                  value={address}
                  size={150}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="deposit-address-simple-block">
                <label>{t("Dirección de depósito")}</label>

                <div className="deposit-address-simple-row">
                  <span title={address || t("Sin dirección disponible")}>{address || t("Sin dirección disponible")}</span>
                  <button type="button" onClick={handleCopy} disabled={!address}>
                    {copied ? t("Copiado") : t("Copiar")}
                  </button>
                </div>
              </div>

              <button
                className="deposit-confirm-simple-btn"
                type="button"
                onClick={handleScan}
                disabled={scanning || !address}
              >
                {scanning ? t("Confirmando...") : t("Confirmar recarga")}
              </button>

              <div className="deposit-note-simple">
                <div className="deposit-note-title">
                  <FiInfo />
                  <strong>{t("Nota")}</strong>
                </div>

                <ol>
                  <li>
                    {t("Deposita únicamente USDT en la red seleccionada para evitar errores en la recarga.")}
                  </li>
                  <li>
                    {t("Los montos menores a 10 USDT no serán considerados dentro del sistema.")}
                  </li>
                  <li>
                    {t("Si en los próximos 3 a 5 minutos no se refleja el monto depositado, puedes presionar nuevamente Confirmar recarga o contactarte con soporte.")}
                  </li>
                  <li>
                    {t("No realizamos reembolsos por depósitos enviados a redes incorrectas, direcciones equivocadas o activos distintos a USDT.")}
                  </li>
                </ol>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
