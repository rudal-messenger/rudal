import React from "react";

export default function TopBar({ user, onSignOut }) {
  return (
    <div className="topbar">
      <div className="user-info">
        <strong>{user.email}</strong>
        <span className="status"> 🟢 Available</span>
      </div>
      <button onClick={onSignOut} className="signout-btn">
        Log out
      </button>
    </div>
  );
}
