import React, { useCallback, useEffect, useState } from "react";
import {
  FiAward,
  FiCheckCircle,
  FiChevronRight,
  FiCopy,
  FiGift,
  FiLink,
  FiLock,
  FiSearch,
  FiUsers,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getPromotionDashboard, getReferralRewardsStatus, claimReferralReward } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function money(value) {
  return Number(value || 0).toFixed(2);
}

function getRewardStatusIcon(status) {
  if (status === "claimed" || status === "paid") return <FiCheckCircle />;
  if (status === "available") return <FiGift />;
  return <FiLock />;
}

export default function Promotion() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [data, setData] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [claimingTier, setClaimingTier] = useState(null);
  const [toast, setToast] = useState("");

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  };

  const loadData = useCallback(async () => {
    try {
      const [dashboardResult, rewardsResult] = await Promise.all([
        getPromotionDashboard(),
        getReferralRewardsStatus(),
      ]);

      setData(dashboardResult);
      setRewards(rewardsResult);
    } catch (error) {
      showToast(error.message);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleFocus = () => {
      loadData();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadData]);

  if (!data) {
    return (
      <div className="page promotion-page">
        <div className="panel">{t("Cargando promoción...")}</div>
      </div>
    );
  }

  const copyLink = async () => {
    if (!data?.referralLink) {
      showToast("No hay enlace para copiar");
      return;
    }

    try {
      await navigator.clipboard.writeText(data.referralLink);
      showToast(t("Enlace copiado."));
    } catch (error) {
      showToast(t("No se pudo copiar el enlace."));
    }
  };

  const handleClaimReward = async (tierId) => {
    try {
      setClaimingTier(tierId);

      const result = await claimReferralReward(tierId);

      showToast(result.message || t("Premio reclamado correctamente."));

      const rewardsResult = await getReferralRewardsStatus();
      setRewards(rewardsResult);
    } catch (error) {
      showToast(error.message || t("No se pudo reclamar el premio."));
    } finally {
      setClaimingTier(null);
    }
  };

  return (
    <div className="page promotion-page promotion-page-v2">
      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <div className="promotion-header">
        <div>
          <div className="eyebrow">{t("Red de referidos")}</div>
          <h2>{t("Promoción")}</h2>
        </div>

      </div>

      <div className="promotion-stats-row promo-income-row">
        <div className="promotion-stat-card promo-income-card">
          <p>{t("Ingresos totales")}</p>
          <strong>{money(data.totalIncome)} USDT</strong>
        </div>

        <div className="promotion-stat-card promo-income-card">
          <p>{t("Ingresos de hoy")}</p>
          <strong>{money(data.todayIncome)} USDT</strong>
        </div>
      </div>

      <div className="panel invite-mini-panel promotion-invite-panel">
        <div className="panel-title-row promo-link-title">
          <div className="promo-title-inline">
            <h3>{t("Enlace de invitación")}</h3>
            <span className="icon-badge sm tone-mint">
              <FiLink />
            </span>
          </div>
        </div>

        <div className="invite-link-row">
          <span>{data.referralLink}</span>

          <button type="button" onClick={copyLink} aria-label={t("Copiar enlace")}>
            <FiCopy />
          </button>
        </div>
      </div>

      <div className="panel promotion-summary-panel compact-summary-panel">
        <div className="promotion-mini-title">
          <span className="icon-badge sm tone-lavender promo-summary-icon">
            <FiUsers />
          </span>
          <div>
            <strong>{t("Resumen del equipo")}</strong>
            <span>{t("Datos generales de tu red")}</span>
          </div>
        </div>

        <div className="promo-summary-grid three">
          <div className="mini-metric-card">
            <strong>{data.totalMembers}</strong>
            <span>{t("Miembros")}</span>
          </div>

          <div className="mini-metric-card">
            <strong>{money(data.totalTeamRecharge)}</strong>
            <span>{t("Recarga")}</span>
          </div>

          <div className="mini-metric-card accent">
            <strong>{data.todayAdded}</strong>
            <span>{t("Hoy")}</span>
          </div>
        </div>
      </div>

      <div className="panel promotion-levels-panel promo-levels-compact">
        {data.levels.map((level) => (
          <div className="promotion-level-block" key={level.level}>
            <div className="level-title-row">
              <div className="level-title-left">
                <span className="icon-badge sm tone-blue">
                  <FiUsers />
                </span>
                <div>
                  <h3 className="level-team-pill">{t(`Equipo Nivel ${level.level}`)}</h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/members/${level.level}`)}
              >
                <FiSearch />
                <span>{t("Miembros")}</span>
                <FiChevronRight />
              </button>
            </div>

            <div className="level-grid level-grid-compact">
              <div>
                <strong>{level.totalMembers}</strong>
                <span>{t("Total")}</span>
              </div>

              <div>
                <strong>{level.activeMembers}</strong>
                <span>{t("Activos")}</span>
              </div>

              <div>
                <strong>{money(level.teamRecharge)}</strong>
                <span>{t("Recarga")}</span>
              </div>

              <div>
                <strong>{money(level.totalCommission)}</strong>
                <span>{t("Comisión")}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rewards && (
        <section className="promotion-reward-section">
          <div className="promotion-reward-banner">
            <div className="promotion-reward-banner-icon">
              <FiAward />
            </div>

            <div className="promotion-reward-banner-copy">
              <span>{t("Premios por invitar")}</span>
              <strong>{t("Invita usuarios activos y desbloquea bonos extra.")}</strong>
            </div>

            <div className="promotion-reward-banner-badge">
              {rewards.directInvites}/{rewards.progressTarget}
            </div>
          </div>

          <div className="panel promotion-reward-progress-card">
            <div className="promotion-reward-progress-head">
              <div>
                <span>{t("Invitados válidos")}</span>
                <strong>{rewards.directInvites}</strong>
              </div>

              <div>
                <span>{t("Próximo premio")}</span>
                <strong>
                  {rewards.nextTier
                    ? `${money(rewards.nextTier.rewardUsdt)} USDT`
                    : t("Completado")}
                </strong>
              </div>
            </div>

            <div className="promotion-reward-progress-bar">
              <span style={{ width: `${rewards.progressPercent}%` }} />
            </div>

            <p>
              {rewards.nextTier
                ? `${rewards.directInvites}/${rewards.nextTier.requiredInvites} ${t("invitados con VIP para desbloquear")}`
                : t("Todos los premios disponibles fueron alcanzados.")}
            </p>

            <div className="promotion-reward-tier-list">
              {rewards.tiers.map((tier) => (
                <div
                  className={`promotion-reward-tier ${tier.status}`}
                  key={tier.id}
                >
                  <span className="promotion-reward-tier-icon">
                    {getRewardStatusIcon(tier.status)}
                  </span>

                  <div className="promotion-reward-tier-info">
                    <strong>
                      {tier.requiredInvites} {t("invitados")}
                    </strong>
                    <small>{money(tier.rewardUsdt)} USDT</small>
                  </div>

                  {tier.status === "available" ? (
                    <button
                      type="button"
                      onClick={() => handleClaimReward(tier.id)}
                      disabled={claimingTier === tier.id}
                    >
                      {claimingTier === tier.id ? t("Procesando...") : t("Reclamar")}
                    </button>
                  ) : (
                    <em>
                      {tier.status === "claimed" || tier.status === "paid"
                        ? t("Reclamado")
                        : t("Bloqueado")}
                    </em>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
