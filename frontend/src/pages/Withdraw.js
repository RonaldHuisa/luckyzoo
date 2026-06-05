import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiClock, FiCopy, FiEye, FiEyeOff, FiInfo } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  createWithdrawRequest,
  getWithdrawInfo,
} from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

const PAYMENT_NETWORKS = [
  {
    code: "BEP20-USDT",
    label: "BEP20-USDT",
    short: "BEP20",
    icon: "/images/networks/bep20-usdt.webp",
  },
  {
    code: "POLYGON-USDT",
    label: "POLYGON-USDT",
    short: "POLYGON",
    icon: "/images/networks/polygon-usdt.webp",
  },
];

const WITHDRAW_WINDOW = {
  startHourUtc: 16,
  endHourUtc: 20,
  allowedDaysUtc: [1, 2, 3, 4, 5], // lunes a viernes
};

function getWithdrawSchedule(now = new Date()) {
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const second = now.getUTCSeconds();
  const day = now.getUTCDay();
  const isAllowedDay = WITHDRAW_WINDOW.allowedDaysUtc.includes(day);
  const isOpen =
    isAllowedDay &&
    hour >= WITHDRAW_WINDOW.startHourUtc &&
    hour < WITHDRAW_WINDOW.endHourUtc;

  const utcTime = now.toLocaleTimeString("es-ES", {
    timeZone: "UTC",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return {
    isOpen,
    isAllowedDay,
    utcTime,
    currentHour: hour,
    currentMinute: minute,
    currentSecond: second,
    label: "16:00 - 20:00 UTC",
    daysLabel: "Lunes a viernes",
  };
}

function formatAmount(value, decimals = 6) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(decimals) : (0).toFixed(decimals);
}

export default function Withdraw() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const toastTimerRef = useRef(null);

  const [selectedNetwork, setSelectedNetwork] = useState("BEP20-USDT");
  const [available, setAvailable] = useState("0");
  const [feePercent, setFeePercent] = useState(8);
  const [minWithdraw, setMinWithdraw] = useState(5);
  const [withdrawalAddress, setWithdrawalAddress] = useState("");
  const [addressLocked, setAddressLocked] = useState(false);
  const [canWithdraw, setCanWithdraw] = useState(true);
  const [withdrawRequirementMessage, setWithdrawRequirementMessage] = useState("");
  const [withdrawalDayPolicy, setWithdrawalDayPolicy] = useState(null);
  const [withdrawalPolicy, setWithdrawalPolicy] = useState(null);

  const [amount, setAmount] = useState("");
  const [securityPassword, setSecurityPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());

  const withdrawSchedule = getWithdrawSchedule(new Date(now));
  const isWithdrawWindowOpen = withdrawSchedule.isOpen;

  const activeNetwork = PAYMENT_NETWORKS.find((item) => item.code === selectedNetwork) || PAYMENT_NETWORKS[0];

  const availableNumber = Number(available || 0);

  const handleAmountChange = (value) => {
    const cleanValue = String(value || '').replace(/,/g, '.');

    if (cleanValue === '') {
      setAmount('');
      return;
    }

    if (!/^\d*\.?\d*$/.test(cleanValue)) return;

    const parsed = Number(cleanValue);
    if (!Number.isFinite(parsed)) return;

    const clamped = Math.min(parsed, availableNumber);
    setAmount(cleanValue.endsWith('.') ? cleanValue : String(clamped));
  };


  const showToast = useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

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
      setMinWithdraw(Math.max(Number(data.minWithdraw || 0), 5));
      setWithdrawalAddress(data.withdrawalAddress || "");
      setAddressLocked(Boolean(data.addressLocked));
      setCanWithdraw(data.canWithdraw !== false);
      setWithdrawRequirementMessage(data.withdrawRequirementMessage || "");
      setWithdrawalDayPolicy(data.withdrawalDayPolicy || null);
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
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [loadWithdrawInfo]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

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
    if (!availableNumber || availableNumber <= 0) {
      setAmount('');
      return;
    }

    setAmount(formatAmount(availableNumber, 6));
  };

  const handleConfirm = async () => {
    if (!canWithdraw) {
      showToast(t(withdrawRequirementMessage || "Retiro temporalmente no disponible."));
      return;
    }

    if (!isWithdrawWindowOpen) {
      showToast(t("Los retiros están disponibles de lunes a viernes, solo de 16:00 a 20:00 UTC."));
      return;
    }

    if (!withdrawalAddress.trim()) {
      showToast(t("Ingresa una dirección de retiro válida."));
      return;
    }

    if (!amount || amountNumber <= 0) {
      showToast(t("Ingresa un monto válido para retirar."));
      return;
    }

    if (amountNumber < minWithdraw) {
      showToast(t(`El retiro mínimo es ${Number(minWithdraw || 5).toFixed(2)} USDT.`));
      return;
    }

    if (amountNumber > availableNumber) {
      showToast(t("No puedes retirar un monto mayor al saldo disponible."));
      return;
    }

    if (!securityPassword.trim()) {
      showToast(t("Ingresa tu contraseña de cuenta."));
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

      showToast(data.message || t("Solicitud de retiro creada"));

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
    <div className="page withdraw-exact-page">
      {loading && (
        <div className="garden-loading-overlay app-loading-overlay">
          <div className="garden-loading-popup app-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>{t("Cargando...")}</strong>
          </div>
        </div>
      )}
      {toast && (
        <div className="center-simple-toast center-simple-toast-info">
          <span>{toast}</span>
        </div>
      )}

      <div className="withdraw-exact-topbar">
        <button className="withdraw-exact-back" onClick={() => navigate("/home")}>
          <FiArrowLeft />
        </button>
        <h2>{t("Retirar")}</h2>
        <button
          className="withdraw-exact-history"
          type="button"
          onClick={() => navigate("/transactions")}
        >
          <FiClock />
        </button>
      </div>

      <section className="withdraw-exact-balance">
        <p>{t("Disponible para retirar")}</p>
        <strong data-no-translate="true">{formatAmount(available, 6)}</strong>
      </section>

      <section className={`withdraw-schedule-card ${isWithdrawWindowOpen ? "open" : "closed"}`}>
        <span>{t("Horario de retiro")}</span>
        <strong data-no-translate="true">Lun - Vie · 16:00 - 20:00 UTC</strong>
        <small data-no-translate="true">{t("Hora actual")}: {withdrawSchedule.utcTime} UTC</small>
      </section>

      {canWithdraw && policyApplies && (
        <div className="withdraw-exact-note danger">
          <FiInfo />
          <span>
            {t("Actualmente este retiro tiene una reducción del 75% porque superaste el porcentaje de recuperación permitido sin completar la meta de comunidad.")}
          </span>
        </div>
      )}

      <section className="withdraw-exact-card">
        <h3>{t("Selecciona la red")}</h3>

        <div className="withdraw-exact-networks">
          {PAYMENT_NETWORKS.map((network) => (
            <button
              key={network.code}
              className={`withdraw-exact-network ${selectedNetwork === network.code ? "active" : ""}`}
              type="button"
              onClick={() => {
                setSelectedNetwork(network.code);
                setWithdrawalAddress("");
                setAddressLocked(false);
              }}
            >
              <img src={network.icon} alt={network.label} />
              <span>{network.label}</span>
            </button>
          ))}
        </div>

        <h3>{t("Dirección de retiro")}</h3>
        <input
          className="withdraw-exact-input"
          value={withdrawalAddress}
          onChange={(e) => setWithdrawalAddress(e.target.value)}
          placeholder={t("Ingresa la dirección de destino")}
          disabled={addressLocked || !canWithdraw}
        />

        {addressLocked && (
          <p className="withdraw-exact-help">
            {t("Dirección fijada para esta red. Puedes usar otra dirección en otra red disponible.")}
          </p>
        )}

        <h3>{t("Monto a retirar")}</h3>
        <div className="withdraw-exact-amount">
          <input
            className="withdraw-exact-input"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={t("Cantidad")}
            type="number"
            min="0"
            step="0.000001"
            disabled={!canWithdraw}
          />
          <button type="button" onClick={handleAll} disabled={!canWithdraw}>
            {t("Todo")}
          </button>
        </div>

        <p className="withdraw-exact-limits">
          {t("Monto mínimo")}: <b>{Number(minWithdraw || 5).toFixed(2)} USDT</b>
        </p>

        <h3>{t("Contraseña de cuenta")}</h3>
        <div className="withdraw-exact-password">
          <input
            className="withdraw-exact-input"
            value={securityPassword}
            onChange={(e) => setSecurityPassword(e.target.value)}
            placeholder={t("Contraseña de cuenta")}
            type={showPassword ? "text" : "password"}
            disabled={!canWithdraw}
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>

        <div className="withdraw-exact-arrival">
          <span>{t("Recibirás")}:</span>
          <strong data-no-translate="true">{formatAmount(realArrival, 6)} USDT</strong>
        </div>

        {policyApplies && amountNumber > 0 && (
          <div className="withdraw-exact-policy">
            {t("Reducción por meta de invitados")}: <b>-{formatAmount(policyReductionAmount, 6)} USDT</b>
          </div>
        )}

        <button
          className="withdraw-exact-confirm"
          type="button"
          onClick={handleConfirm}
          disabled={loading || sending || !canWithdraw || !isWithdrawWindowOpen}
        >
          {!canWithdraw || !isWithdrawWindowOpen ? t("No disponible") : sending ? t("Procesando...") : t("RETIRAR")}
        </button>

      </section>

      <section className="withdraw-clean-note">
        <div>
          <FiInfo />
          <b>{t("Nota")}</b>
        </div>
        <p>1. {t("Retiro mínimo: 5 USDT.")}</p>
        <p>2. {t("Horario disponible: lunes a viernes, de 16:00 a 20:00 UTC.")}</p>
        <p>3. {t("Fuera del horario permitido, el botón de retiro permanecerá deshabilitado.")}</p>
        <p>4. {t("Verifica que la dirección pertenezca exactamente a la red seleccionada antes de confirmar.")}</p>
      </section>
    </div>
  );
}
