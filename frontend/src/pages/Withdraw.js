import React, { useEffect, useMemo, useState } from "react";
import { FiLock, FiSave } from "react-icons/fi";
import { SiBinance, SiPolygon, SiTether } from "react-icons/si";
import api from "../services/api";
import withdrawBanner from "../assets/withdraw/withdraw-banner.png";

const FEE_PERCENT = 5;
const MIN_WITHDRAW = 1;

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;

function formatCooldown(ms) {
  const totalSeconds = Math.max(Math.floor(Number(ms || 0) / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const NETWORKS = {
  "BEP20-USDT": {
    label: "BEP20",
    full: "BEP20 USDT",
    icon: SiBinance,
  },
  "POLYGON-USDT": {
    label: "POLYGON",
    full: "POLYGON USDT",
    icon: SiPolygon,
  },
};

function sanitizeAmount(value) {
  const clean = String(value || "").replace(",", ".").replace(/[^\d.]/g, "");
  const parts = clean.split(".");
  const integer = parts[0] || "";
  const decimals = parts[1] ? parts[1].slice(0, 2) : "";
  return parts.length > 1 ? `${integer}.${decimals}` : integer;
}

function shortAddress(value = "") {
  const text = String(value || "");
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-8)}`;
}

export default function Withdraw() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({
    amount: "",
    withdrawalAccountId: "",
    network: "BEP20-USDT",
    withdrawalAddress: "",
    securityPassword: "",
  });
  const [popup, setPopup] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingWallet, setSavingWallet] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);

  const showPopup = (text) => {
    if (!text) return;
    setPopup(text);
    window.clearTimeout(window.__luckyZooWithdrawPopup);
    window.__luckyZooWithdrawPopup = window.setTimeout(() => setPopup(""), 3200);
  };

  const load = async () => {
    try {
      const { data } = await api.get("/withdraw/me");
      setStatus(data);
      setCooldownMs(Number(data.withdrawCooldown?.remainingMs || 0));
      const first = data.withdrawalAccounts?.[0] || null;
      setForm((prev) => ({
        ...prev,
        withdrawalAccountId: first?.id ? String(first.id) : prev.withdrawalAccountId,
        network: first?.network || prev.network || "BEP20-USDT",
        withdrawalAddress: first?.withdrawalAddress || prev.withdrawalAddress || "",
      }));
    } catch (err) {
      showPopup(err?.response?.data?.message || err.message || "No se pudo cargar retiro.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (cooldownMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldownMs((value) => Math.max(Number(value || 0) - 1000, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownMs]);

  const accounts = status?.withdrawalAccounts || [];
  const lockedAccount = accounts[0] || null;
  const available = Number(status?.available || 0);
  const amountNumber = Number(form.amount || 0);
  const feeAmount = amountNumber > 0 ? amountNumber * (FEE_PERCENT / 100) : 0;
  const receiveAmount = amountNumber > 0 ? Math.max(amountNumber - feeAmount, 0) : 0;
  const cooldownActive = cooldownMs > 0;
  const selectedNetwork = NETWORKS[lockedAccount?.network || form.network] || NETWORKS["BEP20-USDT"];
  const SelectedIcon = selectedNetwork.icon;

  const canSubmit = useMemo(() => {
    return !cooldownActive && amountNumber >= MIN_WITHDRAW && amountNumber <= available && form.securityPassword && (lockedAccount || form.withdrawalAddress);
  }, [cooldownActive, amountNumber, available, form.securityPassword, lockedAccount, form.withdrawalAddress]);

  const saveWallet = async () => {
    if (lockedAccount) {
      showPopup("Tu método de retiro ya está bloqueado.");
      return lockedAccount;
    }

    if (!form.withdrawalAddress) {
      showPopup("Ingresa una dirección wallet.");
      return null;
    }

    setSavingWallet(true);
    try {
      const { data } = await api.post("/auth/withdrawal-accounts", {
        network: form.network,
        label: form.network.replace("-USDT", ""),
        withdrawalAddress: form.withdrawalAddress,
        isDefault: true,
      });

      const createdAccount = data.withdrawalAccounts?.[0] || null;
      if (!createdAccount) {
        showPopup("No se pudo guardar la wallet.");
        await load();
        return null;
      }

      setStatus((prev) => ({ ...(prev || {}), withdrawalAccounts: data.withdrawalAccounts || [] }));
      setForm((prev) => ({
        ...prev,
        withdrawalAccountId: String(createdAccount.id),
        network: createdAccount.network,
        withdrawalAddress: createdAccount.withdrawalAddress,
      }));

      showPopup("Wallet guardada correctamente.");
      return createdAccount;
    } catch (err) {
      showPopup(err?.response?.data?.message || err.message || "No se pudo guardar la wallet.");
      return null;
    } finally {
      setSavingWallet(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (cooldownActive) {
        showPopup(`Podrás volver a retirar en ${formatCooldown(cooldownMs)}.`);
        return;
      }

      if (!Number.isFinite(amountNumber) || amountNumber < MIN_WITHDRAW) {
        showPopup(`El mínimo de retiro es ${MIN_WITHDRAW.toFixed(2)} USDT.`);
        return;
      }

      if (amountNumber > available) {
        showPopup("Saldo disponible insuficiente.");
        return;
      }

      let account = lockedAccount;
      if (!account) {
        account = await saveWallet();
        if (!account) return;
      }

      const accountId = account?.id || form.withdrawalAccountId;

      const { data } = await api.post("/withdraw/request", {
        withdrawalAccountId: accountId,
        amount: amountNumber.toFixed(2),
        securityPassword: form.securityPassword,
      });

      showPopup(data.message || "Retiro solicitado correctamente.");
      setCooldownMs(Number(data.withdrawCooldown?.remainingMs || 24 * 60 * 60 * 1000));
      setForm((prev) => ({ ...prev, amount: "", securityPassword: "" }));
      await load();
    } catch (err) {
      showPopup(err?.response?.data?.message || err.message || "No se pudo solicitar el retiro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack withdraw-page withdraw-v43 withdraw-v44 withdraw-v49">
      {popup && <div className="withdraw-v43-popup">{popup}</div>}

      <section className="withdraw-v49-banner">
        <img src={withdrawBanner} alt="Retiro Lucky Zoo" />
      </section>

      <section className="withdraw-v43-balance withdraw-v44-balance">
        <div>
          <span>Saldo disponible</span>
          <strong>{money(available)}</strong>
        </div>
      </section>

      <form className="withdraw-v43-panel withdraw-v44-panel" onSubmit={submit}>
        <section className="withdraw-v43-method">
          <div className="withdraw-v43-section-title">
            <span>Método de retiro</span>
            {lockedAccount ? null : <small>Elige tu red</small>}
          </div>

          <div className="withdraw-v43-network-grid">
            {Object.entries(NETWORKS).map(([code, item]) => {
              const Icon = item.icon;
              const active = (lockedAccount?.network || form.network) === code;
              return (
                <button
                  key={code}
                  type="button"
                  disabled={Boolean(lockedAccount)}
                  className={active ? "active" : ""}
                  onClick={() => setForm((prev) => ({ ...prev, network: code }))}
                >
                  <SiTether />
                  <Icon />
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </div>

          <label className="withdraw-v43-wallet-label">
            Dirección wallet
            <div className="withdraw-v43-wallet-input withdraw-v44-wallet-input">
              <span>
                <SiTether />
                <SelectedIcon />
                {selectedNetwork.label}
              </span>
              {lockedAccount ? (
                <strong>{shortAddress(lockedAccount.withdrawalAddress)}</strong>
              ) : (
                <input
                  value={form.withdrawalAddress}
                  onChange={(e) => setForm((prev) => ({ ...prev, withdrawalAddress: e.target.value.trim() }))}
                  placeholder="0x..."
                  required
                />
              )}
              <button type="button" onClick={saveWallet} disabled={Boolean(lockedAccount) || savingWallet}>
                {lockedAccount ? "Guardado" : savingWallet ? "..." : "Guardar"}
              </button>
            </div>
          </label>
        </section>

        <section className="withdraw-v43-request withdraw-v44-request">
          <label>
            Monto a retirar
            <input
              type="text"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: sanitizeAmount(e.target.value) }))}
              placeholder="0.50"
              required
            />
          </label>

          <div className="withdraw-v44-receive-line">
            <span>Recibirás</span>
            <strong>{money(receiveAmount)}</strong>
          </div>

          <label>
            Contraseña de seguridad
            <input
              type="password"
              value={form.securityPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, securityPassword: e.target.value }))}
              required
            />
          </label>

          <button className="withdraw-v43-submit withdraw-v44-submit" disabled={loading || !canSubmit}>
            {cooldownActive ? `Próximo retiro en ${formatCooldown(cooldownMs)}` : loading ? "Procesando..." : "Retirar"}
          </button>
        </section>
      </form>

      <section className="withdraw-v43-help withdraw-v44-help">
        <h3>Reglas de retiro</h3>
        <p>Mínimo 1.00 USDT. Comisión 5%. La wallet guardada queda fija por seguridad.</p>
      </section>
    </div>
  );
}
