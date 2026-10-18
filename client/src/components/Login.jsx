import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/Login.css";

import {
  bytesToBase64,
  base64ToBytes,
} from "./crypto/base64";

import {
  generateMasterKey,
  encryptMasterKey,
  decryptMasterKey,
  exportMasterKey,
} from "./crypto/masterKey";

import {
  generateSalt,
  derivePasswordKey,
} from "./crypto/passwordKey";

const BASE = import.meta.env.BASE_URL || "/";

const redirectTo = () =>
  `${window.location.origin}${BASE}`;

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verify, setVerify] = useState(false);

  function switchMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setStep("email");
    setPassword("");
    setError("");
    setMessage("");
    setVerify(false);
  }

  async function submit(event) {
    event.preventDefault();

    if (busy) return;

    if (step === "email") {
      setStep("password");
      setError("");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const signingIn = mode === "signin";
    let authFailure = "";

    if (signingIn) {
      window.rudalAuthPending = true;
    }

    try {
      if (signingIn) {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) throw error;

        const uid = data.user.id;

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(
            "encrypted_master_key, master_key_iv, master_key_salt"
          )
          .eq("id", uid)
          .single();

        if (profileError) throw profileError;

        if (profile.encrypted_master_key) {
          if (
            !profile.master_key_iv ||
            !profile.master_key_salt
          ) {
            throw new Error(
              "Your encryption backup is incomplete. Please use account recovery."
            );
          }

          const key = await derivePasswordKey(
            password,
            base64ToBytes(profile.master_key_salt)
          );

          const master = await decryptMasterKey(
            base64ToBytes(profile.encrypted_master_key),
            base64ToBytes(profile.master_key_iv),
            key
          );

          sessionStorage.setItem(
            `rudal_master_key_${uid}`,
            bytesToBase64(await exportMasterKey(master))
          );
        }
      } else {
        if (password.length < 8) {
          throw new Error(
            "Use a password with at least 8 characters."
          );
        }

        const master = await generateMasterKey();
        const salt = generateSalt();

        const key = await derivePasswordKey(
          password,
          salt
        );

        const { encrypted, iv } =
          await encryptMasterKey(master, key);

        const { data, error } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo: redirectTo(),
              data: {
                encrypted_master_key:
                  bytesToBase64(encrypted),
                master_key_iv: bytesToBase64(iv),
                master_key_salt: bytesToBase64(salt),
              },
            },
          });

        if (error) throw error;

        if (data.session) {
          await supabase.auth.signOut();

          throw new Error(
            "Enable Confirm email in Supabase Authentication before using signup."
          );
        }

        setVerify(true);
        setPassword("");

        setMessage(
          "Check your inbox and verify your email. Then sign in to set up your Rudal account."
        );
      }
    } catch (err) {
      authFailure =
        err.message || "Authentication failed.";

      setError(authFailure);
    } finally {
      if (signingIn) {
        window.rudalAuthPending = false;

        window.dispatchEvent(
          new CustomEvent("rudal-auth-ready", {
            detail: { error: authFailure },
          })
        );
      }

      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo(),
        },
      });

      if (error) throw error;

      setMessage(
        "Verification email requested. Check your inbox and spam folder."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ms-wrap">
      <div className="ms-shell">
        <div className="ms-card">
          <div className="ms-brand">
            <img
              src={`${BASE}RudalLogo.png`}
              alt="Rudal"
              className="ms-logo"
            />

            <div className="ms-brandtext">
              <div className="ms-appname">Rudal</div>
              <div className="ms-sub">
                Simple Communication refined
              </div>
            </div>
          </div>

          <h1 className="ms-title">
            {verify
              ? "Verify your email"
              : mode === "signin"
              ? "Sign In"
              : "Create account"}
          </h1>

          {error && (
            <div className="ms-error" role="alert">
              {error}
            </div>
          )}

          {message && (
            <p role="status">{message}</p>
          )}

          {verify ? (
            <div className="ms-actions">
              <button
                type="button"
                className="ms-btn ms-btn-secondary"
                disabled={busy}
                onClick={resend}
              >
                Resend email
              </button>

              <button
                type="button"
                className="ms-btn ms-btn-primary"
                onClick={() => {
                  setMode("signin");
                  setStep("password");
                  setVerify(false);
                }}
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="ms-form"
            >
              <div className="ms-stage">
                <div className="ms-panel ms-in ms-forward">
                  {step === "email" ? (
                    <div className="ms-field">
                      <label
                        className="ms-label"
                        htmlFor="login-email"
                      >
                        Email
                      </label>

                      <input
                        id="login-email"
                        className="ms-input"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) =>
                          setEmail(e.target.value)
                        }
                        disabled={busy}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="ms-identityRow">
                        <button
                          type="button"
                          className="ms-backBtn"
                          disabled={busy}
                          onClick={() =>
                            setStep("email")
                          }
                        >
                          ←
                        </button>

                        <div className="ms-identityEmail">
                          {email}
                        </div>
                      </div>

                      <div className="ms-field">
                        <label
                          className="ms-label"
                          htmlFor="login-password"
                        >
                          Password
                        </label>

                        <input
                          id="login-password"
                          className="ms-input"
                          type="password"
                          required
                          minLength={
                            mode === "signup"
                              ? 8
                              : undefined
                          }
                          autoComplete={
                            mode === "signin"
                              ? "current-password"
                              : "new-password"
                          }
                          value={password}
                          onChange={(e) =>
                            setPassword(e.target.value)
                          }
                          disabled={busy}
                        />
                      </div>
                    </>
                  )}

                  <div className="ms-actions">
                    <button
                      type="button"
                      className="ms-btn ms-btn-secondary"
                      onClick={switchMode}
                      disabled={busy}
                    >
                      {mode === "signin"
                        ? "Create account"
                        : "Back to sign in"}
                    </button>

                    <button
                      type="submit"
                      className="ms-btn ms-btn-primary"
                      disabled={busy}
                    >
                      {busy
                        ? "Please wait…"
                        : step === "email"
                        ? "Next"
                        : mode === "signin"
                        ? "Sign In"
                        : "Create account"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}