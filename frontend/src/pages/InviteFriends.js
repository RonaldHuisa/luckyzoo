import React from "react";
import { FiArrowLeft, FiCopy } from "react-icons/fi";

export default function InviteFriends() {
  return (
    <div className="page invite-page">
      <div className="invite-header">
        <FiArrowLeft />
        <h2>Invitar a amigos</h2>
        <span />
      </div>

      <div className="panel">
        <label className="invite-label">Enlace de invitación</label>
        <div className="invite-link-box">
          <span>https://baolongtv.org/#/reg?ref=351794</span>
          <FiCopy />
        </div>

        <div className="social-row">
          {["X", "f", "➤", "in", "wa", "ig", "t", "◎"].map((item, i) => (
            <div key={i} className="social-circle">{item}</div>
          ))}
        </div>
      </div>

      <div className="invite-card-big">
        <div className="invite-user-card">
          <div className="invite-avatar">BF</div>
          <div className="invite-user-info">
            <strong>huisaronald98@gmail...</strong>
            <span>código de invitación: 351794</span>
          </div>
          <div className="qr-box"></div>
        </div>
      </div>

      <div className="invite-actions">
        <button className="outline-btn">Copiar Enlace de invitación</button>
        <button className="gradient-btn">Guardar código QR</button>
      </div>

      <div className="panel text-panel">
        <p>
          BaolongTV los usuarios pueden promocionar nuestra plataforma a través de enlaces
          de referencia o compartirla con sus amigos en plataformas de redes sociales como
          Facebook, Twitter, Instagram, YouTube, TikTok, WhatsApp y Telegram.
        </p>
      </div>
    </div>
  );
}