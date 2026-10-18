import { supabase } from "../../supabaseClient";

let pc;

export function startCall(stream) {

  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  });

  // handlers AFTER creation
  pc.oniceconnectionstatechange = () => {
    console.log("ICE state:", pc.iceConnectionState);
  };

  pc.ontrack = (event) => {
    const remoteVideo = document.getElementById("rudal-remote-video");
    remoteVideo.srcObject = event.streams[0];
  };

  pc.ontrack = (event) => {
  const remoteVideo = document.getElementById("rudal-remote-video");

  if (!remoteVideo) return;

  const stream = event.streams[0];
  remoteVideo.srcObject = stream;

  const track = stream.getVideoTracks()[0];

  if (track) {
    track.onmute = () => {
      console.log("Remote camera muted");
      remoteVideo.style.backgroundColor = "black";
    };

    track.onunmute = () => {
      console.log("Remote camera unmuted");
      remoteVideo.style.backgroundColor = "transparent";
    };
  }
};

  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream);
  });
}

// ---- small helper: wait until ICE gathering is complete ----
function waitIceComplete(pc) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer;

    const finish = () => {
      if (finished) return;
      finished = true;

      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);

      if (pc.signalingState === "closed") {
        reject(new Error("Call connection was closed"));
        return;
      }

      const candidates =
        pc.localDescription?.sdp?.match(/^a=candidate:/gm) || [];

      console.log("[CALL] ICE gathering finished", {
        state: pc.iceGatheringState,
        candidates: candidates.length,
      });

      if (candidates.length === 0) {
        reject(new Error("No connection addresses were found"));
        return;
      }

      resolve();
    };

    const check = () => {
      if (pc.iceGatheringState === "complete") {
        finish();
      }
    };

    pc.addEventListener("icegatheringstatechange", check);

    // Publish the candidates gathered so far after five seconds.
    timer = setTimeout(finish, 5000);

    check();
  });
}

function stopStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {}
}

function safeClosePC(pc) {
  if (!pc) return;
  try {
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.oniceconnectionstatechange = null;
    pc.onsignalingstatechange = null;
    pc.close();
  } catch {}
}

function attachRemoteAudio(pc) {
  pc.ontrack = (e) => {
    const remoteStream = e.streams?.[0];
    if (!remoteStream) return;

    const video = document.getElementById("rudal-remote-video");

    if (video) {
      video.srcObject = remoteStream;
      video.play().catch(() => {});
    }
  };

  pc.oniceconnectionstatechange = () =>
    console.log("[CALL] ice:", pc.iceConnectionState);

  pc.onconnectionstatechange = () =>
    console.log("[CALL] conn:", pc.connectionState);

  pc.onsignalingstatechange = () =>
    console.log("[CALL] sig:", pc.signalingState);
}

function setupCameraState(pc) {
  pc.rudalLocalCameraEnabled = false;
  pc.rudalRemoteCameraEnabled = false;

  // Both sides create this channel with the same ID.
  const channel = pc.createDataChannel("rudal-camera", {
    negotiated: true,
    id: 0,
  });

  pc.rudalCameraChannel = channel;

  channel.onopen = () => {
    channel.send(JSON.stringify({
      cameraEnabled: pc.rudalLocalCameraEnabled,
    }));
  };

  channel.onmessage = ({ data }) => {
    try {
      const message = JSON.parse(data);

      if (typeof message.cameraEnabled !== "boolean") return;

      pc.rudalRemoteCameraEnabled = message.cameraEnabled;

      window.dispatchEvent(
        new CustomEvent("rudal:remote-camera", {
          detail: { pc, enabled: message.cameraEnabled },
        })
      );
    } catch {
      // Ignore invalid messages.
    }
  };
}

export function setCallCamera(pc, enabled) {
  if (!pc || pc.connectionState === "closed") return;

  const tracks = pc.getSenders()
    .map((sender) => sender.track)
    .filter((track) =>
      track?.kind === "video" && track.readyState === "live"
    );

  if (!tracks.length) {
    throw new Error("No camera track is available");
  }

  tracks.forEach((track) => {
    track.enabled = enabled;
  });

  pc.rudalLocalCameraEnabled = enabled;

  const channel = pc.rudalCameraChannel;

  if (channel?.readyState === "open") {
    channel.send(JSON.stringify({ cameraEnabled: enabled }));
  }
}
  
function makePeerConnection() {
  const pc = new RTCPeerConnection({
    // NOTE: STUN-only is fragile on real NATs. We'll add TURN later.
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  attachRemoteAudio(pc);
  setupCameraState(pc);
  return pc;
}

/**
 * CALLER: user clicked "Call"
 * - captures mic (caller initiated)
 * - inserts row into public.calls with status=ringing and offer
 * - waits for callee answer and status accepted
 */
export async function startCallerWebRTC({
  userId,
  calleeId,
  chatId,
  callerName,
  callerAvatar,
  onEnded,
  onConnected,
  startWithVideo = false,
} = {}) {


  console.log("[CALL] startCallerWebRTC", { userId, calleeId });

  if (!userId || !calleeId) throw new Error("Missing userId/calleeId");
  if (userId === calleeId) throw new Error("calleeId equals userId");

  const pc = makePeerConnection();

  let localStream = null;

try {
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });

  localStream.getVideoTracks().forEach((track) => {
  track.enabled = startWithVideo;
});

pc.rudalLocalCameraEnabled = startWithVideo;
} catch (err) {
  safeClosePC(pc);
  throw err;
}

localStream.getTracks().forEach((track) => {
  pc.addTrack(track, localStream);
});

const localVideo = document.getElementById("rudal-local-video");
if (localVideo) {
  localVideo.srcObject = localStream;
}

  // Create offer
  const offer = await pc.createOffer();
await pc.setLocalDescription(offer);


pc.addEventListener("connectionstatechange", () => {
  if (pc.connectionState === "connected") {
    onConnected?.();
  }
});

  // Insert call row
  const { data: call, error } = await supabase
    .from("calls")
    .insert({
      caller_id: userId,
      callee_id: calleeId,
      status: "ringing",
      offer: {
  ...pc.localDescription.toJSON(),
  icePending: true,
},
      chat_id: chatId, // ✅
    })
    .select("*")
    .single();

  if (error) {
    console.error("[CALL] INSERT FAILED:", error);
    stopStream(localStream);
    safeClosePC(pc);
    throw error;
  }

  console.log("[CALL] INSERT OK:", call);

  let remoteSet = false;

  // Subscribe to updates for answer / status
  const ch = supabase
    .channel(`call-${call.id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `id=eq.${call.id}`,
      },
      async (payload) => {
        const updated = payload.new;

        // ✅ FIX: callee now sets status accepted; caller will reliably connect
        if (updated.status === "accepted" && updated.answer && !remoteSet) {
  remoteSet = true;
  console.log("[CALL] got accepted+answer, connecting...");
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(updated.answer));
  } catch (e) {
    console.error("[CALL] setRemoteDescription failed:", e);
  }
}


        if (
          ["declined", "ignored", "missed", "canceled", "ended"].includes(
            updated.status
          )
        ) {
          console.log("[CALL] call ended:", updated.status);

          // ✅ FIX: stop mic + close pc
          stopStream(localStream);
          safeClosePC(pc);

          supabase.removeChannel(ch);
          onEnded?.(updated.status);
        }
      }
    )
    .subscribe();

  // Missed call timeout (30s)
  setTimeout(async () => {
    const { data } = await supabase
      .from("calls")
      .select("status")
      .eq("id", call.id)
      .single();

    if (data?.status === "ringing") {
      await supabase.from("calls").update({ status: "missed" }).eq("id", call.id);
    }
  }, 30000);

  // The call is already saved and ringing.
// Finish gathering and publish the complete offer in the background.
void (async () => {
  try {
    await waitIceComplete(pc);

    if (pc.signalingState === "closed") return;

    const { error } = await supabase
      .from("calls")
      .update({
        offer: pc.localDescription.toJSON(),
      })
      .eq("id", call.id)
      .eq("status", "ringing");

    if (error) throw error;

    console.log("[CALL] complete offer saved");
  } catch (error) {
    console.error("[CALL] preparing connection failed:", error);

    stopStream(localStream);
    safeClosePC(pc);
    await supabase.removeChannel(ch);

    try {
      await endCall(call.id, "ended");
    } catch (endError) {
      console.error("[CALL] ending failed:", endError);
    }

    onEnded?.("ended");
  }
})();

  return { callId: call.id, pc, localStream };
}

/**
 * CALLEE: call this ONLY after user pressed "Accept"
 * - captures mic after accept
 * - writes answer + status=accepted to DB  ✅ FIX
 */

async function getReadyOffer(callId) {
  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("calls")
      .select("offer, status")
      .eq("id", callId)
      .single();

    if (error) throw error;

    if (data.status !== "ringing") {
      throw new Error("This call is no longer ringing");
    }

    if (data.offer && !data.offer.icePending) {
      return data.offer;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Preparing the call took too long");
}

export async function startCalleeWebRTC(
  call,
  { onConnected } = {}
) {
  if (!call?.id || !call?.offer) {
    throw new Error("Missing call or offer");
  }

  const pc = makePeerConnection();
  let localStream = null;

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "connected") {
      onConnected?.();
    }
  });

  try {
    console.log("[CALL] Accept: waiting for completed offer");

    const readyOffer = await getReadyOffer(call.id);

    await pc.setRemoteDescription(
      new RTCSessionDescription(readyOffer)
    );

    console.log("[CALL] Accept: requesting microphone and camera");

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    // Start with the camera disabled.
localStream.getVideoTracks().forEach((track) => {
  track.enabled = false;
});



    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    const localVideo =
      document.getElementById("rudal-local-video");

    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    console.log("[CALL] Accept: creating answer");

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);

    const { data, error } = await supabase
      .from("calls")
      .update({
        answer: pc.localDescription.toJSON(),
        status: "accepted",
      })
      .eq("id", call.id)
      .eq("status", "ringing")
      .select("id, status")
      .single();

    if (error) throw error;
    if (!data) throw new Error("Call could not be accepted");

    console.log("[CALL] answer saved:", data.id);

    return { pc, localStream };
  } catch (error) {
    stopStream(localStream);
    safeClosePC(pc);
    throw error;
  }
}

export async function endCall(callId, status = "ended") {
  if (!callId) return;

  const { error } = await supabase
    .from("calls")
    .update({ status })
    .eq("id", callId);

  if (error) throw error;
}