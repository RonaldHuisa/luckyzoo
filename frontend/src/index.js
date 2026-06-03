// frontend/src/index.js
import React from "react";
import ReactDOM from "react-dom/client";  // Usa 'react-dom/client' para React 18
import App from "./App";
import "./index.css";
import { startAppUpdateGuard } from "./pwa/appUpdateGuard";

const root = ReactDOM.createRoot(document.getElementById("root"));  // Usamos createRoot
root.render(<App />);  // Renderizamos la aplicación React

const ensureManifest = () => {
  const existingManifest = document.querySelector('link[rel="manifest"]');
  if (!existingManifest) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.json";
    document.head.appendChild(manifest);
  }

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#050505";
    document.head.appendChild(meta);
  }
};

ensureManifest();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.update().catch(() => null);
      })
      .catch(() => null);
  });
}

startAppUpdateGuard();
