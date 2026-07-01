import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiAlertCircle, FiCreditCard, FiUserCheck } from "react-icons/fi";
import api from "../services/api";

function shortAddress(value = "") {
  return value ? `${value.slice(0, 8)}...${value.slice(-6)}` : "";
}

function money(value, decimals = 2) {
  return `${Number(value || 0).toFixed(decimals)} USDT`;
}

function formatOptionAmount(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function Withdraw() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ amount: "", withdrawalAccountId: "", securityPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  const accounts = status?.withdrawalAccounts || [];
  const amountOptions = useMemo(() => {
    const fromApi = status?.withdrawAmountOptions || [];
    const normalized = fromApi
      .map((item) => Number(item.amountUsdt ?? item.amount_usdt ?? item.amount))
      .filter((item) => Number.isFinite(item) && item > 0);
    return normalized.length ? normalized : [10, 30, 80, 200, 500, 1000, 2000, 3000];
  }, [status]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === String(form.withdrawalAccountId)) || null,
    [accounts, form.withdrawalAccountId]
  );

  const feePercent = 10;
  const selectedAmount = Number(form.amount || 0);
  const receiveAmount = selectedAmount > 0 ? Math.max(0, selectedAmount - (selectedAmount * feePercent / 100)) : 0;
  const available = Number(status?.available || 0);

  const load = async () => {
    try {
      const { data } = await api.get("/withdraw/me");
      setStatus(data);
      setForm((prev) => {
        const firstAccount = data.withdrawalAccounts?.[0]?.id ? String(data.withdrawalAccounts[0].id) : "";
        const options = (data.withdrawAmountOptions || [])
          .map((item) => Number(item.amountUsdt ?? item.amount_usdt ?? item.amount))
          .filter((item) => Number.isFinite(item) && item > 0);
        const availableNow = Number(data.available || 0);
        const firstAllowed = options.find((item) => item <= availableNow) || "";
        return {
          ...prev,
          withdrawalAccountId: prev.withdrawalAccountId || firstAccount,
          amount: prev.amount || (firstAllowed ? String(firstAllowed) : ""),
        };
      });
    }
    catch (err) { setError(err.message); }
  };

  useEffect(() => { load(); }, []);

  const chooseAmount = (amount) => {
    if (Number(amount) > available) {
      setToast("Saldo insuficiente");
      return;
    }
    setForm((prev) => ({ ...prev, amount: String(amount) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setToast("Pago en proceso");
    try {
      const { data } = await api.post("/withdraw/request", form);
      setMessage(data.message || "Solicitud registrada correctamente.");
      setForm((prev) => ({ ...prev, amount: "", securityPassword: "" }));
      load();
    } catch (err) {
      setToast("");
      setError(err.message);
      if (err.message?.toLowerCase().includes("datos personales") || err.message?.toLowerCase().includes("cuenta de retiro")) {
        setTimeout(() => navigate("/profile"), 1200);
      }
    }
    finally { setLoading(false); }
  };

  const needsProfile = status && (!status.personalDataComplete || !status.hasWithdrawalAccount);
  const needsValidation = status && status.hasActiveInvestment && status.personalDataComplete && status.hasWithdrawalAccount && !status.groupValidated;
  const canSubmit = !loading && !needsProfile && !needsValidation && form.amount && form.withdrawalAccountId && form.securityPassword;

  return (
    <div className="page-stack withdraw-page-v26">
      {toast && (
        <div className="withdraw-toast-backdrop" role="status" aria-live="polite">
          <div className="withdraw-toast-box"><strong>{toast}</strong></div>
        </div>
      )}

      <section className="withdraw-hero-v26">
        <div>
          <span className="eyebrow">Retiros</span>
          <h2>Retirar USDT</h2>
          <p>Elige un monto, selecciona tu cuenta registrada y confirma la solicitud.</p>
        </div>
        <div className="withdraw-available-v26">
          <span>Disponible</span>
          <strong>{money(available)}</strong>
        </div>
      </section>

      {error && <div className="alert error withdraw-alert-v25">{error}</div>}
      {message && <div className="alert success withdraw-alert-v25">{message}</div>}

      {needsProfile && (
        <section className="withdraw-required-v26 needs-attention-v26">
          <FiCreditCard />
          <div>
            <span className="eyebrow">Requerido</span>
            <h3>Completa datos de retiro</h3>
            <p>Registra tus datos personales y una cuenta de retiro.</p>
          </div>
          <Link className="primary-btn" to="/profile">Completar</Link>
        </section>
      )}

      {needsValidation && (
        <section className="withdraw-required-v26 needs-attention-v26">
          <FiUserCheck />
          <div>
            <span className="eyebrow">Validación</span>
            <h3>Habilitación pendiente</h3>
            <p>Contacta con tu gerente para habilitar tu retiro.</p>
          </div>
          <Link className="secondary-btn" to="/support">Soporte</Link>
        </section>
      )}

      <section className="withdraw-card-v26">
        <form className="withdraw-form-v26" onSubmit={submit}>
          <div className="withdraw-section-head-v26">
            <span className="eyebrow">Monto</span>
            <h3>Selecciona un monto</h3>
          </div>

          <div className="withdraw-amount-grid-v26" role="group" aria-label="Montos de retiro">
            {amountOptions.map((amount) => {
              const active = Number(form.amount) === Number(amount);
              const unavailable = amount > available;
              return (
                <button
                  type="button"
                  key={amount}
                  className={`withdraw-amount-btn-v26 ${active ? "active" : ""} ${unavailable ? "unavailable" : ""}`}
                  onClick={() => chooseAmount(amount)}
                >
                  {formatOptionAmount(amount)}
                </button>
              );
            })}
          </div>

          <div className="withdraw-summary-v26">
            <div>
              <span>Retiro</span>
              <strong>{selectedAmount ? money(selectedAmount) : "—"}</strong>
            </div>
            <div>
              <span>Recibes</span>
              <strong>{selectedAmount ? money(receiveAmount) : "—"}</strong>
            </div>
          </div>

          <label className="field-label-v26">Cuenta de retiro
            <select value={form.withdrawalAccountId} onChange={(e) => setForm({ ...form, withdrawalAccountId: e.target.value })} required>
              <option value="">Selecciona una cuenta</option>
              {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.network} · {shortAddress(acc.withdrawalAddress)}</option>)}
            </select>
          </label>

          {selectedAccount && (
            <div className="selected-withdraw-account-v26">
              <strong>{selectedAccount.network}</strong>
              <span>{shortAddress(selectedAccount.withdrawalAddress)}</span>
            </div>
          )}

          <label className="field-label-v26">Contraseña de cuenta
            <input type="password" value={form.securityPassword} onChange={(e) => setForm({ ...form, securityPassword: e.target.value })} required />
          </label>

          <button className="primary-btn withdraw-submit-btn-v26" disabled={!canSubmit}>{loading ? "PROCESANDO" : "RETIRAR"}</button>
          {needsProfile && <Link className="secondary-btn full withdraw-profile-link-v26" to="/profile">Registrar cuenta de retiro</Link>}
        </form>
      </section>

      <article className="withdraw-policy-v26">
        <span className="eyebrow">Política</span>
        <h3>Reglas de retiro</h3>
        <ul>
          <li>Comisión de retiro 10%.</li>
          <li>Para tu primer retiro contacta con tu gerente.</li>
          <li>No tomamos responsabilidad por envíos a una dirección errónea.</li>
        </ul>
      </article>
    </div>
  );
}
