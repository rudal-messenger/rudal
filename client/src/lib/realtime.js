import { supabase } from "../../supabaseClient";

function makePeerConnection() {
  return new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
}

export async function startCallerWebRTC({ userId, calleeId, calleeName }) {
  console.log("[CALL] startCallerWebRTC()", { userId, calleeId });

  if (!userId || !calleeId) {
    console.error("[CALL] Missing userId or calleeId");
    return;
  }
  if (userId === calleeId) {
    console.error("[CALL] calleeId equals userId (calling yourself) — wrong id");
    return;
  }

  const pc = makePeerConnection();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const payload = {
    caller_id: userId,
    callee_id: calleeId,
    status: "ringing",
    offer: pc.localDescription,
  };

  console.log("[CALL] inserting into calls:", payload);

  const { data: call, error } = await supabase
    .from("calls")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("[CALL] INSERT FAILED:", error);
    throw error;
  }

  console.log("[CALL] INSERT OK:", call);
  return { callId: call.id, pc };
}
