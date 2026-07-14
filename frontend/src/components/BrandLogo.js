import React from "react";

export default function BrandLogo({ compact = false }) {
  return (
    <div className={compact ? "brand-logo compact" : "brand-logo"}>
      <img src="/royal-icon.svg" alt="Lucky Zoo" />
      {!compact && (
        <div>
          <strong>Lucky Zoo</strong>
          <span>AI Market Training</span>
        </div>
      )}
    </div>
  );
}
