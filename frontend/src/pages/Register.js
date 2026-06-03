import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FiEye, FiEyeOff, FiMail, FiLock, FiHash, FiRefreshCw } from "react-icons/fi";
import { registerUser, saveSession } from "../services/authService";

function generateCaptchaCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [securityPassword, setSecurityPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showSecurityPassword, setShowSecurityPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchParams] = useSearchParams();
  const referralFromUrl = searchParams.get("ref") || "";

  const [referralCode, setReferralCode] = useState(referralFromUrl);
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState("");

  const refreshCaptcha = () => {
    setCaptchaCode(generateCaptchaCode());
    setCaptchaInput("");
  };

  const isValidEmail = (value) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const isStrongPassword = (value) => {
    const minLength = value.length >= 8;
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasNumber = /[0-9]/.test(value);

    return minLength && hasUppercase && hasLowercase && hasNumber;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Ingresa tu correo electrónico.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    if (!password.trim()) {
      setError("Ingresa tu contraseña de inicio de sesión.");
      return;
    }

    if (!securityPassword.trim()) {
      setError("Confirma tu contraseña.");
      return;
    }

    if (!isStrongPassword(password)) {
      setError("La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.");
      return;
    }

    if (password !== securityPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (!referralCode.trim()) {
      setError("El código de invitación es obligatorio.");
      return;
    }

    if (!captchaInput.trim()) {
      setError("Ingresa el código CAPTCHA.");
      return;
    }

    if (captchaInput.trim() !== captchaCode) {
      setError("Código CAPTCHA incorrecto.");
      refreshCaptcha();
      return;
    }

    setLoading(true);

    try {
      const data = await registerUser({
        email,
        password,
        securityPassword,
        referralCode,
      });

      saveSession(data);
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-logo-block greenvest-auth-brand auth-brand-logo-large">
        <img className="auth-company-logo" src="/GreenVest_ico.png" alt="GreenVest" />
        <h1>Crear cuenta</h1>
        <p>Registro por invitación.</p>
      </div>

      <div className="auth-card auth-premium-card">
        <form onSubmit={handleRegister} className="auth-form">
          <label className="auth-field-label">Correo electrónico</label>
          <div className="auth-input-wrap">
            <FiMail />
            <input
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico"
              autoComplete="email"
            />
          </div>

          <label className="auth-field-label">Contraseña</label>
          <div className="password-field auth-input-wrap">
            <FiLock />
            <input
              className="auth-input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="new-password"
            />

            <button
              type="button"
              className="eye-btn"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <label className="auth-field-label">Confirmar contraseña</label>
          <div className="password-field auth-input-wrap">
            <FiLock />
            <input
              className="auth-input"
              type={showSecurityPassword ? "text" : "password"}
              value={securityPassword}
              onChange={(e) => setSecurityPassword(e.target.value)}
              placeholder="Confirmar contraseña"
              autoComplete="new-password"
            />

            <button
              type="button"
              className="eye-btn"
              onClick={() => setShowSecurityPassword(!showSecurityPassword)}
            >
              {showSecurityPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <label className="auth-field-label">Código de invitación</label>
          <div className="auth-input-wrap auth-invite-locked">
            <FiHash />
            <input
              className="auth-input"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="Código de invitación"
              required
            />
          </div>

          <label className="auth-field-label">Código CAPTCHA</label>
          <div className="auth-captcha-row">
            <div className="auth-captcha-code" data-no-translate="true">{captchaCode}</div>
            <button type="button" className="auth-captcha-refresh" onClick={refreshCaptcha} aria-label="Cambiar CAPTCHA">
              <FiRefreshCw />
            </button>
          </div>
          <div className="auth-input-wrap">
            <FiHash />
            <input
              className="auth-input"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Código CAPTCHA"
              inputMode="numeric"
              maxLength="4"
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "Registrando..." : "Registrarse"}
          </button>
        </form>

        <p className="auth-footer-link">
          ¿Ya tienes una cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>
      </div>

      <p className="auth-copyright">© 2026 GreenVest Corporation Inc. Todos los derechos reservados.</p>
    </div>
  );
}
