import React from "react";
import BottomNav from "./BottomNav";

export default function AppShell({ children }) {
  return (
    <div className="app-bg">
      <div className="phone-frame">
        <div className="screen-content">{children}</div>
        <BottomNav />
      </div>
    </div>
  );
}