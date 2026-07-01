import React from "react";
import { FiMoon, FiSun } from "react-icons/fi";

export default function ThemeToggle({ theme, setTheme }) {
  const isDark = theme === "dark";
  return (
    <button type="button" className="theme-toggle" onClick={() => setTheme(isDark ? "light" : "dark")}> 
      {isDark ? <FiSun /> : <FiMoon />}
      <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>
    </button>
  );
}
