import React, { useEffect, useRef, useState } from "react";

export default function GlobalLoading() {
  const [visible, setVisible] = useState(false);
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
        timer.current = setTimeout(() => setVisible(false), 160);
      }
    };

    window.addEventListener("royal:loading-start", show);
    window.addEventListener("royal:loading-end", hide);

    return () => {
      window.removeEventListener("royal:loading-start", show);
      window.removeEventListener("royal:loading-end", hide);
      clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="global-loading-backdrop global-loading-dice-backdrop" role="status" aria-live="polite" aria-label="Cargando">
      <div className="global-loading-dice" aria-hidden="true">🎲</div>
    </div>
  );
}
