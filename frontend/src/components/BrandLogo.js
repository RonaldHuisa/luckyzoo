import React from "react";

export default function BrandLogo({ compact = false }) {
  return (
    <div className={compact ? "brand-logo compact" : "brand-logo"}>
      <img src="/luckyzoo-icon-192.png" alt="Lucky Zoo" />
      {!compact && (
        <div>
          <strong>Lucky Zoo</strong>
          <span>Gana girando</span>
        </div>
      )}
    </div>
  );
}
