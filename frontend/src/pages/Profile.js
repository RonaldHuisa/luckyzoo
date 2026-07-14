import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiKey, FiLogOut, FiMessageCircle, FiShield, FiX } from "react-icons/fi";
import api from "../services/api";
import pollito from "../assets/roulette/pollito.png";
import conejo from "../assets/roulette/conejo.png";
import oveja from "../assets/roulette/oveja.png";
import toro from "../assets/roulette/toro.png";
import leon from "../assets/roulette/leon.png";
import tigre from "../assets/roulette/tigre.png";

const assetByAnimal = { pollito, conejo, oveja, toro, leon, tigre };

export default function Profile() {
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null);
  const [roulette, setRoulette] = useState(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [supportSummary, setSupportSummary] = useState({ unreadAdminMessages: 0, openTickets: 0 });

  const load = async () => {
    setError("");
    try {
      const [{ data: profileData }, { data: rouletteData }, supportResult] = await Promise.all([
        api.get("/auth/me"),
        api.get("/auth/roulette/status"),
        api.get("/support/summary").catch(() => ({ data: { unreadAdminMessages: 0, openTickets: 0 } })),
      ]);
      setBundle(profileData);
      setRoulette(rouletteData);
      setSupportSummary(supportResult.data || { unreadAdminMessages: 0, openTickets: 0 });
    } catch (err) {
      setError(err.message || "No se pudo cargar el perfil.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changePassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const { data } = await api.post("/auth/change-password", passwordForm);
      setMessage(data.message || "Contraseña actualizada correctamente.");
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setPasswordOpen(false);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "No se pudo actualizar la contraseña.");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const profile = bundle?.profile || {};
  const level = roulette?.level || {
    level: 0,
    animalKey: "pollito",
    planName: "Pasantía Pollito",
    displayName: "Ruleta Pollito",
  };
  const animal = assetByAnimal[level.animalKey] || pollito;
  const levelLabel = Number(level.level || 0) ? `VIP ${level.level}` : "Pasantía";
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  })();
  const isAdmin = Boolean(profile.isAdmin || profile.is_admin || storedUser.is_admin || storedUser.isAdmin || storedUser.email === "admin@admin.com");
  const visibleUserId = profile.referralCode || profile.referral_code || storedUser.referralCode || storedUser.referral_code || profile.id || "—";

  return (
    <div className="page-stack profile-page profile-v42">
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <section className="profile-v42-card profile-v42-main">
        <div className="profile-v42-avatar">
          <img src={animal} alt={level.displayName || level.planName} />
        </div>

        <div className="profile-v42-info">
          <span>Perfil de usuario</span>
          <h1>{level.planName || levelLabel}</h1>

          <div className="profile-v42-data">
            <article>
              <small>ID usuario</small>
              <strong>{visibleUserId}</strong>
            </article>
            <article>
              <small>Correo</small>
              <strong>{profile.email || "—"}</strong>
            </article>
            <article>
              <small>Nivel actual</small>
              <strong>{levelLabel}</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="profile-v42-actions">
        {isAdmin && (
          <Link className="profile-v42-action-btn profile-v55-admin-btn" to="/admin">
            <FiShield />
            <span>
              <strong>Panel Admin</strong>
              <small>Usuarios, retiros, inversiones, tickets y límites.</small>
            </span>
          </Link>
        )}

        <Link className="profile-v42-action-btn profile-v50-support-btn" to="/support">
          <FiMessageCircle />
          <span>
            <strong>Contactar soporte</strong>
            <small>Crea tickets y revisa respuestas del admin.</small>
          </span>
          {Number(supportSummary.unreadAdminMessages || 0) > 0 && (
            <em>{supportSummary.unreadAdminMessages}</em>
          )}
        </Link>

        <button type="button" className="profile-v42-action-btn" onClick={() => setPasswordOpen(true)}>
          <FiKey />
          <span>
            <strong>Cambiar contraseña</strong>
            <small>Actualiza tu acceso de forma segura.</small>
          </span>
        </button>

        <button type="button" className="profile-v42-logout" onClick={logout}>
          <FiLogOut /> Cerrar sesión
        </button>
      </section>

      {passwordOpen && (
        <div className="profile-v42-modal-backdrop" role="presentation">
          <section className="profile-v42-modal" role="dialog" aria-modal="true" aria-label="Cambiar contraseña">
            <div className="profile-v42-modal-head">
              <div>
                <span>Seguridad</span>
                <h2>Cambiar contraseña</h2>
              </div>
              <button type="button" onClick={() => setPasswordOpen(false)} aria-label="Cerrar">
                <FiX />
              </button>
            </div>

            <form className="profile-v42-password-form" onSubmit={changePassword}>
              <label>
                Contraseña actual
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                />
              </label>

              <label>
                Nueva contraseña
                <input
                  type="password"
                  minLength="6"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  required
                />
              </label>

              <button className="profile-v42-save" type="submit">
                Guardar contraseña
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
