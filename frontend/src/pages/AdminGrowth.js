import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiRefreshCw,
  FiSearch,
  FiUsers,
  FiDollarSign,
  FiCreditCard,
  FiZap,
  FiPlusCircle,
  FiTrendingUp,
  FiUserCheck,
} from "react-icons/fi";
import {
  addAdminManualInvestment,
  addAdminManualWithdrawable,
  addAdminManualMiningPower,
  getAdminGrowthPromoters,
  getAdminGrowthUser,
} from "../services/authService";

function money(value, decimals = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function percent(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function parseAdminAmount(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function LevelMetric({ title, count, invested, validCount, validTotal }) {
  return (
    <div className="admin-growth-level-box">
      <span>{title}</span>
      <strong>{number(count)} miembros</strong>
      <small>{number(validCount)} válidos 10+ USDT</small>
      <b>{money(invested)} USDT</b>
      <em>Válido: {money(validTotal)} USDT</em>
    </div>
  );
}

export default function AdminGrowth() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [promoters, setPromoters] = useState([]);
  const [loadingPromoters, setLoadingPromoters] = useState(true);
  const [toast, setToast] = useState("");

  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualWithdrawable, setManualWithdrawable] = useState("");
  const [manualPower, setManualPower] = useState("0.05");
  const [manualNote, setManualNote] = useState("");
  const [processing, setProcessing] = useState("");

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 5200);
  }, []);

  const loadPromoters = useCallback(async (value = search) => {
    try {
      setLoadingPromoters(true);
      const data = await getAdminGrowthPromoters(value.trim());
      setPromoters(data.promoters || []);
    } catch (error) {
      showToast(error.message || "No se pudo cargar el ranking.");
    } finally {
      setLoadingPromoters(false);
    }
  }, [search, showToast]);

  useEffect(() => {
    loadPromoters("");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    return promoters.reduce((acc, item) => {
      acc.promoters += 1;
      acc.directInvested += Number(item.level1_invested_count || 0);
      acc.directMoney += Number(item.level1_invested_total || 0);
      acc.valid10 += Number(item.level1_valid_10_count || 0);
      return acc;
    }, { promoters: 0, directInvested: 0, directMoney: 0, valid10: 0 });
  }, [promoters]);

  const searchUser = async (emailValue = lookupEmail) => {
    const email = String(emailValue || "").trim();
    if (!email) {
      showToast("Ingresa un correo para buscar.");
      return;
    }

    try {
      setLookupLoading(true);
      const data = await getAdminGrowthUser(email);
      setSelected(data);
      setLookupEmail(data.user?.email || email);
    } catch (error) {
      setSelected(null);
      showToast(error.message || "Usuario no encontrado.");
    } finally {
      setLookupLoading(false);
    }
  };

  const openUserFromPromoter = (email) => {
    setLookupEmail(email);
    searchUser(email);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleManualInvestment = async () => {
    if (!selected?.user?.email) return showToast("Busca un usuario primero.");
    const amount = parseAdminAmount(manualAmount);
    if (!Number.isFinite(amount) || amount <= 0) return showToast("Ingresa un monto válido.");

    const ok = window.confirm(`¿Agregar ${amount} USDT de inversión a ${selected.user.email}?`);
    if (!ok) return;

    try {
      setProcessing("investment");
      const data = await addAdminManualInvestment({
        email: selected.user.email,
        amount,
        note: manualNote,
      });
      showToast(data.message || "Inversión agregada correctamente.");
      setManualAmount("");
      await searchUser(selected.user.email);
      await loadPromoters(search);
    } catch (error) {
      showToast(error.message || "No se pudo agregar inversión.");
    } finally {
      setProcessing("");
    }
  };

  const handleManualWithdrawable = async () => {
    if (!selected?.user?.email) return showToast("Busca un usuario primero.");
    const amount = parseAdminAmount(manualWithdrawable);
    if (!Number.isFinite(amount) || amount <= 0) return showToast("Ingresa un monto retirable válido.");

    const ok = window.confirm(`¿Agregar ${amount} USDT al saldo retirable de ${selected.user.email}?`);
    if (!ok) return;

    try {
      setProcessing("withdrawable");
      const data = await addAdminManualWithdrawable({
        email: selected.user.email,
        amount,
        note: manualNote,
      });
      showToast(data.message || "Saldo retirable agregado correctamente.");
      setManualWithdrawable("");
      await searchUser(selected.user.email);
      await loadPromoters(search);
    } catch (error) {
      const message = error.message || "";
      showToast(
        message.includes("Error en la petición")
          ? "No se pudo agregar retirable. Verifica que el backend esté desplegado con la versión nueva."
          : message || "No se pudo agregar saldo retirable."
      );
    } finally {
      setProcessing("");
    }
  };

  const handleManualPower = async () => {
    if (!selected?.user?.email) return showToast("Busca un usuario primero.");
    const value = parseAdminAmount(manualPower);
    if (!Number.isFinite(value) || value <= 0) return showToast("Ingresa un porcentaje válido.");

    const ok = window.confirm(`¿Agregar +${value}% de potencia minera a ${selected.user.email}?`);
    if (!ok) return;

    try {
      setProcessing("power");
      const data = await addAdminManualMiningPower({
        email: selected.user.email,
        percent: value,
        note: manualNote,
      });
      showToast(data.message || "Potencia minera agregada correctamente.");
      await searchUser(selected.user.email);
      await loadPromoters(search);
    } catch (error) {
      showToast(error.message || "No se pudo agregar potencia minera.");
    } finally {
      setProcessing("");
    }
  };

  const user = selected?.user || null;
  const refs = selected?.referrals || null;

  return (
    <div className="page admin-growth-page">
      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <div className="admin-status-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/admin/status")}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">Panel Admin</div>
          <h2>Promotores y ajustes</h2>
        </div>

        <button className="icon-btn ghost-icon" type="button" onClick={() => loadPromoters(search)} title="Actualizar">
          <FiRefreshCw />
        </button>
      </div>

      <section className="admin-growth-hero panel">
        <div className="admin-growth-hero-title">
          <span className="admin-status-icon mint"><FiUsers /></span>
          <div>
            <h3>Ranking de promotores</h3>
            <p>Usuarios con invitados directos que tienen inversión. Incluye Nivel 1, 2 y 3.</p>
          </div>
        </div>

        <div className="admin-growth-stats">
          <div>
            <span>Promotores</span>
            <strong>{number(totals.promoters)}</strong>
          </div>
          <div>
            <span>Directos con inversión</span>
            <strong>{number(totals.directInvested)}</strong>
          </div>
          <div>
            <span>Directos válidos 10+</span>
            <strong>{number(totals.valid10)}</strong>
          </div>
          <div>
            <span>Inversión directa</span>
            <strong>{money(totals.directMoney)} USDT</strong>
          </div>
        </div>
      </section>

      <section className="panel admin-growth-lookup">
        <div className="admin-growth-section-title">
          <FiSearch />
          <div>
            <h3>Buscar usuario y ajustar saldos</h3>
            <p>Consulta por correo, revisa balances, retiros e invitados. Luego puedes agregar inversión, saldo retirable o potencia manual.</p>
          </div>
        </div>

        <div className="admin-growth-search-row">
          <input
            value={lookupEmail}
            onChange={(event) => setLookupEmail(event.target.value)}
            placeholder="correo@usuario.com"
            onKeyDown={(event) => {
              if (event.key === "Enter") searchUser();
            }}
          />
          <button type="button" onClick={() => searchUser()} disabled={lookupLoading}>
            <FiSearch />
            {lookupLoading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {user && (
          <div className="admin-growth-user-card admin-growth-user-card-clean">
            <div className="admin-growth-user-top">
              <div>
                <h3>{user.email}</h3>
                <p>ID {user.id} · Código {user.referral_code || "-"}</p>
              </div>
              <span className="admin-deposit-status blue">{user.plan_name || "Sin GreenVest"}</span>
            </div>

            <div className="admin-growth-user-grid">
              <div><span>Inversión</span><strong>{money(user.invested_amount)} USDT</strong></div>
              <div><span>% minería actual</span><strong>+{percent(user.daily_percent)}%</strong></div>
              <div><span>Bonus potencia</span><strong>+{percent(user.hash_bonus_percent)}%</strong></div>
              <div><span>Ganancia diaria</span><strong>{money(user.daily_reward, 6)} USDT</strong></div>
              <div><span>Balance inversión</span><strong>{money(user.recharge_balance_usdt)} USDT</strong></div>
              <div><span>Balance retirable</span><strong>{money(user.withdrawable_usdt)} USDT</strong></div>
              <div><span>Retirado recibido</span><strong>{money(user.withdrawn_received_usdt)} USDT</strong></div>
              <div><span>Retiros pagados</span><strong>{number(user.paid_withdrawals_count)}</strong></div>
            </div>

            {refs && (
              <div className="admin-growth-levels">
                <LevelMetric title="Nivel 1 / A" count={refs.level1?.totalCount} invested={refs.level1?.investedTotal} validCount={refs.level1?.valid10Count} validTotal={refs.level1?.valid10Total} />
                <LevelMetric title="Nivel 2 / B" count={refs.level2?.totalCount} invested={refs.level2?.investedTotal} validCount={refs.level2?.valid10Count} validTotal={refs.level2?.valid10Total} />
                <LevelMetric title="Nivel 3 / C" count={refs.level3?.totalCount} invested={refs.level3?.investedTotal} validCount={refs.level3?.valid10Count} validTotal={refs.level3?.valid10Total} />
              </div>
            )}

            <div className="admin-growth-manual-title">
              <h4>Ajustes manuales del usuario</h4>
              <p>Usa estos campos solo para correcciones administrativas o bonos aprobados.</p>
            </div>

            <textarea
              className="admin-growth-note admin-growth-note-clean"
              value={manualNote}
              onChange={(event) => setManualNote(event.target.value)}
              placeholder="Nota administrativa opcional"
              rows={2}
            />

            <div className="admin-growth-actions-panel admin-growth-actions-panel-clean">
              <div className="admin-growth-action-box">
                <div>
                  <h4><FiDollarSign /> Inversión</h4>
                  <p>Suma al balance de inversión y recalcula el nivel GreenVest.</p>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualAmount}
                  onChange={(event) => setManualAmount(event.target.value)}
                  placeholder="Monto USDT"
                />
                <button type="button" onClick={handleManualInvestment} disabled={processing === "investment"}>
                  <FiPlusCircle />
                  {processing === "investment" ? "Agregando..." : "Añadir inversión"}
                </button>
              </div>

              <div className="admin-growth-action-box admin-growth-action-box-withdrawable">
                <div>
                  <h4><FiCreditCard /> Retirable</h4>
                  <p>Suma USDT directo al saldo disponible para retiro.</p>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualWithdrawable}
                  onChange={(event) => setManualWithdrawable(event.target.value)}
                  placeholder="Monto retirable"
                />
                <button type="button" onClick={handleManualWithdrawable} disabled={processing === "withdrawable"}>
                  <FiPlusCircle />
                  {processing === "withdrawable" ? "Agregando..." : "Añadir retirable"}
                </button>
              </div>

              <div className="admin-growth-action-box">
                <div>
                  <h4><FiZap /> Potencia</h4>
                  <p>Aumenta manualmente el bonus de minería del usuario.</p>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualPower}
                  onChange={(event) => setManualPower(event.target.value)}
                  placeholder="Porcentaje extra"
                />
                <button type="button" onClick={handleManualPower} disabled={processing === "power"}>
                  <FiTrendingUp />
                  {processing === "power" ? "Agregando..." : "Añadir poder"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="panel admin-growth-ranking">
        <div className="admin-growth-section-title with-action">
          <FiUserCheck />
          <div>
            <h3>Usuarios con más invitados directos con inversión</h3>
            <p>Solo muestra promotores que tienen al menos 1 invitado Nivel 1 con inversión mayor a 0.</p>
          </div>
        </div>

        <div className="admin-growth-search-row ranking-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filtrar promotor por correo"
            onKeyDown={(event) => {
              if (event.key === "Enter") loadPromoters(event.currentTarget.value);
            }}
          />
          <button type="button" onClick={() => loadPromoters(search)} disabled={loadingPromoters}>
            <FiSearch />
            Filtrar
          </button>
        </div>

        {loadingPromoters && <div className="admin-status-loading">Cargando promotores...</div>}

        {!loadingPromoters && promoters.length === 0 && (
          <div className="admin-empty">No hay promotores con invitados directos con inversión.</div>
        )}

        <div className="admin-growth-list">
          {!loadingPromoters && promoters.map((item) => (
            <article className="admin-growth-promoter-card" key={item.id}>
              <div className="admin-growth-promoter-top">
                <div>
                  <h3>{item.email}</h3>
                  <p>ID {item.id} · {item.plan_name || "Sin GreenVest"} · Inversión propia {money(item.promoter_invested_amount)} USDT</p>
                </div>
                <button type="button" onClick={() => openUserFromPromoter(item.email)}>
                  Revisar
                </button>
              </div>

              <div className="admin-growth-levels">
                <LevelMetric title="Nivel 1 / A" count={item.level1_total_count} invested={item.level1_invested_total} validCount={item.level1_valid_10_count} validTotal={item.level1_valid_10_total} />
                <LevelMetric title="Nivel 2 / B" count={item.level2_total_count} invested={item.level2_invested_total} validCount={item.level2_valid_10_count} validTotal={item.level2_valid_10_total} />
                <LevelMetric title="Nivel 3 / C" count={item.level3_total_count} invested={item.level3_invested_total} validCount={item.level3_valid_10_count} validTotal={item.level3_valid_10_total} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
