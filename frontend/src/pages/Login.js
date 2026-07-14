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
        <h2>LOGIN</h2>
        <p>Lucky Zoo - Gana girando.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Correo electrónico<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Contraseña<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-btn" disabled={loading}>{loading ? "Ingresando..." : "LOGIN"}</button>
        </form>
        <small><Link to="/register">REGISTRARSE</Link></small>
      </section>
    </div>
  );
}
