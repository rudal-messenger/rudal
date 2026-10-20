import React, { useEffect, useMemo, useState } from "react";
import { useCall } from "../../context/CallContext";
import {
  startCalleeWebRTC,
  endCall,
  setCallCamera,
} from "./webrtc";
import "./CallOverlay.css";
import { supabase } from "../../supabaseClient";
import hangupIcon from "../../assets/tabs/hangup_phone.png";
import cameraIcon from "../../assets/tabs/camera_on.png";
import cameraIconSelected from "../../assets/tabs/camera_off.png";
import mutedMicIcon from "../../assets/tabs/mic_off.png";
import micIcon from "../../assets/tabs/mic_on.png";
import noSpeakerIcon from "../../assets/tabs/no_speaker.png";
import speakerIcon from "../../assets/tabs/speaker.png";



function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function CallOverlay() {
  const {
    incomingCall,
    setIncomingCall,
    activeCall,
setActiveCall,
callPhase,
    setCallPhase,
    stopRingtone,
    resetCall,
    pcRef,
    localStreamRef,
  } = useCall();

  const [callTime, setCallTime] = useState("00:00");

useEffect(() => {
  let seconds = 0;

  const interval = setInterval(() => {
    seconds++;

    const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");

    setCallTime(`${mins}:${secs}`);
  }, 1000);

  return () => clearInterval(interval);
}, []);

  const [hasSpeaker, setHasSpeaker] = useState(true);

const [minimized, setMinimized] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);

  // Speaker selection UI
  const [speakerOpen, setSpeakerOpen] = useState(false);
  const [outputs, setOutputs] = useState([]);
  const [currentSink, setCurrentSink] = useState("");

  useEffect(() => {
    if (callPhase !== "in_call") {
      setSeconds(0);
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callPhase]);

  const [callPeer, setCallPeer] = useState(null);

const displayedCall = incomingCall || activeCall;
const displayedCallId = displayedCall?.id;
const callerId = displayedCall?.caller_id;
const calleeId = displayedCall?.callee_id;

  useEffect(() => {
  let mounted = true;

  async function detectSpeakers() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        if (mounted) setHasSpeaker(true);
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((device) => device.kind === "audiooutput");

      if (mounted) {
        setHasSpeaker(outputs.length > 0);
      }
    } catch (err) {
      console.error("Failed to detect speakers:", err);
      if (mounted) setHasSpeaker(true);
    }
  }

  detectSpeakers();

  const handleDeviceChange = () => detectSpeakers();
  navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

  return () => {
    mounted = false;
    navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
  };
}, []);

useEffect(() => {
  let cancelled = false;

  setCallPeer(null);

  if (!displayedCallId || !callerId || !calleeId) return;

  const loadPeer = async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user || cancelled) return;

      const peerId =
        callerId === user.id ? calleeId : callerId;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, avatar")
        .eq("id", peerId)
        .single();

      if (error) throw error;

      if (!cancelled) {
        setCallPeer({
          ...profile,
          callId: displayedCallId,
        });
      }
    } catch (error) {
      console.error("[CALL] Could not load participant:", error);
    }
  };

  void loadPeer();

  return () => {
    cancelled = true;
  };
}, [displayedCallId, callerId, calleeId]);

  const name =
  callPeer?.callId === displayedCallId && callPeer?.username
    ? callPeer.username
    : incomingCall?.caller_name || "Connecting…";

const toggleVideo = () => {
  if (callPhase !== "in_call") return;

  try {
    const next = !videoEnabled;

    setCallCamera(pcRef.current, next);

    const preview = document.getElementById("rudal-local-video");

    if (preview) {
      preview.srcObject = localStreamRef.current;
    }

    setVideoEnabled(next);
  } catch (error) {
    console.error("[CALL] Camera toggle failed:", error);
  }
};


  const avatar =
  (
    callPeer?.callId === displayedCallId
      ? callPeer?.avatar
      : incomingCall?.caller_avatar
  ) || `${import.meta.env.BASE_URL}rudal-default.jpg`;


  const show = callPhase !== "idle";
  const [remoteCameraEnabled, setRemoteCameraEnabled] =
  useState(false);

useEffect(() => {
  const handleCamera = (event) => {
    if (event.detail.pc !== pcRef.current) return;
    setRemoteCameraEnabled(event.detail.enabled);
  };

  window.addEventListener("rudal:remote-camera", handleCamera);

  return () => {
    window.removeEventListener("rudal:remote-camera", handleCamera);
  };
}, [pcRef]);

useEffect(() => {
  if (callPhase === "idle") {
    setVideoEnabled(false);
    setRemoteCameraEnabled(false);
    return;
  }

  if (callPhase === "in_call") {
  setVideoEnabled(
    !!pcRef.current?.rudalLocalCameraEnabled
  );

  setRemoteCameraEnabled(
    !!pcRef.current?.rudalRemoteCameraEnabled
  );
}
}, [callPhase, pcRef]);

useEffect(() => {
  if (callPhase === "idle") {
    setMinimized(false);
  }
}, [callPhase]);
  if (!show) return null;

  // ---- MIC TOGGLE ----
  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  // ---- OPEN CHAT BUTTON ----
  const openChat = () => {
  const chatId =
    activeCall?.chatId ||
    activeCall?.chat_id ||
    incomingCall?.chatId ||
    incomingCall?.chat_id;

  console.log("[CALL] openChat clicked", { chatId, activeCall, incomingCall });

  if (!chatId) return;

  window.dispatchEvent(new CustomEvent("rudal:open-chat", { detail: { chatId } }));
};



  // ---- SPEAKER OUTPUT ----
  const loadOutputs = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outs = devices.filter((d) => d.kind === "audiooutput");
      setOutputs(outs);
      setSpeakerOpen(true);
    } catch (e) {
      console.warn("[CALL] enumerateDevices failed:", e);
    }
  };

  const setSink = async (deviceId) => {
    const audio = document.getElementById("rudal-remote-audio");
    if (!audio) return;

    // setSinkId not supported everywhere (Safari/iOS)
    if (typeof audio.setSinkId !== "function") {
      console.warn("[CALL] setSinkId not supported in this browser");
      return;
    }

    try {
      await audio.setSinkId(deviceId);
      setCurrentSink(deviceId);
      setSpeakerOpen(false);
    } catch (e) {
      console.warn("[CALL] setSinkId failed:", e);
    }
  };

  // ---- CALL ACTIONS ----
 const accept = async () => {
  if (!incomingCall) return;

  const call = incomingCall;
  stopRingtone();
  setCallPhase("connecting");

  try {
    const { pc, localStream } = await startCalleeWebRTC(
      call,
      {
        onConnected: () => setCallPhase("in_call"),
      }
    );

    pcRef.current = pc;
    localStreamRef.current = localStream;

    setActiveCall({
      ...call,
      chatId: call.chatId || call.chat_id,
    });

    setIncomingCall(null);
  } catch (error) {
    console.error("[CALL] accept failed:", error);
    await resetCall();
    alert(`Could not connect call: ${error.message}`);
  }
};

  const decline = async () => {
    stopRingtone();
    if (incomingCall?.id) await endCall(incomingCall.id, "declined");
    await resetCall();
  };

  const ignore = async () => {
    stopRingtone();
    if (incomingCall?.id) await endCall(incomingCall.id, "ignored");
    await resetCall();
  };

  const cancelOutgoing = async () => {
    const id = activeCall?.id;
    if (!id) return;
    await endCall(id, "canceled");
    await resetCall();
  };

  const hangup = async () => {
    const id = activeCall?.id;
    if (id) await endCall(id, "ended");
    await resetCall();
  };

  // ---- UI ----

  return (
    <div
  className={`rudal-call-screen ${
    remoteCameraEnabled ? "has-remote-video" : ""
  } ${minimized ? "is-minimized" : ""}`}
  
>    
      {/* TOP BAR */}
      <div className="rudal-call-top">
        <div className="rudal-call-title">
          <div className="rudal-call-name">{name}</div>
          <div className="rudal-call-sub">
  {callPhase === "in_call"
    ? formatTime(seconds)
    : callPhase === "connecting"
      ? "Connecting…"
      : callPhase === "ringing_out"
        ? "Calling…"
        : "Incoming call…"}
</div>
        </div>

        <div className="rudal-call-top-actions">
  {callPhase === "in_call" && (
    <button
      type="button"
      className="rudal-icon-btn rudal-call-size-btn"
      onClick={() => setMinimized((current) => !current)}
      title={minimized ? "Expand call" : "Minimize call"}
      aria-label={minimized ? "Expand call" : "Minimize call"}
    >
      {minimized ? "↗" : "↙"}
    </button>
  )}

  <button
    className="rudal-icon-btn"
    title="More"
    aria-label="More"
  >
    ⋯
  </button>
</div>
      </div>

      {/* CENTER */}
      <div className="rudal-call-center">

  {/* Remote video (full screen) */}
  <video
    id="rudal-remote-video"
    autoPlay
    playsInline
    className="remote-video"
  />

  {/* Local preview (small corner) */}
  <video
  id="rudal-local-video"
  autoPlay
  muted
  playsInline
  className="local-video"
  style={{ display: videoEnabled ? "block" : "none" }}
/>


<img
  src={avatar}
  alt=""
  className="rudal-call-profile"
/>
        <div className="rudal-center-name">{name}</div>
        <div className="rudal-center-hint" role="status">
  {callPhase === "ringing_in" && "Tap accept to answer"}
  {callPhase === "ringing_out" && "Waiting for answer"}
  {callPhase === "connecting" && "Connecting…"}
  {callPhase === "in_call" && "In call"}
</div>
      </div>

      {/* SPEAKER PICKER */}
      {speakerOpen && (
        <div className="rudal-speaker-sheet">
          <div className="rudal-speaker-card">
            <div className="rudal-speaker-title">Output device</div>

            {outputs.length === 0 ? (
              <div className="rudal-speaker-row">No outputs found</div>
            ) : (
              outputs.map((d) => (
                <button
                  key={d.deviceId}
                  className={`rudal-speaker-row ${currentSink === d.deviceId ? "active" : ""}`}
                  onClick={() => setSink(d.deviceId)}
                >
                  {d.label || `Speaker (${d.deviceId.slice(0, 6)}…)`}
                </button>
              ))
            )}

            <button className="rudal-speaker-close" onClick={() => setSpeakerOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM BAR */}
      <div className="rudal-call-bottom">
        


        {/* Mic */}
        <button
          className={`rudal-round-btn ${muted ? "is-off" : ""}`}
          title={muted ? "Unmute" : "Mute"}
          aria-label="Mute"
          onClick={toggleMute}
          disabled={callPhase !== "in_call"} // only in call
        >
          <img
  src={muted ? mutedMicIcon : micIcon}
  alt=""
  className="rudal-control-icon"
/>
        </button>

        <button
  className="rudal-round-btn"
  onClick={() => toggleVideo()}
  title="Toggle camera"
>
  <img
    src={cameraEnabled ? cameraIconSelected : cameraIcon}
    alt=""
    className="rudal-control-icon"
  />
</button>

        {/* Speaker */}
        <button
  className="rudal-round-btn"
  title="Speaker"
  aria-label="Speaker"
  onClick={loadOutputs}
  disabled={callPhase !== "in_call"}
>
  <img
    src={hasSpeaker ? speakerIcon : noSpeakerIcon}
    alt=""
    className="rudal-control-icon"
  />
</button>

        {/* BIG RED BUTTON:
            - Outgoing: Cancel
            - In call: End
            - Incoming BEFORE accept: do NOT show (you requested that) */}
        {callPhase === "ringing_out" && (
          <button className="rudal-hangup-btn" onClick={cancelOutgoing} title="Cancel">
            
<img src={hangupIcon} alt="" className="rudal-hangup-icon" />

          </button>
        )}
          
{(callPhase === "in_call" || callPhase === "connecting") && (
  <button className="rudal-hangup-btn" onClick={hangup} title="End call">
    <img
      src={hangupIcon}
      alt=""
      className="rudal-hangup-icon"
    />
  </button>
)}


        {/* Incoming accept/decline pills */}
        {callPhase === "ringing_in" && (
          <div className="rudal-incoming-actions">
            <button className="rudal-accept-pill" onClick={accept}>✅ Accept</button>
            <button className="rudal-ignore-pill" onClick={ignore}>🚫 Ignore</button>
            <button className="rudal-decline-pill" onClick={decline}>❌ Decline</button>
          </div>
        )}
      </div>
    </div>
  );
}
