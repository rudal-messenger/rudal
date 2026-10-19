import React from "react";
import "../styles/LoadingScreen.css";

export default function LoadingScreen() {
  return (
    <div className="rudal-loading">
      <div className="rudal-logo">
        <img src="./RudalLogo.png" alt="Rudal Logo" />
      </div>
      <div className="loading-spinner"></div>
    </div>
  );
}
