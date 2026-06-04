import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiEye, FiEyeOff } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { createReinvestment, getReinvestStatus } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatUsdt(value, digits = 3) {
  return toNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function normalizeReinvestMessage(message) {
  const raw = String(message || "").trim();

  if (!raw) return "";

  if (/pin de seguridad incorrecto/i.test(raw) || /seguridad incorrecta/i.test(raw) || /security pin incorrect/i.test(raw)) {
    return "Contraseña incorrecta";
  }

  return raw;
}

export default function Reinvest() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [amount, setAmount] = useState("");
  const [securityPassword, setSecurityPassword] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getReinvestStatus();
      setStatus(result);
      setMessage("");
    } catch (error) {
      setMessage(normalizeReinvestMessage(error.message || "No se pudo cargar la reinversión."));
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [message]);

  const commissionWallet = toNumber(status?.balances?.commissionWalletUsdt);
  const investmentWallet = toNumber(status?.balances?.investmentWalletUsdt);
  const amountNumber = toNumber(amount);

  const estimatedInvestment = useMemo(() => {
    return investmentWallet + amountNumber;
  }, [investmentWallet, amountNumber]);

  const canSubmit =
    amountNumber > 0 &&
    amountNumber <= commissionWallet &&
    securityPassword.trim().length > 0 &&
    !submitting;

  const handleSetMax = () => {
    if (commissionWallet <= 0) return;
    setAmount(commissionWallet.toFixed(3));
  };

  const handleAmountChange = (value) => {
    if (value === "") {
      setAmount("");
      return;
    }

    const normalized = value.replace(/,/g, ".");
    if (!/^\d*(\.\d{0,3})?$/.test(normalized)) {
      return;
    }

    const nextAmount = toNumber(normalized);
    if (commissionWallet > 0 && nextAmount > commissionWallet) {
      setAmount(commissionWallet.toFixed(3));
      return;
    }

    setAmount(normalized);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setMessage(normalizeReinvestMessage("Ingresa un monto válido y tu contraseña de cuenta."));
      setMessageType("error");
      return;
    }

    try {
      setSubmitting(true);
      const result = await createReinvestment({
        amount: amountNumber,
        securityPassword,
      });

      setStatus((prev) => ({
        ...(prev || {}),
        balances: {
          ...(prev?.balances || {}),
          ...(result?.balances || {}),
        },
        mining: result?.mining || prev?.mining,
      }));
      setAmount("");
      setSecurityPassword("");
      setMessage(normalizeReinvestMessage(result.message || "Reinversión realizada correctamente."));
      setMessageType("success");
      await loadStatus();
    } catch (error) {
      setMessage(normalizeReinvestMessage(error.message || "No se pudo realizar la reinversión."));
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page reinvest-page">
      {loading && (
        <div className="garden-loading-overlay app-loading-overlay">
          <div className="garden-loading-popup app-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>{t("Cargando...")}</strong>
          </div>
        </div>
      )}
      <div className="reinvest-header">
        <button type="button" onClick={() => navigate(-1)}>
          <FiArrowLeft />
        </button>
        <h2>{t("Re-invertir")}</h2>
        <span />
      </div>

      {message && (
        <div className={`center-simple-toast center-simple-toast-${messageType}`}>
          <span>{message}</span>
        </div>
      )}

      <form className="reinvest-form" onSubmit={handleSubmit}>
        <div className="reinvest-summary-table">
          <div className="reinvest-summary-row">
            <span>{t("Retirable disponible")}</span>
            <strong data-no-translate="true">{formatUsdt(commissionWallet)} USDT</strong>
          </div>
          <div className="reinvest-summary-row">
            <span>{t("Cartera de recarga")}</span>
            <strong data-no-translate="true">{formatUsdt(investmentWallet)} USDT</strong>
          </div>
        </div>

        <label className="reinvest-field">
          <span>{t("Cantidad")}</span>
          <div className="reinvest-input-row">
            <input
              type="text"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder={t("Cantidad")}
              disabled={loading || submitting}
            />
            <button type="button" onClick={handleSetMax} disabled={commissionWallet <= 0 || submitting}>
              {t("Todo")}
            </button>
          </div>
        </label>

        <label className="reinvest-field">
          <span>{t("Contraseña de cuenta")}</span>
          <div className="reinvest-input-row">
            <input
              type={showPin ? "text" : "password"}
              value={securityPassword}
              onChange={(e) => setSecurityPassword(e.target.value)}
              placeholder={t("Contraseña de cuenta")}
              disabled={loading || submitting}
            />
            <button type="button" onClick={() => setShowPin((value) => !value)}>
              {showPin ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </label>

        <div className="reinvest-result-row">
          <span>{t("Resultado")}</span>
          <strong data-no-translate="true">{formatUsdt(estimatedInvestment)} USDT</strong>
        </div>

        <button className="reinvest-submit" type="submit" disabled={!canSubmit}>
          {submitting ? t("Procesando...") : t("Confirmar")}
        </button>
      </form>
    </div>
  );
}
