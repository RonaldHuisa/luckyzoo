import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiClock, FiEye, FiEyeOff, FiInfo } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  createWithdrawRequest,
  getWithdrawInfo,
} from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

const PAYMENT_NETWORKS = [
  { code: "BEP20-USDT", label: "BEP20-USDT", chain: "BNB Smart Chain BEP20", icon: "◆" },
  { code: "POLYGON-USDT", label: "POLYGON-USDT", chain: "Polygon", icon: "⬡" },
];

export default function Withdraw() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const toastTimerRef = useRef(null);

  const [selectedNetwork, setSelectedNetwork] = useState("BEP20-USDT");
  const [available, setAvailable] = useState("0");
  const [feePercent, setFeePercent] = useState(8);
  const [minWithdraw, setMinWithdraw] = useState(1);
  const [withdrawalAddress, setWithdrawalAddress] = useState("");
  const [addressLocked, setAddressLocked] = useState(false);
  const [canWithdraw, setCanWithdraw] = useState(true);
  const [withdrawRequirementMessage, setWithdrawRequirementMessage] = useState("");
  const [withdrawalPolicy, setWithdrawalPolicy] = useState(null);

  const [amount, setAmount] = useState("");
  const [securityPassword, setSecurityPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast(message);

    toastTimerRef.current = setTimeout(() => {
      setToast("");
    }, 5000);
  }, []);

  const loadWithdrawInfo = useCallback(async () => {
    try {
      setLoading(true);

      const data = await getWithdrawInfo(selectedNetwork);

      setAvailable(data.available || "0");
      setFeePercent(Number(data.feePercent || 8));
      setMinWithdraw(Number(data.minWithdraw || 1));
      setWithdrawalAddress(data.withdrawalAddress || "");
      setAddressLocked(Boolean(data.addressLocked));
      setCanWithdraw(data.canWithdraw !== false);
      setWithdrawRequirementMessage(data.withdrawRequirementMessage || "");
      setWithdrawalPolicy(data.withdrawalPolicy || null);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedNetwork, showToast]);

  useEffect(() => {
    loadWithdrawInfo();

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [loadWithdrawInfo]);

  const amountNumber = Number(amount || 0);
  const feeAmount = amountNumber * (feePercent / 100);
  const realArrivalBeforePolicy = amountNumber > 0 ? amountNumber - feeAmount : 0;
  const policyApplies = Boolean(
    withdrawalPolicy?.applies ||
      (
        withdrawalPolicy?.isVipEligibleForPolicy &&
        !withdrawalPolicy?.hasEnoughActiveInvites &&
        Number(withdrawalPolicy?.totalVipInvested || 0) > 0 &&
        Number(withdrawalPolicy?.totalRequestedBefore || 0) + amountNumber >=
          Number(withdrawalPolicy?.recoveredLimitAmount || 0)
      )
  );
  const policyReductionPercent = Number(withdrawalPolicy?.reductionPercent || 0);
  const policyReductionAmount = policyApplies
    ? realArrivalBeforePolicy * (policyReductionPercent / 100)
    : 0;
  const realArrival = Math.max(realArrivalBeforePolicy - policyReductionAmount, 0);

  const handleAll = () => {
    setAmount(Number(available || 0).toString());
  };

  const handleConfirm = async () => {
    if (!canWithdraw) {
      showToast(t("Debes tener un VIP activo para solicitar retiros."));
      return;
    }

    try {
      setSending(true);

      const data = await createWithdrawRequest({
        network: selectedNetwork,
        withdrawalAddress,
        amount,
        securityPassword,
      });

      showToast(t("Solicitud de retiro creada"));

      setAvailable(data.currentWithdrawable || "0");
      setWithdrawalAddress(data.withdrawalAddress || withdrawalAddress);
      setAddressLocked(true);
      setAmount("");
      setSecurityPassword("");
      setWithdrawalPolicy(data.withdrawalPolicy || withdrawalPolicy);
    } catch (error) {
      showToast(error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page withdraw-page withdraw-compact-page">
      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <div className="recharge-header withdraw-compact-header">
        <button className="icon-btn" onClick={() => navigate("/home")}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">{selectedNetwork}</div>
          <h2>{t("Retirar")}</h2>
        </div>

        <button
          className="icon-btn ghost-icon"
          type="button"
          onClick={() => navigate("/transactions")}
        >
          <FiClock />
        </button>
      </div>

      <div className="withdraw-balance-card withdraw-balance-compact">
        <p>{t("Disponible para retirar")}</p>
        <div className="withdraw-balance-inline">
          <strong>{Number(available || 0).toFixed(6)}</strong>
          <span>USDT</span>
        </div>
      </div>

      {!canWithdraw && (
        <div className="withdraw-vip-required-note">
          <FiInfo />
          <span>
            {t(withdrawRequirementMessage || "Debes tener un VIP activo para solicitar retiros.")}
          </span>
        </div>
      )}

      {canWithdraw && policyApplies && (
        <div className="withdraw-policy-note danger">
          <FiInfo />
          <span>
            {t("Actualmente este retiro tiene una reducción del 75% porque superaste el porcentaje de recuperación permitido sin completar la meta de comunidad. Invita 5 personas activas más y se quitará esta restricción. Podrás retirar el 100% con normalidad.")}

          </span>
        </div>
      )}

      <div className="panel withdraw-panel withdraw-network-panel">
        <div className="withdraw-row-title">
          <h3>{t("Red principal")}</h3>
        </div>

        <div className="withdraw-network-list multi-network-list">
          {PAYMENT_NETWORKS.map((network) => (
            <button
              key={network.code}
              className={`withdraw-network ${selectedNetwork === network.code ? "active" : ""}`}
              type="button"
              onClick={() => {
                setSelectedNetwork(network.code);
                setWithdrawalAddress("");
                setAddressLocked(false);
              }}
            >
              <span className="bnb-mini-icon">{network.icon}</span>
              {network.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel withdraw-panel">
        <h3>{t("Dirección de retiro")}</h3>

        <input
          className="withdraw-input"
          value={withdrawalAddress}
          onChange={(e) => setWithdrawalAddress(e.target.value)}
          placeholder={`${t("Ingrese dirección")} ${selectedNetwork}`}
          disabled={addressLocked || !canWithdraw}
        />

        {addressLocked && (
          <p className="withdraw-help">
            {t("Dirección fijada. Después del primer retiro ya no puede cambiarse.")}
          </p>
        )}
      </div>

      <div className="panel withdraw-panel">
        <h3>{t("Monto de retiro")}</h3>

        <div className="withdraw-amount-box">
          <input
            className="withdraw-input amount-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("Ingresa el monto")}
            type="number"
            min="0"
            step="0.000001"
            disabled={!canWithdraw}
          />

          <button type="button" onClick={handleAll} disabled={!canWithdraw}>
            {t("Todo")}
          </button>
        </div>

        <p className="withdraw-help withdraw-amount-note">
          {t("Mínimo")} <strong>{minWithdraw.toFixed(2)} USDT</strong> · {t("Comisión retiro")}{" "}
          <strong>{feePercent}%</strong>
        </p>
      </div>

      <div className="panel withdraw-panel">
        <h3>{t("Contraseña de seguridad")}</h3>

        <div className="password-field">
          <input
            className="withdraw-input"
            value={securityPassword}
            onChange={(e) => setSecurityPassword(e.target.value)}
            placeholder={t("Contraseña de seguridad")}
            type={showPassword ? "text" : "password"}
            disabled={!canWithdraw}
          />

          <button
            className="eye-btn"
            type="button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
      </div>

      <div className="withdraw-real-row withdraw-real-compact">
        <span>{policyApplies ? t("Llegada real con reducción") : t("Llegada real")}</span>
        <strong>{realArrival.toFixed(6)} USDT</strong>
      </div>

      {policyApplies && amountNumber > 0 && (
        <div className="withdraw-policy-breakdown">
          <span>
            {t("Reducción por meta de invitados")}:{" "}
            <strong>-{policyReductionAmount.toFixed(6)} USDT</strong>
          </span>
        </div>
      )}

      <div className="withdraw-small-note">
        <FiInfo />
        {t("Solo puedes solicitar 1 retiro cada 24 horas.")}
      </div>

      <button
        className="primary-btn recharge-main-btn withdraw-confirm-compact"
        type="button"
        onClick={handleConfirm}
        disabled={loading || sending || !canWithdraw}
      >
        {!canWithdraw ? t("VIP requerido") : sending ? t("Procesando...") : t("Confirmar retiro")}
      </button>

      <div className="withdraw-mini-reminder">
        <strong>{t("Recordatorio:")}</strong> {t("Solo se pueden retirar las ganancias disponibles;")}{" "}
        {t("el saldo de recarga/VIP no se considera retirable.")} {t("Verifica que tu dirección pertenezca a la red seleccionada.")}
      </div>
    </div>
  );
}
