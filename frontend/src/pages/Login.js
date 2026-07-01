import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import BrandLogo from "../components/BrandLogo";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-centered">
      <section className="auth-card auth-card-centered auth-login-card">
        <BrandLogo />
        <h2>Iniciar sesión</h2>
        <p>Accede a tu cuenta para revisar tus tareas, nivel y movimientos.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Correo electrónico<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Contraseña<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-btn" disabled={loading}>{loading ? "Ingresando..." : "Iniciar sesión"}</button>
        </form>
        <small>¿Nuevo en Royal Imperial? <Link to="/register">Crear cuenta</Link></small>
      </section>
    </div>
  );
}
