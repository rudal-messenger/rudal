import { createContext, useContext, useMemo, useRef, useState } from "react";

const CallContext = createContext(null);

/**
 * callPhase:
 *  - idle
 *  - ringing_in   (incoming call waiting for accept/decline)
 *  - ringing_out  (caller waiting for answer)
 *  - in_call
 *  - ending
 */
export function CallProvider({ children }) {
  const [incomingCall, setIncomingCall] = useState(null); // payload for incoming call
  const [activeCall, setActiveCall] = useState(null);     // payload for active call (call id, peer ids, etc.)
  const [callPhase, setCallPhase] = useState("idle");
  const [callError, setCallError] = useState(null);

  // WebRTC
  const pcRef = useRef(null);

  // Media
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  // Audio elements (attach in UI once, but refs live here globally)
  const remoteAudioRef = useRef(null);
  const localAudioRef = useRef(null); // optional, if you want local monitoring (usually muted)

  // Ringtone
  const ringtoneRef = useRef(null);

  const playRingtone = () => {
    stopRingtone();
    // Your tree shows: public/sounds/ringtone.m4a
    const audio = new Audio("./sounds/ringtone.mp3");
    audio.loop = true;
    // Autoplay may be blocked until user gesture; that's fine.
    audio.play().catch(() => {});
    ringtoneRef.current = audio;
  };

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
      ringtoneRef.current = null;
    }
  };

  /**
   * HARD cleanup. Call this on:
   * - decline
   * - hangup
   * - remote ended/rejected
   * - errors
   */
  const resetCall = async () => {
    setCallPhase("ending");
    setCallError(null);
    stopRingtone();

    // Stop local tracks
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      localStreamRef.current = null;
    }

    // Stop remote tracks (not strictly required, but keeps state clean)
    if (remoteStreamRef.current) {
      try {
        remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      remoteStreamRef.current = null;
    }

    // Clear audio elements
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.srcObject = null;
      } catch {}
    }
    if (localAudioRef.current) {
      try {
        localAudioRef.current.srcObject = null;
      } catch {}
    }

    // Close RTCPeerConnection
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }

    // Reset state
    setIncomingCall(null);
    setActiveCall(null);
    setCallPhase("idle");
  };

  const value = useMemo(
    () => ({
      // state
      incomingCall,
      setIncomingCall,
      activeCall,
      setActiveCall,
      callPhase,
      setCallPhase,
      callError,
      setCallError,

      // webrtc/media refs
      pcRef,
      localStreamRef,
      remoteStreamRef,
      remoteAudioRef,
      localAudioRef,

      // ringtone
      playRingtone,
      stopRingtone,

      // cleanup
      resetCall,
    }),
    [incomingCall, activeCall, callPhase, callError]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside CallProvider");
  return ctx;
}
