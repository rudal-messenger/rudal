import React, { useEffect, useRef, useState } from "react";
import { setupSignaling } from "../lib/realtime";
import { playCall, stopCall } from "../lib/notifications";
import "../styles/IncomingCall.css";

export default function CallPanel({ call, onEnd, isCaller }) {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pcRef = useRef(null);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(new MediaStream());
  const pendingCandidatesRef = useRef([]);
  const sendSignalRef = useRef(null);
  const disconnectRef = useRef(null);

  const [status, setStatus] = useState("connecting"); // connecting | in_call | ended

  useEffect(() => {
    if (!call?.chatId) return;

    let cancelled = false;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // TURN later
      ],
    });

    pcRef.current = pc;

    const flushCandidates = async () => {
      const pending = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const c of pending) {
        try {
          await pc.addIceCandidate(c);
        } catch (e) {
          console.error("flushCandidates addIceCandidate failed:", e);
        }
      }
    };

    const handleRemoteCandidate = async (candidateObj) => {
      if (!candidateObj) return;
      const candidate = new RTCIceCandidate(candidateObj);

      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    };

    // ✅ IMPORTANT: default to audio-only so camera permission can't break calls
    const ensureLocalMedia = async () => {
      if (localStreamRef.current) return localStreamRef.current;

      const wantsVideo = !!call?.wantsVideo; // optional flag if you add it later
      const constraints = wantsVideo
        ? { video: true, audio: true }
        : { video: false, audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (cancelled) return null;

      localStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Show local preview only if video exists
      if (localVideo.current) {
        localVideo.current.srcObject = wantsVideo ? stream : null;
      }

      return stream;
    };

    // Build remote stream reliably
    pc.ontrack = (e) => {
      // Avoid duplicating tracks
      if (!remoteStreamRef.current.getTracks().some((t) => t.id === e.track.id)) {
        remoteStreamRef.current.addTrack(e.track);
      }

      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remoteStreamRef.current;
        // Autoplay might be blocked until a user gesture; accept/call click usually covers it.
        remoteVideo.current.play?.().catch(() => {});
      }

      setStatus("in_call");
      stopCall();
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && sendSignalRef.current) {
        sendSignalRef.current({ type: "candidate", candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("connectionState:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setStatus("in_call");
        stopCall();
      }
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        // If it drops, end locally (and UI should close)
        // Don't spam signals if already ending.
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("iceConnectionState:", pc.iceConnectionState);
    };

    const hardCleanup = () => {
      stopCall();

      // Stop local tracks (mic/cam)
      if (localStreamRef.current?.getTracks) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      localStreamRef.current = null;

      // Clear video elements
      if (localVideo.current) localVideo.current.srcObject = null;
      if (remoteVideo.current) remoteVideo.current.srcObject = null;

      // Reset remote stream
      try {
        remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      remoteStreamRef.current = new MediaStream();

      // Close PC
      try {
        pc.close();
      } catch {}
    };

    const { sendSignal, disconnect } = setupSignaling(call.chatId, async (msg) => {
      try {
        if (msg.type === "offer") {
          // Callee path
          await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
          await flushCandidates();

          await ensureLocalMedia();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: "answer", answer });

          stopCall();
        }

        if (msg.type === "answer") {
          // Caller path
          await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
          await flushCandidates();

          stopCall();
        }

        if (msg.type === "candidate") {
          await handleRemoteCandidate(msg.candidate);
        }

        // ✅ NEW: remote hangup
        if (msg.type === "hangup") {
          console.log("[CALL] remote hangup received");
          setStatus("ended");
          hardCleanup();
          disconnect();
          onEnd?.(); // close UI
        }
      } catch (err) {
        console.error("Signaling handler error:", err, msg);
      }
    });

    sendSignalRef.current = sendSignal;
    disconnectRef.current = disconnect;

    const startCallerOffer = async () => {
      await ensureLocalMedia();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: "offer", offer });

      playCall();
    };

    // Caller creates offer, callee waits
    if (isCaller) {
      startCallerOffer().catch(console.error);
    } else {
      playCall();
    }

    // Expose a clean end function for the button + unmount
    const endLocalCall = () => {
      if (sendSignalRef.current) {
        sendSignalRef.current({ type: "hangup" });
      }
      setStatus("ended");
      hardCleanup();
      disconnect();
    };

    // Attach to window for quick debug if you want (optional)
    // window.__rudalEndCall = endLocalCall;

    return () => {
      cancelled = true;
      // On unmount, also tell remote to stop waiting
      endLocalCall();
    };
  }, [call?.chatId, isCaller]);

  const handleEndClick = () => {
    // send hangup + cleanup + close UI
    if (sendSignalRef.current) sendSignalRef.current({ type: "hangup" });
    stopCall();

    // Stop tracks immediately
    const ls = localStreamRef.current;
    if (ls?.getTracks) ls.getTracks().forEach((t) => t.stop());

    try {
      pcRef.current?.close();
    } catch {}

    disconnectRef.current?.();
    onEnd?.();
  };

  return (
    <div className="call-panel">
      <div className="call-content">
        <h3>
          {status === "in_call"
            ? `In call with ${call?.callee?.name || "user"}`
            : isCaller
              ? `Calling ${call?.callee?.name || "user"}...`
              : `Incoming call...`}
        </h3>

        <div className="video-container">
          {/* If audio-only, localVideo will be blank (fine) */}
          <video ref={localVideo} autoPlay muted playsInline className="video-self" />
          <video ref={remoteVideo} autoPlay playsInline className="video-remote" />
        </div>

        <button className="decline" onClick={handleEndClick}>
          ❌ End Call
        </button>
      </div>
    </div>
  );
}
