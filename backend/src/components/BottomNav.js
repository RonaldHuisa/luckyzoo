import React from "react";
import { NavLink } from "react-router-dom";
import { FiHome, FiRadio, FiShield, FiFileText, FiUser } from "react-icons/fi";
import { useI18n } from "../i18n/I18nContext";

export default function BottomNav() {
  const { t } = useI18n();

  const items = [
    { to: "/home", label: t("Hogar"), icon: <FiHome /> },
    { to: "/promotion", label: t("Promoción"), icon: <FiRadio /> },
    { to: "/vip", label: t("VIP"), icon: <FiShield /> },
    { to: "/tasks", label: t("Tarea"), icon: <FiFileText /> },
    { to: "/profile", label: t("A mí"), icon: <FiUser /> },
  ];

  return (
    <nav className="bottom-nav">
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
