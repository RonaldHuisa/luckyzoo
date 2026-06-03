import React from "react";

export default function PopupInfo({ onClose }) {
  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <div className="popup-illustration">🛡️</div>
        <p className="popup-text">
          Baolong TV es una plataforma de publicidad en streaming integrada de próxima
          generación basada en Web3.0, que proporciona servicios de promoción de tráfico
          de alta calidad para empresas.
        </p>
        <button className="primary-btn popup-btn" onClick={onClose}>
          Cerca
        </button>
      </div>
    </div>
  );
}