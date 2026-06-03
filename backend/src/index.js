// frontend/src/index.js
import React from "react";
import ReactDOM from "react-dom/client";  // Usa 'react-dom/client' para React 18
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));  // Usamos createRoot
root.render(<App />);  // Renderizamos la aplicación React

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => null);
  });
}
