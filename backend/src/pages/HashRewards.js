import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiAward, FiGift, FiRefreshCw, FiTrendingUp, FiUsers, FiZap } from "react-icons/fi";
import { getHashRewardsStatus, redeemHashPoint, syncHashRewards, getMiningStatus } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value, decimals = 2) {
  return toNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function HashRewards() {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [mining, setMining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rewardStatus, miningStatus] = await Promise.all([
        getHashRewardsStatus(),
        getMiningStatus(),
      ]);
      setStatus(rewardStatus);
      setMining(miningStatus?.mining || null);
      setMessage("");
    } catch (error) {
      setMessage(error.message || t("No se pudo cargar premios."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const progressPercent = useMemo(() => {
    const current = toNumber(status?.hashBonusPercent);
    const max = toNumber(status?.maxBonusPercent || 5);
    if (max <= 0) return 0;
    return Math.min(100, Math.max(0, (current / max) * 100));
  }, [status]);

  const handleSync = async () => {
    try {
      setWorking(true);
      const result = await syncHashRewards();
      setStatus(result.status || result);
      setMessage(result.message || t("Puntos actualizados."));
    } catch (error) {
      setMessage(error.message || t("No se pudo actualizar puntos."));
    } finally {
      setWorking(false);
    }
  };

  const handleRedeem = async () => {
    try {
      setWorking(true);
      const result = await redeemHashPoint();
      setStatus(result.status || status);
      setMessage(result.message || t("Punto hash canjeado."));
      const miningStatus = await getMiningStatus();
      setMining(miningStatus?.mining || null);
    } catch (error) {
      setMessage(error.message || t("No se pudo canjear el punto hash."));
    } finally {
      setWorking(false);
    }
  };

  const canRedeem = !!status?.canRedeem && !working;

  return (
    <div className="page hash-rewards-page">
      <header className="hash-rewards-header">
        <div>
          <span>{t("Premios")}</span>
          <h1>{t("Premios de Hash")}</h1>
          <p>{t("Convierte invitados directos válidos en más poder de minería.")}</p>
        </div>
        <button type="button" onClick={loadData} disabled={loading || working}>
          <FiRefreshCw />
        </button>
      </header>

      {message && <div className="hash-rewards-message">{message}</div>}

      {loading ? (
        <section className="hash-rewards-card hash-rewards-loading">{t("Cargando premios...")}</section>
      ) : (
        <>
          <section className="hash-rewards-card hash-rewards-hero-card">
            <div className="hash-rewards-icon"><FiGift /></div>
            <div>
              <span>{t("Bonus hash actual")}</span>
              <strong data-no-translate="true">+{formatNumber(status?.hashBonusPercent)}%</strong>
              <p>
                {t("Máximo permitido")}: <b data-no-translate="true">+{formatNumber(status?.maxBonusPercent)}%</b>
              </p>
            </div>
          </section>

          <section className="hash-rewards-progress-card">
            <div className="hash-rewards-progress-top">
              <span>{t("Progreso del bonus")}</span>
              <strong data-no-translate="true">{formatNumber(progressPercent)}%</strong>
            </div>
            <div className="hash-rewards-progress-bar">
              <span data-no-translate="true" style={{ width: `${progressPercent}%` }} />
            </div>
            <small>
              {t("Cada punto hash canjeado aumenta")}{" "}
              <b data-no-translate="true">+{formatNumber(status?.pointPercent)}%</b>
            </small>
          </section>

          <section className="hash-rewards-grid">
            <article>
              <FiZap />
              <span>{t("Puntos disponibles")}</span>
              <strong data-no-translate="true">{status?.availablePoints || 0}</strong>
            </article>
            <article>
              <FiAward />
              <span>{t("Puntos canjeados")}</span>
              <strong data-no-translate="true">{status?.redeemedPoints || 0}</strong>
            </article>
            <article>
              <FiUsers />
              <span>{t("Invitados válidos")}</span>
              <strong data-no-translate="true">{status?.validReferrals || 0}</strong>
            </article>
            <article>
              <FiTrendingUp />
              <span>{t("Hash total")}</span>
              <strong data-no-translate="true">+{formatNumber(mining?.dailyPercent || 0)}%</strong>
            </article>
          </section>

          <section className="hash-rewards-card hash-rewards-rules">
            <h2>{t("Cómo funciona")}</h2>
            <p>
              {t("Solo cuentan invitados directos que hayan activado una inversión mínima de")}{" "}
              <b data-no-translate="true">{formatNumber(status?.minValidInvestmentUsdt)} USDT</b>.
            </p>
            <p>
              {t("Cada invitado válido entrega 1 punto hash. Cada punto puede canjearse por")}{" "}
              <b data-no-translate="true">+{formatNumber(status?.pointPercent)}%</b>{" "}
              {t("de bonus de hash.")}
            </p>
            <p>
              {t("El bonus máximo acumulado es")}{" "}
              <b data-no-translate="true">+{formatNumber(status?.maxBonusPercent)}%</b>.
            </p>
          </section>

          <section className="hash-rewards-actions">
            <button type="button" onClick={handleSync} disabled={working}>
              <FiRefreshCw />
              {working ? t("Procesando...") : t("Actualizar puntos")}
            </button>
            <button type="button" onClick={handleRedeem} disabled={!canRedeem}>
              <FiZap />
              {`Canjear +${formatNumber(status?.pointPercent)}% Hash`}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
