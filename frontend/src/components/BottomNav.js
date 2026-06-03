import React from "react";
import { NavLink } from "react-router-dom";
import { FiHome, FiUsers, FiUser } from "react-icons/fi";

function ImageIcon({ src, alt, className = "" }) {
  return <img src={src} alt={alt} className={`bottom-icon-img ${className}`.trim()} />;
}

export default function BottomNav() {
  const items = [
    { to: "/home", label: "HOGAR", icon: <FiHome /> },
    { to: "/vip", label: "VIP", icon: <ImageIcon src="/tree-icons/tree-0.png" alt="VIP" className="bottom-icon-plant" /> },
    { to: "/tasks", label: "JARDÍN", icon: <ImageIcon src="/water-icon.png" alt="Jardín" className="bottom-icon-water" /> },
    { to: "/promotion", label: "EQUIPO", icon: <FiUsers /> },
    { to: "/profile", label: "A MI", icon: <FiUser /> },
  ];

  return (
    <nav className="bottom-nav bottom-nav-greenvest-clean">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-item ${isActive ? "active" : ""}`}
        >
          <span className="bottom-icon">{item.icon}</span>
          <span className="bottom-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
