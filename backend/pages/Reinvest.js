import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiEye, FiEyeOff } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { createReinvestment, getReinvestStatus } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatUsdt(value, digits = 6) {
  return toNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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
      setMessage(error.message || "No se pudo cargar la reinversión.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

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
    setAmount(String(Number(commissionWallet.toFixed(6))));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setMessage("Ingresa un monto válido y tu PIN de seguridad.");
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
      setMessage(result.message || "Reinversión realizada correctamente.");
      setMessageType("success");
      await loadStatus();
    } catch (error) {
      setMessage(error.message || "No se pudo realizar la reinversión.");
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page reinvest-page">
      <div className="reinvest-header">
        <button type="button" onClick={() => navigate(-1)}>
          <FiArrowLeft />
        </button>
        <h2>{t("Re-invertir")}</h2>
        <span />
      </div>

      <section className="reinvest-balance-card">
        <div className="reinvest-wallet-card reinvest-wallet-source">
          <span>{t("Monedero de comisiones")}</span>
          <strong data-no-translate="true">{formatUsdt(commissionWallet)}</strong>
          <small>{t("Saldo disponible para reinvertir")}</small>
        </div>

        <div className="reinvest-arrow-badge">
          <FiArrowRight className="reinvest-arrow" />
        </div>

        <div className="reinvest-wallet-card reinvest-wallet-target">
          <span>{t("Cartera de inversión")}</span>
          <strong data-no-translate="true">{formatUsdt(investmentWallet)}</strong>
          <small>{t("Saldo actual de inversión")}</small>
        </div>
      </section>

      {message && (
        <div className={`reinvest-message ${messageType}`}>
          {message}
        </div>
      )}

      <form className="reinvest-form" onSubmit={handleSubmit}>
        <label className="reinvest-field">
          <span>{t("Cantidad")}</span>
          <div className="reinvest-input-row">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("Cantidad")}
              disabled={loading || submitting}
            />
            <button type="button" onClick={handleSetMax} disabled={commissionWallet <= 0 || submitting}>
              {t("Todo")}
            </button>
          </div>
          <small data-no-translate="true">
            Disponible: {formatUsdt(commissionWallet)} USDT
          </small>
        </label>

        <label className="reinvest-field">
          <span>{t("PIN de seguridad")}</span>
          <div className="reinvest-input-row">
            <input
              type={showPin ? "text" : "password"}
              value={securityPassword}
              onChange={(e) => setSecurityPassword(e.target.value)}
              placeholder={t("PIN de seguridad")}
              disabled={loading || submitting}
            />
            <button type="button" onClick={() => setShowPin((value) => !value)}>
              {showPin ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </label>

        <div className="reinvest-preview">
          <span>{t("Nueva inversión estimada")}</span>
          <strong data-no-translate="true">{formatUsdt(estimatedInvestment)} USDT</strong>
        </div>

        <button className="reinvest-submit" type="submit" disabled={!canSubmit}>
          {submitting ? t("Procesando...") : t("DE ACUERDO")}
        </button>
      </form>
    </div>
  );
}
