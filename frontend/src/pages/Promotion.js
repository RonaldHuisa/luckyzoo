import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiChevronRight, FiCopy, FiLink, FiUsers } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getPromotionDashboard } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function numberValue(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getReferralCode(data) {
  if (data?.referralCode) return String(data.referralCode);
  if (data?.user?.referral_code) return String(data.user.referral_code);
  if (data?.user?.referralCode) return String(data.user.referralCode);

  const link = String(data?.referralLink || "");
  const match = link.match(/[?&]ref=([^&]+)/i) || link.match(/[?&]invite_code=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}


function getLevelCommission(level) {
  const numericLevel = Number(level || 0);
  if (numericLevel === 1) return { label: "Comisión directa", value: "8%" };
  if (numericLevel === 2 || numericLevel === 3) return { label: "Comisión indirecta", value: "+1%" };
  return { label: "Comisión", value: "—" };
}

export default function Promotion() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const dashboardResult = await getPromotionDashboard();
      setData(dashboardResult || {});
    } catch (error) {
      showToast(error.message || t("No se pudo cargar el equipo."));
      setData({});
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
    const handleFocus = () => loadData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadData]);

  const referralCode = useMemo(() => getReferralCode(data), [data]);
  const referralLink = useMemo(() => {
    if (data?.referralLink) return data.referralLink;
    return `${window.location.origin}/register?ref=${referralCode || ""}`;
  }, [data?.referralLink, referralCode]);

  const copyText = async (value, successMessage) => {
    if (!value) {
      showToast(t("No hay información para copiar."));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch (error) {
      showToast(t("No se pudo copiar."));
    }
  };

  const levels = data?.levels || [];
  const totalMembers = numberValue(data?.totalMembers);
  const totalIncome = numberValue(data?.totalIncome);
  const totalTeamRecharge = numberValue(data?.totalTeamRecharge);
  const totalTeamWithdrawals = numberValue(
    data?.totalTeamWithdrawals || data?.teamWithdrawals || data?.withdrawalsTotal || 0
  );

  return (
    <div className="page promotion-page team-garden-page team-garden-page-v5">
      {loading && (
        <div className="garden-loading-overlay app-loading-overlay">
          <div className="garden-loading-popup app-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>{t("Cargando...")}</strong>
          </div>
        </div>
      )}
      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <section className="garden-invite-hero v5">
        <div className="garden-hero-icon v5">
          <img src="/team-icons/invite-user.png" alt="Invitar" />
        </div>
        <div className="garden-hero-text v5">
          <span>{t("Equipo GreenVest")}</span>
          <h2>{t("Invita y gana")}</h2>
          <p>{t("Comparte tu enlace y aumenta tus comisiones")}</p>
        </div>
      </section>

      <section className="garden-share-panel v5">
        <div className="garden-share-row v5">
          <div className="garden-mini-card code-card">
            <small>{t("Código de invitación")}</small>
            <strong data-no-translate="true">{referralCode || "-"}</strong>
          </div>
          <button
            type="button"
            className="garden-icon-copy-btn"
            onClick={() => copyText(referralCode, t("Copiado con éxito"))}
            aria-label={t("Copiar código")}
            title={t("Copiar código")}
          >
            <FiCopy />
          </button>
        </div>

        <div className="garden-link-card v5">
          <div className="garden-link-top v5">
            <span className="garden-link-icon"><FiLink /></span>
            <div className="garden-link-copy">
              <small>{t("Enlace de invitación")}</small>
              <p data-no-translate="true">{referralLink || "-"}</p>
            </div>
            <button
              type="button"
              className="garden-icon-copy-btn"
              onClick={() => copyText(referralLink, t("Copiado con éxito"))}
              aria-label={t("Copiar enlace")}
              title={t("Copiar enlace")}
            >
              <FiCopy />
            </button>
          </div>
        </div>
      </section>

      <section className="garden-main-stats">
        <article className="garden-main-stat-card">
          <img src="/team-icons/invite-user.png" alt="Equipo" />
          <div>
            <span>{t("Tamaño del equipo")}</span>
            <strong data-no-translate="true">{totalMembers}</strong>
          </div>
        </article>

        <article className="garden-main-stat-card commission">
          <img src="/team-icons/growth-money.png" alt="Comisiones" />
          <div>
            <span>{t("Comisiones ganadas")}</span>
            <strong data-no-translate="true">${money(totalIncome)}</strong>
          </div>
        </article>
      </section>

      <section className="garden-levels v5">
        <div className="garden-section-title v5">
          <h3>{t("Niveles del equipo")}</h3>
          <span>{t("Activos / total por nivel")}</span>
        </div>

        {levels.map((level) => {
          const total = numberValue(level.totalMembers);
          const active = numberValue(level.activeMembers);
          const commissionInfo = getLevelCommission(level.level);
          return (
            <button
              type="button"
              className="garden-level-card v5"
              key={level.level}
              onClick={() => navigate(`/members/${level.level}`)}
            >
              <div className="garden-level-left v5">
                <strong>{`${t("Nivel")} ${level.level}`}</strong>
                <span>{t("Activos / Total")}</span>
                <small className="garden-level-commission">
                  {commissionInfo.label}: <b data-no-translate="true">{commissionInfo.value}</b>
                </small>
              </div>
              <b data-no-translate="true">{active}/{total}</b>
              <em>{t("Detalles")} <FiChevronRight /></em>
            </button>
          );
        })}

        {!loading && levels.length === 0 && (
          <div className="garden-empty">
            <FiUsers />
            <span>{t("Aún no tienes equipo registrado.")}</span>
          </div>
        )}
      </section>

<section className="garden-commission-rule garden-commission-rule-bottom">
  <div className="garden-commission-badge">
    <img src="/team-icons/growth-money.png" alt="Comisión" />
    <div>
      <span>{t("Comisión directa")}</span>
      <strong>8%</strong>
    </div>
  </div>

  <div className="garden-commission-copy">
    <h3>{t("¿Cómo se calcula tu comisión?")}</h3>
    <p>{t("Comisión directa: recibes 8% según el nivel de planta que tengas comprado. Si tu invitado compra una planta más alta que la tuya, la comisión se calcula solo hasta tu nivel actual.")}</p>
    <p>{t("Ejemplo: si tienes Nivel 1 y tu invitado compra Nivel 2, recibes 8% del valor del Nivel 1. Si también tienes Nivel 2, recibes 8% del valor del Nivel 2.")}</p>
    <p className="garden-commission-note">{t("Comisión indirecta: aplica en Nivel 2 y Nivel 3. Obtienes 1% adicional de ganancia por cada nivel indirecto válido.")}</p>
  </div>
</section>
    </div>
  );
}
