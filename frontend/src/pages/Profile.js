import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowLeft,
  FiBookOpen,
  FiChevronRight,
  FiCreditCard,
  FiGift,
  FiRefreshCw,
  FiKey,
  FiMessageCircle,
  FiTrash2,
  FiUser,
  FiZap,
} from "react-icons/fi";
import api from "../services/api";

const COUNTRIES = [
  { iso: "AR", name: "Argentina", code: "+54", emoji: "🇦🇷" },
  { iso: "BO", name: "Bolivia", code: "+591", emoji: "🇧🇴" },
  { iso: "BR", name: "Brasil", code: "+55", emoji: "🇧🇷" },
  { iso: "CL", name: "Chile", code: "+56", emoji: "🇨🇱" },
  { iso: "CO", name: "Colombia", code: "+57", emoji: "🇨🇴" },
  { iso: "CR", name: "Costa Rica", code: "+506", emoji: "🇨🇷" },
  { iso: "CU", name: "Cuba", code: "+53", emoji: "🇨🇺" },
  { iso: "EC", name: "Ecuador", code: "+593", emoji: "🇪🇨" },
  { iso: "SV", name: "El Salvador", code: "+503", emoji: "🇸🇻" },
  { iso: "GT", name: "Guatemala", code: "+502", emoji: "🇬🇹" },
  { iso: "HT", name: "Haití", code: "+509", emoji: "🇭🇹" },
  { iso: "HN", name: "Honduras", code: "+504", emoji: "🇭🇳" },
  { iso: "MX", name: "México", code: "+52", emoji: "🇲🇽" },
  { iso: "NI", name: "Nicaragua", code: "+505", emoji: "🇳🇮" },
  { iso: "PA", name: "Panamá", code: "+507", emoji: "🇵🇦" },
  { iso: "PY", name: "Paraguay", code: "+595", emoji: "🇵🇾" },
  { iso: "PE", name: "Perú", code: "+51", emoji: "🇵🇪" },
  { iso: "PR", name: "Puerto Rico", code: "+1", emoji: "🇵🇷" },
  { iso: "DO", name: "República Dominicana", code: "+1", emoji: "🇩🇴" },
  { iso: "UY", name: "Uruguay", code: "+598", emoji: "🇺🇾" },
  { iso: "VE", name: "Venezuela", code: "+58", emoji: "🇻🇪" },
  { iso: "US", name: "Estados Unidos", code: "+1", emoji: "🇺🇸" },
  { iso: "ES", name: "España", code: "+34", emoji: "🇪🇸" },
];

function accountLabel(account) {
  if (!account) return "";
  const addr = account.withdrawalAddress || "";
  return `${account.label || account.network} · ${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function compactDate(value) {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "--";
  }
}


function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function describeArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", outerStart.x, outerStart.y,
    "A", outerRadius, outerRadius, 0, largeArc, 0, outerEnd.x, outerEnd.y,
    "L", innerStart.x, innerStart.y,
    "A", innerRadius, innerRadius, 0, largeArc, 1, innerEnd.x, innerEnd.y,
    "Z",
  ].join(" ");
}

function SectionHeader({ title, subtitle, onBack }) {
  return (
    <div className="profile-section-header">
      <button type="button" className="profile-back-btn" onClick={onBack}>
        <FiArrowLeft /> Volver
      </button>
      <div>
        <span className="eyebrow">Perfil</span>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

export default function Profile() {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  }, []);

  const [profileBundle, setProfileBundle] = useState(null);
  const [vipData, setVipData] = useState(null);
  const [section, setSection] = useState("main");
  const [profileForm, setProfileForm] = useState({ fullName: "", countryIso: "PE", phoneNumber: "" });
  const [accountForm, setAccountForm] = useState({ network: "BEP20-USDT", label: "", withdrawalAddress: "", isDefault: true });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [roulette, setRoulette] = useState({ points: 0, prizes: [], history: [] });
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const [roulettePrize, setRoulettePrize] = useState(null);
  const [rouletteRotation, setRouletteRotation] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCountry = COUNTRIES.find((item) => item.iso === profileForm.countryIso) || COUNTRIES[0];

  const loadProfile = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setProfileBundle(data);
      const p = data.profile || {};
      setProfileForm({
        fullName: p.fullName || "",
        countryIso: p.phoneCountryIso || "PE",
        phoneNumber: p.phoneNumber || "",
      });
    } catch (err) {
      setError(err.message || "No se pudo cargar tu perfil.");
    }
  };

  const loadVip = async () => {
    try {
      const { data } = await api.get("/vip/status");
      setVipData(data);
    } catch (_) {
      setVipData(null);
    }
  };

  const loadRoulette = async () => {
    try {
      const { data } = await api.get("/auth/roulette/status");
      setRoulette({
        points: Number(data.points || 0),
        prizes: data.prizes || [],
        history: data.history || [],
      });
    } catch (_) {
      setRoulette({ points: 0, prizes: [], history: [] });
    }
  };

  useEffect(() => {
    loadProfile();
    loadVip();
    loadRoulette();
  }, []);

  const clearStatus = () => { setError(""); setMessage(""); };
  const goSection = (next) => { clearStatus(); setSection(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const saveProfile = async (e) => {
    e.preventDefault(); clearStatus();
    try {
      const { data } = await api.put("/auth/profile", {
        fullName: profileForm.fullName,
        phoneCountryIso: selectedCountry.iso,
        phoneCountryName: selectedCountry.name,
        phoneCountryCode: selectedCountry.code,
        phoneNumber: profileForm.phoneNumber,
      });
      setProfileBundle(data);
      setMessage(data.message || "Datos actualizados correctamente.");
    } catch (err) { setError(err.message); }
  };

  const saveAccount = async (e) => {
    e.preventDefault(); clearStatus();
    try {
      const { data } = await api.post("/auth/withdrawal-accounts", accountForm);
      setProfileBundle(data);
      setAccountForm({ network: "BEP20-USDT", label: "", withdrawalAddress: "", isDefault: true });
      setMessage(data.message || "Cuenta de retiro guardada correctamente.");
    } catch (err) { setError(err.message); }
  };

  const deleteAccount = async (id) => {
    clearStatus();
    try {
      const { data } = await api.delete(`/auth/withdrawal-accounts/${id}`);
      setProfileBundle(data);
      setMessage(data.message || "Cuenta eliminada.");
    } catch (err) { setError(err.message); }
  };

  const submitPassword = async (e) => {
    e.preventDefault(); clearStatus();
    try {
      const { data } = await api.post("/auth/change-password", passwordForm);
      setMessage(data.message || "Contraseña actualizada.");
      setPasswordForm({ currentPassword: "", newPassword: "" });
    } catch (err) { setError(err.message); }
  };

  const submitRedeemCode = async (e) => {
    e.preventDefault(); clearStatus();
    const clean = redeemCode.trim().toUpperCase();
    if (!clean) {
      setError("Ingresa un código válido.");
      return;
    }
    setRedeeming(true);
    try {
      const { data } = await api.post("/auth/redeem-code", { code: clean });
      setRedeemCode("");
      setMessage(data.message || "Código canjeado correctamente.");
      await loadProfile();
    } catch (err) {
      setError(err.message || "No se pudo canjear el código.");
    } finally {
      setRedeeming(false);
    }
  };

  const spinRoulette = async () => {
    clearStatus();
    if (rouletteSpinning) return;
    if (Number(roulette.points || 0) <= 0) {
      setError("No tienes giros disponibles.");
      return;
    }
    setRouletteSpinning(true);
    setRoulettePrize(null);
    try {
      const { data } = await api.post("/auth/roulette/spin");
      const prize = data.prize;
      const prizes = data.prizes || roulette.prizes;
      const list = roulette.prizes.length ? roulette.prizes : prizes;
      const index = Math.max(0, list.findIndex((item) => Number(item.id) === Number(prize?.id)));
      const slice = list.length ? 360 / list.length : 45;
      const target = 360 - (index * slice + slice / 2);
      setRouletteRotation((prev) => {
        const current = ((prev % 360) + 360) % 360;
        const correction = ((target - current) + 360) % 360;
        return prev + 1440 + correction;
      });
      setTimeout(() => {
        setRoulettePrize(prize);
        setRoulette({
          points: Number(data.points || 0),
          prizes: list,
          history: data.history || [],
        });
        setRouletteSpinning(false);
      }, 2300);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudo girar.");
      setRouletteSpinning(false);
    }
  };

  const accounts = profileBundle?.withdrawalAccounts || [];
  const p = profileBundle?.profile || {};
  const referralCode = user.referral_code || user.referralCode || p.referralCode || "--";
  const createdAt = user.created_at || user.createdAt || p.createdAt;
  const activePurchase = vipData?.activePurchase;
  const activePlanPackage = (vipData?.packages || []).find((item) => Number(item.level) === Number(activePurchase?.level));
  const planName = activePurchase ? `Plan ${activePlanPackage?.name || activePurchase.level}` : "Pasantía";
  const creditPoints = Number(p.creditPoints ?? p.credit_points ?? 100);

  const renderMain = () => (
    <>
      <section className="profile-overview-card">
        <div className="profile-overview-top">
          <div>
            <span className="eyebrow">Perfil</span>
            <h2>Cuenta y accesos</h2>
          </div>
          <img className="profile-logo compact" src="/royal-icon.svg" alt="Royal" />
        </div>

        <div className="profile-info-grid profile-info-grid-no-email">
          <article><span>ID</span><strong>{referralCode}</strong></article>
          <article><span>Registro</span><strong>{compactDate(createdAt)}</strong></article>
          <article><span>Plan actual</span><strong>{planName}</strong></article>
          <article className="profile-credit-box"><span>Puntos</span><strong>{creditPoints}</strong></article>
        </div>
      </section>

      <section className="profile-menu-panel">
        <div className="section-title"><span>Accesos</span><h3>Gestiona tu cuenta</h3></div>
        <div className="profile-menu-list">
          <button className="profile-menu-item redeem-menu-item" type="button" onClick={() => goSection("redeem")}>
            <FiGift /><div><strong>Canjear código</strong><small>Aplicar beneficio</small></div><FiChevronRight />
          </button>
          <button className="profile-menu-item roulette-menu-item" type="button" onClick={() => goSection("roulette")}>
            <FiZap /><div><strong>Ruleta</strong><small>Giros y premios</small></div><FiChevronRight />
          </button>
          <Link className="profile-menu-item" to="/support">
            <FiMessageCircle /><div><strong>Soporte</strong><small>Canales oficiales</small></div><FiChevronRight />
          </Link>
          <button className="profile-menu-item" type="button" onClick={() => goSection("personal")}>
            <FiUser /><div><strong>Datos personales</strong><small>Nombre, país y celular</small></div><FiChevronRight />
          </button>
          <button className="profile-menu-item" type="button" onClick={() => goSection("withdrawal")}>
            <FiCreditCard /><div><strong>Cuentas de retiro</strong><small>Registrar método USDT</small></div><FiChevronRight />
          </button>
          <button className="profile-menu-item" type="button" onClick={() => goSection("accounts")}>
            <FiBookOpen /><div><strong>Cuentas registradas</strong><small>Ver o eliminar cuentas</small></div><FiChevronRight />
          </button>
          <button className="profile-menu-item" type="button" onClick={() => goSection("security")}>
            <FiKey /><div><strong>Cambiar contraseña</strong><small>Seguridad de acceso</small></div><FiChevronRight />
          </button>
        </div>
      </section>
    </>
  );

  const renderRoulette = () => {
    const prizes = roulette.prizes || [];
    const wheelStyle = { transform: `rotate(${rouletteRotation}deg)` };
    const segmentAngle = prizes.length ? 360 / prizes.length : 360;
    const segmentColors = ["wheel-gold", "wheel-violet", "wheel-cream", "wheel-lavender"];

    return (
      <>
        <SectionHeader title="Ruleta Royal" subtitle="Usa tus giros disponibles y revisa tus premios obtenidos." onBack={() => goSection("main")} />
        <section className="profile-roulette-panel">
          <div className="roulette-topline">
            <div className="roulette-points-card"><span>Giros disponibles</span><strong>{roulette.points || 0}</strong></div>
            <button className="primary-btn roulette-spin-btn" type="button" onClick={spinRoulette} disabled={rouletteSpinning || Number(roulette.points || 0) <= 0}>
              <FiRefreshCw /> {rouletteSpinning ? "Girando..." : "Girar"}
            </button>
          </div>

          <div className="roulette-stage">
            <div className="roulette-pointer" />
            <div className="royal-wheel-shell">
              <div className={`royal-wheel royal-wheel-svg ${rouletteSpinning ? "spinning" : ""}`}>
                <svg className="royal-wheel-rotor" viewBox="0 0 240 240" style={wheelStyle} aria-label="Ruleta Royal">
                  <circle className="wheel-outer-ring" cx="120" cy="120" r="112" />
                  {prizes.map((prize, index) => {
                    const start = index * segmentAngle;
                    const end = start + segmentAngle;
                    const mid = start + segmentAngle / 2;
                    const textPoint = polarToCartesian(120, 120, 75, mid);
                    return (
                      <g className="wheel-segment" key={prize.id}>
                        <path
                          className={segmentColors[index % segmentColors.length]}
                          d={describeArc(120, 120, 106, 39, start, end)}
                        />
                        <line
                          className="wheel-divider"
                          x1={polarToCartesian(120, 120, 39, start).x}
                          y1={polarToCartesian(120, 120, 39, start).y}
                          x2={polarToCartesian(120, 120, 106, start).x}
                          y2={polarToCartesian(120, 120, 106, start).y}
                        />
                        <text
                          className="wheel-label"
                          x={textPoint.x}
                          y={textPoint.y}
                          transform={`rotate(${mid}, ${textPoint.x}, ${textPoint.y})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {prize.label}
                        </text>
                      </g>
                    );
                  })}
                  {!prizes.length && <text className="wheel-label empty" x="120" y="120" textAnchor="middle">Royal</text>}
                </svg>
                <div className="royal-wheel-center">RI</div>
              </div>
            </div>
            <p className="roulette-stage-note">Cada giro consume 1 punto. El premio se acredita automáticamente.</p>
          </div>
        </section>

        <section className="profile-roulette-history">
          <div className="section-title"><span>Historial</span><h3>Últimos premios</h3></div>
          {(roulette.history || []).length === 0 && <div className="empty-soft">Aún no tienes premios registrados.</div>}
          <div className="roulette-history-list">
            {(roulette.history || []).slice(0, 10).map((spin) => (
              <article className="roulette-history-item" key={spin.id}>
                <div className="roulette-history-copy">
                  <strong>{spin.prizeLabel}</strong>
                  <small>{new Date(spin.createdAt).toLocaleString()}</small>
                </div>
                <span>+{Number(spin.amountUsdt || 0).toFixed(2)} USDT</span>
              </article>
            ))}
          </div>
        </section>

        {roulettePrize && (
          <div className="action-popup-backdrop" onClick={() => setRoulettePrize(null)}>
            <div className="action-popup-card roulette-win-popup subtle" onClick={(e) => e.stopPropagation()}>
              <div className="popup-icon-wrap warn"><FiGift /></div>
              <span className="roulette-win-eyebrow">Premio obtenido</span>
              <h3>{roulettePrize.label}</h3>
              <p>Premio acreditado en tu cuenta.</p>
              <button className="primary-btn" type="button" onClick={() => setRoulettePrize(null)}>Entendido</button>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderRedeem = () => (
    <>
      <SectionHeader title="Canjear código" subtitle="Ingresa tu código para aplicar un beneficio disponible." onBack={() => goSection("main")} />
      <section className="profile-redeem-panel profile-redeem-section">
        <div className="profile-redeem-head">
          <FiGift />
          <div>
            <span className="eyebrow">Código</span>
            <h3>Aplicar beneficio</h3>
          </div>
        </div>
        <form className="profile-redeem-form" onSubmit={submitRedeemCode}>
          <input
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            placeholder="Ingresa tu código"
            maxLength={40}
          />
          <button className="primary-btn" disabled={redeeming}>{redeeming ? "Validando..." : "Canjear"}</button>
        </form>
      </section>
    </>
  );

  const renderPersonal = () => (
    <>
      <SectionHeader title="Datos personales" subtitle="Actualiza tu información de contacto." onBack={() => goSection("main")} />
      <form className="panel-card form-stack profile-section-card" onSubmit={saveProfile}>
        <label>Nombre completo<input value={profileForm.fullName} onChange={(e)=>setProfileForm({...profileForm,fullName:e.target.value})} placeholder="Nombre y apellidos" /></label>
        <div className="country-phone-grid">
          <label>País<select value={profileForm.countryIso} onChange={(e)=>setProfileForm({...profileForm,countryIso:e.target.value})}>{COUNTRIES.map((c)=><option key={c.iso} value={c.iso}>{c.iso} {c.emoji} {c.name} {c.code}</option>)}</select></label>
          <label>Número de celular<input value={profileForm.phoneNumber} onChange={(e)=>setProfileForm({...profileForm,phoneNumber:e.target.value.replace(/[^0-9]/g,"")})} placeholder="Número" /></label>
        </div>
        <button className="primary-btn">Guardar datos</button>
        <div className={`profile-status-note ${p.personalDataComplete ? "ok" : "pending"}`}>{p.personalDataComplete ? "Datos personales completos." : "Datos personales pendientes."}</div>
      </form>
    </>
  );

  const renderWithdrawal = () => (
    <>
      <SectionHeader title="Cuentas de retiro" subtitle="Registra el método que usarás al retirar." onBack={() => goSection("main")} />
      <form className="panel-card form-stack profile-section-card" onSubmit={saveAccount}>
        <label>Método<select value={accountForm.network} onChange={(e)=>setAccountForm({...accountForm,network:e.target.value})}><option value="BEP20-USDT">BEP20-USDT</option><option value="POLYGON-USDT">POLYGON-USDT</option></select></label>
        <label>Nombre de cuenta<input value={accountForm.label} onChange={(e)=>setAccountForm({...accountForm,label:e.target.value})} placeholder="Ej: Mi wallet BEP20" /></label>
        <label>Dirección USDT<input value={accountForm.withdrawalAddress} onChange={(e)=>setAccountForm({...accountForm,withdrawalAddress:e.target.value})} placeholder="0x..." /></label>
        <button className="primary-btn">Guardar cuenta</button>
      </form>
    </>
  );

  const renderAccounts = () => (
    <>
      <SectionHeader title="Cuentas registradas" subtitle="Revisa tus métodos guardados." onBack={() => goSection("main")} />
      <section className="panel-card profile-section-card">
        <div className="withdrawal-account-list">
          {accounts.length === 0 && <div className="empty-soft">Aún no tienes cuentas de retiro registradas.</div>}
          {accounts.map((acc) => (
            <div className="withdrawal-account-item" key={acc.id}>
              <div><strong>{accountLabel(acc)}</strong><small>{acc.network}</small></div>
              <button className="icon-btn danger-icon" onClick={() => deleteAccount(acc.id)} type="button"><FiTrash2 /></button>
            </div>
          ))}
        </div>
        <div className={`profile-status-note ${p.withdrawEnabled ? "ok" : "pending"}`}>{p.withdrawEnabled ? "Cuenta habilitada para retiros." : "Validación de retiro pendiente."}</div>
      </section>
    </>
  );

  const renderSecurity = () => (
    <>
      <SectionHeader title="Cambiar contraseña" subtitle="Actualiza tu contraseña de acceso." onBack={() => goSection("main")} />
      <form className="panel-card form-stack profile-section-card" onSubmit={submitPassword}>
        <label>Contraseña actual<input type="password" value={passwordForm.currentPassword} onChange={(e)=>setPasswordForm({...passwordForm,currentPassword:e.target.value})} /></label>
        <label>Nueva contraseña<input type="password" value={passwordForm.newPassword} onChange={(e)=>setPasswordForm({...passwordForm,newPassword:e.target.value})} /></label>
        <button className="primary-btn">Actualizar</button>
      </form>
    </>
  );

  return (
    <div className="page-stack profile-page">
      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}
      {section === "main" && renderMain()}
      {section === "redeem" && renderRedeem()}
      {section === "roulette" && renderRoulette()}
      {section === "personal" && renderPersonal()}
      {section === "withdrawal" && renderWithdrawal()}
      {section === "accounts" && renderAccounts()}
      {section === "security" && renderSecurity()}
    </div>
  );
}
