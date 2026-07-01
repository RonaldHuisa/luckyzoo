import React from "react";

export default function BrandLogo({ compact = false }) {
  return (
    <div className={compact ? "brand-logo compact" : "brand-logo"}>
      <img src="/royal-icon.svg" alt="Royal Imperial AI" />
      {!compact && (
        <div>
          <strong>Royal Imperial</strong>
          <span>AI Market Training</span>
        </div>
      )}
    </div>
  );
}
