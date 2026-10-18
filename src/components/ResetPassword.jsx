import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/Login.css";

export default function ResetPassword() {
  const [stage, setStage] = useState("loading"); 
  // "loading" | "setNew" | "requestLink"

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) setStage("setNew");
      else setStage("requestLink");
    };
    check();
  }, []);

  const sendResetLink = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMsg("If an account exists for that email, a reset link has been sent.");
    } catch (e2) {
      setErr(e2?.message || "Could not send reset link.");
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (newPassword.length < 8) return setErr("Password must be at least 8 characters.");
    if (newPassword !== confirm) return setErr("Passwords do not match.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMsg("Password updated. You can sign in now.");
      setNewPassword("");
      setConfirm("");
    } catch (e2) {
      setErr(e2?.message || "Could not update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ms-wrap">
      <div className="ms-shell">
        <div className="ms-card">
          <div className="ms-brand">
            <div className="ms-logo">R</div>
            <div className="ms-brandtext">
              <div className="ms-appname">Rudal</div>
              <div className="ms-sub">Communication Technologies</div>
            </div>
          </div>

          <h1 className="ms-title">
            {stage === "setNew" ? "Reset password" : "Forgot password"}
          </h1>

          {err && <div className="ms-error">{err}</div>}
          {msg && <div className="ms-success">{msg}</div>}

          {stage === "loading" ? (
            <div style={{ fontSize: 13, color: "#6b6b6b" }}>Loading…</div>
          ) : stage === "requestLink" ? (
            <form onSubmit={sendResetLink} className="ms-form">
              <div className="ms-field">
                <label className="ms-label">Email</label>
                <input
                  className="ms-input"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="ms-actions">
                <a className="ms-btn ms-btn-secondary" href="/">
                  Back
                </a>
                <button className="ms-btn ms-btn-primary" type="submit" disabled={loading}>
                  {loading ? "Sending…" : "Send link"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={updatePassword} className="ms-form">
              <div className="ms-field">
                <label className="ms-label">New password</label>
                <input
                  className="ms-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="ms-field">
                <label className="ms-label">Confirm password</label>
                <input
                  className="ms-input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              <div className="ms-actions">
                <a className="ms-btn ms-btn-secondary" href="/">
                  Back
                </a>
                <button className="ms-btn ms-btn-primary" type="submit" disabled={loading}>
                  {loading ? "Updating…" : "Update"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
