import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import BrandLogo from "../components/BrandLogo";

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ref = useMemo(() => params.get("ref") || "", [params]);
  const [form, setForm] = useState({ email: "", password: "", securityPassword: "", referralCode: ref });
  const [captcha, setCaptcha] = useState({ question: "", token: "" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaAnswer("");
    try {
      const { data } = await api.get("/auth/captcha");
      setCaptcha({ question: data.question || "", token: data.token || "" });
    } catch (_) {
      setCaptcha({ question: "", token: "" });
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!captcha.token || !captchaAnswer.trim()) {
      setError("Completa la verificación.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        ...form,
        captchaToken: captcha.token,
        captchaAnswer,
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err.message);
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-centered">
      <section className="auth-card auth-card-centered">
        <BrandLogo />
        <h2>Crear cuenta</h2>
        <p>Regístrate para acceder a Royal Imperial AI.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Correo electrónico<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Contraseña<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          <label>Confirmar contraseña<input type="password" value={form.securityPassword} onChange={(e) => setForm({ ...form, securityPassword: e.target.value })} required /></label>
          <label>Código de invitación<input value={form.referralCode} onChange={(e) => setForm({ ...form, referralCode: e.target.value })} placeholder="Ingresa tu código de invitación" /></label>

          <div className="captcha-box">
            <div>
              <span>Verificación</span>
              <strong>{captchaLoading ? "..." : captcha.question || "—"}</strong>
            </div>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Respuesta"
              aria-label="Respuesta de verificación"
              required
            />
            <button type="button" className="captcha-refresh" onClick={loadCaptcha} disabled={captchaLoading || loading} aria-label="Actualizar verificación">
              ↻
            </button>
          </div>

          {error && <div className="alert error">{error}</div>}
          <button className="primary-btn" disabled={loading}>{loading ? "Creando..." : "Crear cuenta"}</button>
        </form>
        <small>¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link></small>
      </section>
    </div>
  );
}
