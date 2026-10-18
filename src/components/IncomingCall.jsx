import { useCall } from "../context/CallContext";
import "../styles/Call.css";

export default function IncomingCall({ caller, onAccept, onDecline, onIgnore }) {
  const { stopRingtone, resetCall } = useCall();

  const handleAccept = async () => {
    // user gesture happens here -> later we can safely do remoteAudio.play() after accept
    stopRingtone();
    await onAccept?.();
  };

  const handleDecline = async () => {
    stopRingtone();
    await onDecline?.();
    // HARD cleanup so nothing stays "waiting"
    await resetCall();
  };

  const handleIgnore = async () => {
    stopRingtone();
    await onIgnore?.();
    // also cleanup local state/UI
    await resetCall();
  };

  return (
    <div className="incoming-call-popup">
      <div className="incoming-call-content">
        <img
          src={
            caller?.avatar ||
            "/rudal-default.jpg"
          }
          alt={caller?.username || "User"}
          className="caller-avatar"
        />

        <div className="caller-info">
          <h4>{caller?.username || "Incoming Call"}</h4>
          <p>is calling you…</p>
        </div>

        <div className="call-actions">
          <button className="accept" onClick={handleAccept}>Accept</button>
          <button className="decline" onClick={handleDecline}>Decline</button>
        </div>
      </div>
    </div>
  );
}
