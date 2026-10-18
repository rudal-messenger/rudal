import React, { useRef, useState } from "react";
import "../styles/DialPad.css";
import {
  claimRudalNumber,
  formatRudalNumber,
  normalizeRudalNumber,
} from "../utils/rudalNumbers";

const keys = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "*", "0", "#",
];

const letters = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
};

export default function DialPad({
  onClose,
  onCall,
  me,
  onNumberAssigned,
}) {
  const [number, setNumber] = useState("");
  const [countryCode, setCountryCode] = useState("41");
  const [assignedNumber, setAssignedNumber] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sending = useRef(false);
  const storageKey = `rudal-last-dialed:${me?.id || ""}`;

  const [lastNumber, setLastNumber] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });

  const ownNumber = assignedNumber || me?.rudal_number;
  const country = Number(countryCode);

  const validCountry =
    /^\d{1,3}$/.test(countryCode) &&
    country >= 1 &&
    country <= 999;

  async function assignNumber() {
    if (sending.current || !me?.id || !validCountry) {
      return;
    }

    sending.current = true;
    setBusy(true);
    setError("");

    try {
      const value = await claimRudalNumber(country);

      setAssignedNumber(value);

      onNumberAssigned?.(
        value,
        Number(value.slice(0, 4)) - 1000
      );
    } catch (err) {
      setError(
        err.message || "Could not assign your number."
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function dial(value = number) {
    if (sending.current) return;

    setError("");

    const normalized = normalizeRudalNumber(value);

    if (!ownNumber) {
      setError("Choose your own Rudal number first.");
      return;
    }

    if (!normalized) {
      setError(
        "Enter all 13 digits, including the Rudal country prefix."
      );
      return;
    }

    if (normalized === ownNumber) {
      setError("You cannot call yourself.");
      return;
    }

    sending.current = true;
    setBusy(true);
    setNumber(normalized);

    try {
      await onCall(normalized);

      setLastNumber(normalized);

      try {
        localStorage.setItem(storageKey, normalized);
      } catch {
        // Wiederwahl funktioniert auch ohne dauerhafte Speicherung.
      }
    } catch (err) {
      setError(
        err.message || "Could not start the call."
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="dialpad">
      <div className="dialpad-header">
        <button type="button" onClick={onClose}>
          ←
        </button>

        <span>Rudal Dial</span>
      </div>

      {!ownNumber && (
        <div className="rudal-number-setup">
          <label htmlFor="rudal-country-code">
            Country calling code
          </label>

          <input
            id="rudal-country-code"
            inputMode="numeric"
            value={countryCode}
            maxLength={3}
            disabled={busy}
            onChange={(e) =>
              setCountryCode(
                e.target.value.replace(/\D/g, "")
              )
            }
          />

          <small>
            41 = Switzerland · 49 = Germany ·
            43 = Austria · 39 = Italy
          </small>

          <p>
            Rudal prefix:{" "}
            {validCountry ? 1000 + country : "—"}
          </p>

          <p>
            Your number stays assigned to your account.
          </p>

          <button
            type="button"
            disabled={busy || !me?.id || !validCountry}
            onClick={assignNumber}
          >
            {busy ? "Assigning…" : "Get my Rudal number"}
          </button>
        </div>
      )}

      <input
        className="dialpad-display rudal-number-input"
        aria-label="Rudal number to call"
        placeholder="1041 123 456 789"
        value={number}
        inputMode="numeric"
        disabled={busy}
        onChange={(e) =>
          setNumber(
            e.target.value
              .replace(/[^\d\s()-]/g, "")
              .slice(0, 24)
          )
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            dial();
          }
        }}
      />

      <div className="dialpad-grid">
        {keys.map((key) => (
          <button
            type="button"
            key={key}
            className="dial-key"
            disabled={
              busy || key === "*" || key === "#"
            }
            onClick={() =>
              setNumber((previous) =>
                previous
                  .replace(/\D/g, "")
                  .concat(key)
                  .slice(0, 13)
              )
            }
          >
            <div className="digit">{key}</div>

            <div className="letters">
              {letters[key] || ""}
            </div>
          </button>
        ))}
      </div>

      <div className="dialpad-actions">
        <button
          type="button"
          disabled={busy || !number}
          onClick={() =>
            setNumber((previous) =>
              previous.slice(0, -1)
            )
          }
        >
          ⌫
        </button>

        <button
          type="button"
          className="redial-btn"
          disabled={busy || !ownNumber || !lastNumber}
          onClick={() => dial(lastNumber)}
        >
          Redial
        </button>

        <button
          type="button"
          className="call-btn"
          disabled={
            busy ||
            !ownNumber ||
            !normalizeRudalNumber(number)
          }
          onClick={() => dial()}
        >
          {busy ? "Connecting…" : "📞 Call"}
        </button>
      </div>

      {error && (
        <p className="dialpad-error" role="alert">
          {error}
        </p>
      )}

      <div className="my-number">
        <span>My Rudal number:</span>

        <div className="my-number-box">
          {formatRudalNumber(ownNumber) || "Not assigned"}
        </div>
      </div>
    </div>
  );
}