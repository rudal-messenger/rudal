import React from "react";
import { useCall } from "../../context/CallContext";
import { startCalleeWebRTC, endCall } from "./webrtc";

export default function IncomingCallModal() {
  const {
    incomingCall,
    setIncomingCall,
    activeCall,
    setCallPhase,
    callPhase,
    stopRingtone,
    resetCall,
  } = useCall();

  // Nothing to show
  if (callPhase === "idle") return null;

  const accept = async () => {
  if (!incomingCall) return;

  const call = incomingCall;
  stopRingtone();

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
    if (!incomingCall?.id) return;
    stopRingtone();
    await endCall(incomingCall.id, "declined");
    await resetCall();
  };

  const ignore = async () => {
    if (!incomingCall?.id) return;
    stopRingtone();
    await endCall(incomingCall.id, "ignored");
    await resetCall();
  };

  const cancelOutgoing = async () => {
    const id = activeCall?.id;
    if (!id) return;
    await endCall(id, "canceled");
    await resetCall();
  };

  const hangup = async () => {
    const id = activeCall?.id || incomingCall?.id;
    if (id) await endCall(id, "ended");
    await resetCall();
  };

  // ---------------- UI STATES ----------------

  // Incoming ringing
  if (callPhase === "ringing_in" && incomingCall) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
        <div className="w-[360px] rounded-2xl bg-zinc-900 p-4 shadow-xl">
          <div className="text-lg font-semibold">Incoming call…</div>
          <div className="mt-1 text-sm text-zinc-300">
            {incomingCall?.caller_name
              ? `${incomingCall.caller_name} is calling you`
              : "Someone is calling you"}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-green-600 px-3 py-2"
              onClick={accept}
            >
              Accept
            </button>
            <button
              className="flex-1 rounded-xl bg-zinc-700 px-3 py-2"
              onClick={ignore}
            >
              Ignore
            </button>
            <button
              className="flex-1 rounded-xl bg-red-600 px-3 py-2"
              onClick={decline}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Outgoing ringing
  if (callPhase === "ringing_out") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
        <div className="w-[360px] rounded-2xl bg-zinc-900 p-4 shadow-xl">
          <div className="text-lg font-semibold">Calling…</div>
          <div className="mt-1 text-sm text-zinc-300">
            Waiting for the other person to answer
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-red-600 px-3 py-2"
              onClick={cancelOutgoing}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // In call
  if (callPhase === "in_call") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
        <div className="w-[360px] rounded-2xl bg-zinc-900 p-4 shadow-xl">
          <div className="text-lg font-semibold">In call</div>
          <div className="mt-1 text-sm text-zinc-300">
            Audio call in progress…
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-red-600 px-3 py-2"
              onClick={hangup}
            >
              End call
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
