import React, { useEffect, useState } from "react";
import { FiExternalLink, FiPhone, FiShield, FiUsers } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import api from "../services/api";

function iconFor(type) {
  if (type === "whatsapp") return <FaWhatsapp />;
  if (type === "manager" || type === "phone") return <FiPhone />;
  if (type === "security") return <FiShield />;
  return <FiUsers />;
}

function typeLabel(type) {
  if (type === "whatsapp") return "WhatsApp";
  if (type === "manager") return "Gerente";
  if (type === "phone") return "Teléfono";
  if (type === "telegram") return "Telegram";
  if (type === "security") return "Seguridad";
  return "Canal";
}

export default function Support() {
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/support/channels")
      .then((res) => setChannels(res.data.channels || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page-stack support-page compact-support-page">
      <section className="support-compact-hero">
        <div>
          <span className="eyebrow">Soporte oficial</span>
          <h2>Canales de atención</h2>
          <p>Usa solo los enlaces publicados aquí. Para usuarios con plan activo, consulta el canal indicado por tu gerente.</p>
        </div>
        <FiShield className="support-hero-icon" />
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="support-info-compact">
        <div><FaWhatsapp /><span>WhatsApp oficial para consultas y anuncios.</span></div>
        <div><FiUsers /><span>Los usuarios con plan pueden tener atención por gerente.</span></div>
        <div><FiShield /><span>No compartas contraseñas ni códigos fuera de canales oficiales.</span></div>
      </section>

      <section className="support-channel-list">
        {channels.length === 0 && <div className="panel-card"><p>No hay canales activos por ahora.</p></div>}
        {channels.map((ch) => (
          <article className={`support-channel-card ${ch.type === "whatsapp" ? "whatsapp" : ""}`} key={ch.id}>
            <div className="support-channel-icon">{iconFor(ch.type)}</div>
            <div className="support-channel-body">
              <span>{typeLabel(ch.type)}</span>
              <h3>{ch.label}</h3>
              {ch.value && <strong>{ch.value}</strong>}
              {ch.description && <p>{ch.description}</p>}
            </div>
            {ch.url && (
              <a className="support-open-btn" href={ch.url} target="_blank" rel="noreferrer">
                <FiExternalLink /> Abrir
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
