import React, { useEffect, useRef, useState } from "react";

export default function GlobalLoading() {
  const [visible, setVisible] = useState(false);
  const [isMobileSafe, setIsMobileSafe] = useState(() => typeof window !== "undefined" && window.innerWidth <= 760);
  const [message, setMessage] = useState("Cargando...");
  const counter = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    const show = () => {
      counter.current += 1;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(true), 120);
    };
    const hide = () => {
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setVisible(false);
          setMessage("Cargando...");
        }, 160);
      }
    };
    const updateMessage = (event) => {
      const nextMessage = typeof event?.detail === "string" ? event.detail.trim() : "";
      if (nextMessage) setMessage(nextMessage);
    };
    window.addEventListener("royal:loading-start", show);
    window.addEventListener("royal:loading-end", hide);
    window.addEventListener("royal:loading-message", updateMessage);
    return () => {
      window.removeEventListener("royal:loading-start", show);
      window.removeEventListener("royal:loading-end", hide);
      window.removeEventListener("royal:loading-message", updateMessage);
      clearTimeout(timer.current);
    };
  }, []);

  if (!visible || isMobileSafe) return null;
  return (
    <div className="global-loading-backdrop global-loading-mobile-safe" role="status" aria-live="polite">
      <div className="global-loading-box">
        <span className="global-loading-dot" />
        <strong>{message}</strong>
      </div>
    </div>
  );
}
