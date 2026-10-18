import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useImperativeHandle,
  forwardRef
} from "react";
import { supabase } from "../supabaseClient";
import "../styles/Chat.css";
import "../styles/Call.css";
import {
  getDirectChatKey,
  encryptMessageV2,
  decryptMessageV2,
  getMessageEncryptionVersion,
} from "../utils/e2ee";
import { startCallerWebRTC } from "./calls/webrtc"; 
import { useCall } from "../context/CallContext";
import { isFlyrChat } from "../utils/flyr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";







/**
 * Rudal ChatWindow
 * - Messaging (load, realtime, optimistic)
 * - Group usernames above bubbles
 * - Typing indicator
 * - Audio-only calls (offer/answer/ICE)
 * - Safe ICE queuing to fix call connection
 */
const ChatWindow = forwardRef(function ChatWindow(
  {
    chat,
    me,
    profiles,
    statusMap,
    onlineIds,
    onAddPeople,
    onBack,
  },
  ref
){

const isFlyr = isFlyrChat(chat);

const [flyrBusy, setFlyrBusy] = useState(false);
const [flyrError, setFlyrError] = useState("");

const flyrSending = useRef(false);
const flyrPending = useRef(null);
const currentChatId = useRef(chat?.id);

currentChatId.current = chat?.id;

useEffect(() => {
  setFlyrError("");
}, [chat?.id]);

  const [showCard, setShowCard] = useState(false);
  const [cardPos, setCardPos] = useState({ x: 0, y: 0 });
  const [e2eeFailed, setE2eeFailed] = useState(false);
  const [groupName, setGroupName] = useState(chat?.name || "");
const [groupAvatarFile, setGroupAvatarFile] = useState(null);
const hoverTimeout = useRef(null);
const [showBlockConfirm, setShowBlockConfirm] = useState(false);
const [blockedBy, setBlockedBy] = useState(chat?.blocked_by || null);
const iBlockedThem = blockedBy === me?.id;
const theyBlockedMe = blockedBy && blockedBy !== me?.id;
const isBlocked = !isFlyr && !!blockedBy;
const [showBlockedInfo, setShowBlockedInfo] = useState(false);




const { setActiveCall, setCallPhase, resetCall, pcRef, localStreamRef } = useCall();

const getBlockState = (meId, otherId, blockedList) => {
  const blockedByMe = blockedList.some(
    (b) => b.blocker_id === meId && b.blocked_id === otherId
  );

  const blockedMe = blockedList.some(
    (b) => b.blocker_id === otherId && b.blocked_id === meId
  );

  return { blockedByMe, blockedMe };
};

useEffect(() => {
  if (!chat?.id) return;

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", chat.id);

    if (error) {
      console.error("Failed to fetch members:", error);
      return;
    }

    // convert to { id: ... }
    const formatted = data.map((m) => ({
      id: m.user_id,
    }));

    setMembers(formatted);
  };

  fetchMembers();
}, [chat?.id]);

useEffect(() => {
  setE2eeFailed(false);
}, [chat?.id]);

useEffect(() => {
  if (!chat?.id) return;

  const fetchBlock = async () => {
    const { data } = await supabase
      .from("chats")
      .select("blocked_by")
      .eq("id", chat.id)
      .single();

    if (data) setBlockedBy(data.blocked_by);
  };

  fetchBlock();

  const chan = supabase
    .channel(`chat-block:${chat.id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "chats",
        filter: `id=eq.${chat.id}`,
      },
      (payload) => {
        setBlockedBy(payload.new.blocked_by);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(chan);
}, [chat?.id]);


const handleDecline = async () => {
  if (!chat?.id || !me?.id) return;

  const { error } = await supabase
    .from("chats")
    .update({
      blocked_by: me.id,
    })
    .eq("id", chat.id);

  if (error) {
    console.error("decline failed", error);
    return;
  }

  window.dispatchEvent(new Event("rudal-chat-created"));
};



const handleAccept = async () => {
  if (!chat?.id) return;

  await supabase
    .from("chats")
    .update({ chat_status: "accepted" })
    .eq("id", chat.id);

  // 🔥 reload chats (same as SidebarLeft)
  window.dispatchEvent(new Event("rudal-chat-created"));
};

const handleBlockUser = async () => {
  if (!chat?.id || !me?.id) return;

  const { error } = await supabase
    .from("chats")
    .update({
      blocked_by: me.id,
    })
    .eq("id", chat.id);

  if (error) {
    console.error("❌ BLOCK FAILED:", error);
    alert("Block failed: " + error.message);
    return; // ⛔ STOP HERE → no reload
  }

  console.log("✅ BLOCK SUCCESS");

  setShowBlockConfirm(false);

  // ✅ reload AFTER success
  window.dispatchEvent(new Event("rudal-chat-created"));
};
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [sharedKey, setSharedKey] = useState(null);
  const endRef = useRef(null);
const isRequest =
  !isFlyr &&
  !chat.is_group &&
  chat?.chat_status === "pending" &&
  chat?.initiator_id !== me?.id;
const [showManage, setShowManage] = useState(false);
const [closingManage, setClosingManage] = useState(false);

const isGroup = chat?.is_group;

const hasAvailableMember =
  chat.is_group
    ? members.length === 0
      ? true   // allow until loaded
      : members.some(m => m.id !== me.id)
    : false;



const canMessageGroup =
  chat.is_group &&
  members.some(m => {
    if (m.id === me.id) return false;

    return !(
      blockedBy === me.id &&
      m.id !== me.id
    );
  });


  // Realtime channels
  const msgsChanRef = useRef(null);
  const typingChanRef = useRef(null);
  const callChanRef = useRef(null);

  // Safe detection of 1:1 chat partner
let otherUser = chat?.other || null;

if ((!otherUser?.id) && members.length) {
  const member = members.find(m => m.id !== me?.id);

  if (member) {
    otherUser = member;
  }
}
  







// ---------- E2EE V2: Load/create per-chat key ----------
useEffect(() => {
  if (!chat?.id || chat.is_group || isFlyr) {
  setSharedKey(null);
  return;
}

  if (!me?.id || !otherUser?.id) {
    setSharedKey(null);
    return;
  }

  let cancelled = false;

  (async () => {
    try {
      setSharedKey(null);
      setE2eeFailed(false);

      const key = await getDirectChatKey(
        chat.id,
        me.id,
        otherUser.id
      );

      if (cancelled) return;

      setSharedKey(key);

      console.log(
        "🔐 E2EE V2 chat key ready:",
        chat.id
      );
    } catch (err) {
      if (cancelled) return;

      console.error(
        "🔐 E2EE V2 unavailable:",
        err
      );

      setSharedKey(null);
      setE2eeFailed(true);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [
  chat?.id,
  chat?.is_group,
  isFlyr,
  me?.id,
  otherUser?.id
]);
  useImperativeHandle(ref, () => ({
    endCall: () => endCall(),
  }));

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
  if (!chat?.id || !chat.is_group) return;

  (async () => {
    const { data } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", chat.id);

    if (!data) return;

    const enriched = await Promise.all(
      data.map(async (m) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, avatar")
          .eq("id", m.user_id)
          .single();

        return {
          id: m.user_id,
          username: profile?.username,
          avatar: profile?.avatar,
        };
      })
    );

    setMembers(enriched);
  })();
}, [chat?.id]);

  // ---------- Load message history ----------
useEffect(() => {
  if (!chat?.id) return;

  let cancelled = false;

  (async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, chat_id, from_id, content, created_at, encryption_version, encryption_algorithm, key_version"
      )
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true });

    if (cancelled) return;

    if (error) {
      console.error("Message load error:", error.message);
      setMessages([]);
      setLoading(false);
      return;
    }

    // Groups are still using the existing group path for now.
    if (chat.is_group) {
      const enriched = await Promise.all(
        (data || []).map(async (m) => {
          const { data: sender } = await supabase
            .from("profiles")
            .select("username, avatar")
            .eq("id", m.from_id)
            .single();

          return { ...m, sender };
        })
      );

      if (!cancelled) {
        setMessages(enriched);
        setLoading(false);
      }

      return;
    }

    const out = [];
    let v2Failure = false;

    for (const m of data || []) {
      const version =
        m.encryption_version ||
        getMessageEncryptionVersion(m.content);

      // Existing plaintext message
      if (version === 0) {
        out.push(m);
        continue;
      }

      // Legacy Rudal V1.
      // IMPORTANT: don't destroy/modify it.
      if (version === 1) {
        out.push({
          ...m,
          content: "[LEGACY ENCRYPTED MESSAGE]",
          _legacyEncrypted: true,
        });

        continue;
      }

      // Rudal E2EE V2
      if (version === 2) {
        if (!sharedKey) {
          v2Failure = true;

          out.push({
            ...m,
            content: "[UNREADABLE MESSAGE]",
          });

          continue;
        }

        try {
          const plain = await decryptMessageV2(
            sharedKey,
            m.content
          );

          out.push({
            ...m,
            content: plain,
          });
        } catch (err) {
          console.error(
            "[E2EE] Message decrypt failed:",
            err
          );

          v2Failure = true;

          out.push({
            ...m,
            content: "[UNREADABLE MESSAGE]",
          });
        }

        continue;
      }

      out.push({
        ...m,
        content: "[UNSUPPORTED ENCRYPTED MESSAGE]",
      });
    }

    if (!cancelled) {
      setE2eeFailed(v2Failure);
      setMessages(out);
      setLoading(false);
    }
  })();

  return () => {
    cancelled = true;
    setMessages([]);
  };
}, [
  chat?.id,
  chat?.is_group,
  sharedKey
]);

  // ---------- Realtime inserts ----------
useEffect(() => {
  if (!chat?.id) return;

  if (msgsChanRef.current) {
    supabase.removeChannel(msgsChanRef.current);
  }

  const chan = supabase
    .channel(`chat:${chat.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `chat_id=eq.${chat.id}`,
      },
      async ({ new: row }) => {
        let finalRow = row;

        // Direct message
        if (!chat.is_group) {
          const version =
            row.encryption_version ||
            getMessageEncryptionVersion(row.content);

          if (version === 1) {
            finalRow = {
              ...row,
              content: "[LEGACY ENCRYPTED MESSAGE]",
              _legacyEncrypted: true,
            };
          }

          if (version === 2) {
            if (!sharedKey) {
              console.error(
                "[E2EE] Received V2 message without chat key"
              );

              setE2eeFailed(true);

              finalRow = {
                ...row,
                content: "[UNREADABLE MESSAGE]",
              };
            } else {
              try {
                const plain = await decryptMessageV2(
                  sharedKey,
                  row.content
                );

                finalRow = {
                  ...row,
                  content: plain,
                };
              } catch (err) {
                console.error(
                  "[E2EE] Realtime decrypt failed:",
                  err
                );

                setE2eeFailed(true);

                finalRow = {
                  ...row,
                  content: "[UNREADABLE MESSAGE]",
                };
              }
            }
          }
        }

        setMessages((prev) => {
          // ID check is enough for the actual DB row.
          if (prev.some((m) => m.id === finalRow.id)) {
            return prev;
          }

          if (chat.is_group) {
            supabase
              .from("profiles")
              .select("username, avatar")
              .eq("id", finalRow.from_id)
              .single()
              .then(({ data: sender }) => {
                setMessages((current) => {
                  if (
                    current.some(
                      (m) => m.id === finalRow.id
                    )
                  ) {
                    return current;
                  }

                  return [
                    ...current,
                    {
                      ...finalRow,
                      sender,
                    },
                  ];
                });
              });

            return prev;
          }

          return [...prev, finalRow];
        });
      }
    )
    .subscribe();

  msgsChanRef.current = chan;

  return () => {
    supabase.removeChannel(chan);

    if (msgsChanRef.current === chan) {
      msgsChanRef.current = null;
    }
  };
}, [
  chat?.id,
  chat?.is_group,
  sharedKey
]);

  // ---------- Typing indicator ----------
  useEffect(() => {
    if (!chat?.id) return;
    if (typingChanRef.current) supabase.removeChannel(typingChanRef.current);

    const typingChan = supabase.channel(`typing:${chat.id}`, {
      config: { broadcast: { self: true } },
    });

    typingChan.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.from === me?.id) return;
      setTypingUsers((prev) =>
        prev.includes(payload.username) ? prev : [...prev, payload.username]
      );
      setTimeout(
        () =>
          setTypingUsers((prev) =>
            prev.filter((u) => u !== payload.username)
          ),
        2500
      );
    });

    typingChan.subscribe();
    typingChanRef.current = typingChan;
    return () => supabase.removeChannel(typingChan);
  }, [chat?.id, me?.id]);

  const sendTyping = () => {
    if (!typingChanRef.current) return;
    typingChanRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { from: me.id, username: me.username },
    });
  };

  const handleInput = (e) => {
  setText(e.target.value);

  if (!isFlyr) {
    sendTyping();
  }
};

  // ---------- Send message ----------
const sendMessage = async () => {
  const trimmed = text.trim();

  if (!trimmed || !me?.id || !chat?.id) return;
  if (isBlocked) return;

  if (isFlyr) {
  if (flyrSending.current) return;

  if (trimmed.length > 8000) {
    setFlyrError(
      "Please keep your message under 8,000 characters."
    );
    return;
  }

  flyrSending.current = true;
  setFlyrBusy(true);
  setFlyrError("");

  const chatId = chat.id;
  const pending = flyrPending.current;

  const requestId =
    pending?.chatId === chatId &&
    pending.text === trimmed
      ? pending.requestId
      : crypto.randomUUID();

  flyrPending.current = {
    chatId,
    text: trimmed,
    requestId,
  };

  try {
    const { data, error } = await supabase.functions.invoke(
      "flyr-chat",
      {
        body: {
          chatId,
          text: trimmed,
          requestId,
        },
      }
    );

    if (error || data?.error) {
      let detail = data?.error;

      if (!detail && error?.context?.json) {
        try {
          detail = (await error.context.json()).error;
        } catch {
          // Standardfehlermeldung verwenden.
        }
      }

      throw new Error(
        detail ||
        error?.message ||
        "Flyr could not answer."
      );
    }

    flyrPending.current = null;

    if (currentChatId.current !== chatId) return;

    setMessages((prev) => {
      const merged = new Map(
        prev.map((m) => [m.id, m])
      );

      for (const message of data.messages || []) {
        merged.set(message.id, message);
      }

      return [...merged.values()].sort(
        (a, b) =>
          new Date(a.created_at) -
          new Date(b.created_at)
      );
    });

    setText((current) =>
      current.trim() === trimmed ? "" : current
    );
  } catch (err) {
    if (currentChatId.current === chatId) {
      setFlyrError(err.message);
    }
  } finally {
    flyrSending.current = false;
    setFlyrBusy(false);
  }

  return;
}

  let contentToStore = trimmed;
  let encryptionVersion = null;
  let encryptionAlgorithm = null;
  let keyVersion = null;

  // ==========================================================
  // DIRECT MESSAGE — E2EE REQUIRED
  // ==========================================================

  if (!chat.is_group && !isFlyr) {
    // FAIL CLOSED.
    // A direct message must NEVER fall back to plaintext.
    if (!sharedKey) {
      console.error(
        "[E2EE] Sending blocked: no V2 chat key"
      );

      setE2eeFailed(true);
      return;
    }

    try {
      contentToStore = await encryptMessageV2(
        sharedKey,
        trimmed
      );

      encryptionVersion = 2;
      encryptionAlgorithm = "AES-256-GCM";
      keyVersion = 1;
    } catch (err) {
      console.error(
        "[E2EE] Encryption failed. Message NOT sent:",
        err
      );

      setE2eeFailed(true);
      return;
    }
  }

  // Encryption succeeded before optimistic rendering.
  const tempId = `tmp-${Date.now()}`;

  const optimistic = {
    id: tempId,
    chat_id: chat.id,
    from_id: me.id,
    content: trimmed,
    created_at: new Date().toISOString(),
    encryption_version: encryptionVersion,
    encryption_algorithm: encryptionAlgorithm,
    key_version: keyVersion,
    _optimistic: true,
  };

  setMessages((prev) => [
    ...prev,
    optimistic,
  ]);

  setText("");

  const insertPayload = {
    chat_id: chat.id,
    from_id: me.id,
    content: contentToStore,
  };

  if (!chat.is_group) {
    insertPayload.encryption_version =
      encryptionVersion;

    insertPayload.encryption_algorithm =
      encryptionAlgorithm;

    insertPayload.key_version =
      keyVersion;
  }

  const { data, error } = await supabase
    .from("messages")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error(
      "send error:",
      error.message
    );

    setMessages((prev) =>
      prev.filter((m) => m.id !== tempId)
    );

    // Restore the user's text because it wasn't sent.
    setText((current) =>
      current ? current : trimmed
    );

    return;
  }

  setE2eeFailed(false);

  if (chat.is_group) {
    const { data: sender } = await supabase
      .from("profiles")
      .select("username, avatar")
      .eq("id", data.from_id)
      .single();

    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? {
              ...data,
              content: trimmed,
              sender,
            }
          : m
      )
    );
  } else {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? {
              ...data,
              content: trimmed,
            }
          : m
      )
    );
  }
};

const handleKey = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};



// ---------- CALLS (audio-only) ----------
// OLD BROADCAST CALL SYSTEM REMOVED.
// Calls are handled via DB calls table + IncomingCallModal.
useEffect(() => {
  return () => {};
}, [chat?.id, me?.id]);




    

  const createPeer = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pc.onicecandidate = (e) => {
      if (e.candidate && callChanRef.current) {
        callChanRef.current.send({
          type: "broadcast",
          event: "ice",
          payload: { candidate: e.candidate, from: me.id },
        });
      }
    };
    return pc;
  };

const startVoiceCall = async ({ video = false } = {}) => {
  if (chat?.is_group || isFlyr) return;
  if (isBlocked) return;

  const userId = me?.id;
  if (!userId || !chat?.id) {
    console.error("[CALL] Missing me.id or chat.id");
    return;
  }

  let calleeId = null;

  // 1) Try from chat object if available
  calleeId =
    chat?.other?.id ||
    otherUser?.id ||
    (Array.isArray(chat?.members)
      ? chat.members.find((m) => m.id && m.id !== userId)?.id
      : null);

  // 2) Fallback: fetch from DB (guaranteed)
  if (!calleeId) {
    console.log("[CALL] calleeId missing in chat object, fetching from DB…");

    // change table name if yours differs:
    // common: chat_members, conversation_members, members
    const { data, error } = await supabase
      .from("chat_members")     // <-- IMPORTANT: if your table name differs, change here
      .select("user_id")
      .eq("chat_id", chat.id);

    if (error) {
      console.error("[CALL] chat_members fetch failed:", error);
      return;
    }

    const ids = (data || []).map((r) => r.user_id);
    calleeId = ids.find((id) => id !== userId) || null;
  }

  console.log("[UI] startVoiceCall (DB)", { userId, calleeId, chatId: chat.id });

  if (!calleeId) {
    console.error("[CALL] Still no calleeId. Your members table name/columns may differ.");
    return;
  }
  if (calleeId === userId) {
    console.error("[CALL] calleeId == userId (bad members data)");
    return;
  }

  try {
  setCallPhase("ringing_out");

  const { callId, pc, localStream } = await startCallerWebRTC({
  userId,
  calleeId,
  chatId: chat.id, // ✅
  startWithVideo: video,
  onConnected: () => setCallPhase("in_call"),
  onEnded: async () => resetCall(),
});


  pcRef.current = pc;
  localStreamRef.current = localStream;

  setActiveCall({
  id: callId,
  caller_id: userId,
  callee_id: calleeId,
  chatId: chat.id, // ✅ THIS is required for the overlay chat button
});

} catch (e) {
  console.error("[CALL] startCallerWebRTC failed:", e);
  await resetCall();
}


};





  

  const endCall = () => {
    try {
      localStream?.getTracks()?.forEach((t) => t.stop());
      pcRef.current?.close();
    } catch {}
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
    setBusyDuringCall && setBusyDuringCall(false);
  };

  // ---------- RENDER ----------
  if (!chat) return <div className="empty-chat">Select a chat to start messaging</div>;

console.log("CHAT OBJECT:", chat);
console.log("CHAT:", chat);
console.log("CHAT OTHER:", JSON.stringify(chat?.other, null, 2));
console.log("MEMBERS:", members);
console.log("ME:", me?.id);

let otherId = null;

// 1. try chat (if already fixed somewhere)
if (chat?.other?.id) {
  otherId = chat.other.id;
}

// 2. fallback to members (when loaded)
if (!otherId && members?.length) {
  const other = members.find(m => m.id !== me?.id);
  otherId = other?.id;
}

const isOnline = onlineIds?.has(otherId);

const realtimeStatus = !isOnline
  ? "offline"
  : (statusMap?.[otherId] || "online");



// DEBUG
console.log("FINAL OTHER ID:", otherId);

console.log("STATUS MAP FULL:", statusMap);



console.log("STATUS CHECK:", {
  otherId,
  raw: statusMap?.[otherId],
  isOnline
});

console.log("FINAL FINAL DEBUG:", {
  chatName: chat?.name,
  profiles: profiles?.map(p => p.username),
  otherId,
  statusMap,
  isOnline
});
    



const statusText = {
  online: "Available",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
};



  return (
  <>


<div
  className={`chat-window ${isFlyr ? "flyr-chat-background" : ""}`}
  style={
    isFlyr
      ? {
          backgroundImage: `url("${import.meta.env.BASE_URL}flyr-chat-bg.png")`,
        }
      : undefined
  }
>      {/* HEADER */}
      
      <div className="chat-header">

        <button
  type="button"
  className="mobile-chat-back"
  onClick={onBack}
  aria-label="Back to chat list"
>
  ←
</button>

  <div
    className="chat-header-avatar-wrapper"
    style={{ position: "relative" }}
    onMouseEnter={(e) => {
      clearTimeout(hoverTimeout.current);

      const rect = e.currentTarget.getBoundingClientRect();

      setCardPos({
  x: rect.right + 12,
  y: rect.top || 80, // 👈 fallback prevents 0 bug
    });

      setShowCard(true);
    }}
    onMouseLeave={() => {
      hoverTimeout.current = setTimeout(() => {
        setShowCard(false);
      }, 250);
    }}
  >
    <img
      src={chat.avatar}
      alt={chat.name}
      className="chat-header-avatar"
    />

{showCard && !isFlyr && !chat.is_group && chat.other && (
      <div
        className="hover-card"
        style={{
          position: "fixed",
          top: cardPos.y,
          left: cardPos.x,
          zIndex: 9999,
        }}
        onMouseEnter={() => {
          clearTimeout(hoverTimeout.current);
          setShowCard(true);
        }}
        onMouseLeave={() => {
          hoverTimeout.current = setTimeout(() => {
            setShowCard(false);
          }, 250);
        }}

        
      >
        <img src={chat.other.avatar} className="hover-card-avatar" />

        <div className="hover-card-name">
          {chat.other.username}
        </div>

        <div className="hover-card-phone">
          {chat.other.phone_number || "No number"}
        </div>

        <div className="hover-card-status">
         <span className={`dot ${realtimeStatus}`} />
{statusText[realtimeStatus]}
        </div>

        <div className="hover-card-buttons">
          <button onClick={startVoiceCall}>📞 Call</button>
          <button
    className="block-btn"
    onClick={() => setShowBlockConfirm(true)}
  >
    🚫 Block
  </button>
        </div>
      </div>
      
    )}
  </div>

  {/* ✅ MOVE THESE BACK INSIDE */}
  <div className="chat-header-info">
    <div className="chat-header-name">{chat.name}</div>
    {!isFlyr && (
  <div className="chat-header-status">
    {chat.is_group ? (
      <span>{members.length} members</span>
    ) : (
      <>
        <span className={`status-dot ${realtimeStatus}`} />
        <span>{statusText[realtimeStatus]}</span>
      </>
    )}
  </div>
)}
  </div>

    <div className="chat-header-buttons">
  {chat.is_group && !isBlocked && (
    <button className="manage-btn" onClick={() => setShowManage(true)}>
      ⚙️
    </button>
  )}

  {!isFlyr && !isRequest && !chat.is_group && !isBlocked && (
  <button
    type="button"
    className="call-btn"
    title="Start video call"
    aria-label="Start video call"
    onClick={() => startVoiceCall({ video: true })}
  >
    📹
  </button>
)}

{!isFlyr && !isRequest && !chat.is_group && !isBlocked && (
    <button className="call-btn" onClick={startVoiceCall}>📞</button>
  )}

{!isFlyr && !isRequest && !isBlocked && (    <button className="add-btn" onClick={onAddPeople}>➕</button>
  )}
  </div>

</div>  {/* ✅ CLOSE HERE, NOT EARLIER */}

      

      {e2eeFailed && !chat.is_group && !isFlyr && (
  <div className="e2ee-warning">
    ⚠️ End-to-End Encryption is currently unavailable.
    Sending is disabled until the secure connection is restored.
  </div>
)}


      {/* MESSAGES */}

    {/* MESSAGES */}
<div className="messages-container">
  {loading ? (
    <div className="loading-msgs">Loading…</div>
  ) : messages.length === 0 ? (
    <div className="no-messages">No messages yet.</div>
  ) : (
    messages.map((m) => (
      <div
        key={m.id}
        className={`message-bubble ${
          m.from_id === me?.id ? "you" : "other"
        }`}
      >
        {chat.is_group && m.from_id !== me?.id && (
          <div className="message-username">
            {m.sender?.username || "Unknown"}
          </div>
        )}

        <div
          className={`bubble-inner ${
            isFlyr && m.from_id !== me?.id ? "flyr-markdown" : ""
          }`}
        >
          {isFlyr && m.from_id !== me?.id ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
              {m.content || ""}
            </ReactMarkdown>
          ) : (
            m.content
          )}
        </div>
      </div>
    ))
  )}

  {typingUsers.length > 0 && (
    <div className="typing-indicator">
      {typingUsers.join(", ")} is typing
    </div>
  )}

  <div ref={endRef} />
</div>

      {isFlyr && (
  <div className="flyr-notice">
    Flyr is powered by Gemini. Messages in this chat are
    processed by Google and are not end-to-end encrypted.

    {flyrBusy && (
      <div role="status">
        Flyr is thinking…
      </div>
    )}

    {flyrError && (
      <div role="alert">
        {flyrError} Your message remains in the input;
        press Enter to retry.
      </div>
    )}
  </div>
)}

      {/* INPUT */}
      <div className={`input-bar ${isBlocked ? "blocked" : ""}`}>
  {isBlocked ? (
    <div className="blocked-banner">

      {iBlockedThem ? (
        <>
          <span>
            You blocked this user.
          </span>

          <button
            className="unblock-btn"
            onClick={async () => {
              const { error } = await supabase
                .from("chats")
                .update({
                  blocked_by: null,
                  chat_status: "pending",
                  initiator_id: me.id,
                })
                .eq("id", chat.id);

              if (error) {
                console.error("unblock failed", error);
                return;
              }

              window.dispatchEvent(new Event("rudal-chat-created"));
            }}
          >
            Send message request
          </button>
        </>
      ) : (
        <>
          <span>You cannot message this user.</span>

          <button
            className="link-btn"
            onClick={() => setShowBlockedInfo(true)}
          >
            Learn more
          </button>
        </>
      )}

    </div>
  ) : !isFlyr && !chat?.is_group && chat?.chat_status === "pending" ? (
    
    chat?.initiator_id === me?.id ? (
      <div className="request-bar">
        <span>Message request sent.</span>
      </div>
    ) : (
      <div className="request-bar">
        <span className="request-text">
          Accept this request to start chatting
        </span>

        <div className="request-buttons">
          <button className="accept-btn" onClick={handleAccept}>
            Accept
          </button>
          <button className="decline-btn" onClick={handleDecline}>
            Decline
          </button>
        </div>
      </div>
    )

  ) : (
    <textarea
  placeholder={
    e2eeFailed && !chat.is_group && !isFlyr
      ? "Waiting for secure connection…"
      : "Message…"
  }
  value={text}
  onChange={handleInput}
  onKeyDown={handleKey}
  disabled={
  (e2eeFailed && !chat.is_group && !isFlyr) ||
  (isFlyr && flyrBusy)
}
  rows={1}
/>
  )}
</div>



    {showManage && (
      <div
        className="manage-overlay"
        onClick={() => setShowManage(false)}
      >
        <div
          className="manage-modal"
          onClick={(e) => e.stopPropagation()}
        >

<h3>Group Settings</h3>

<label>Group Name</label>
<input
  type="text"
  value={groupName}
  onChange={(e) => setGroupName(e.target.value)}
  className="group-input"
/>

<label>Group Picture</label>
<input
  type="file"
  accept="image/*"
  onChange={(e) => setGroupAvatarFile(e.target.files[0])}
/>

<button
  type="button"
  className="save-btn"
  onClick={async () => {
    try {
      if (!me?.id || !chat?.id || !chat.is_group) return;

      let avatarUrl = chat.avatar;

      if (groupAvatarFile) {
        const extensions = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };

        const extension = extensions[groupAvatarFile.type];

        if (!extension) {
          throw new Error("Choose a JPG, PNG or WebP image.");
        }

        if (groupAvatarFile.size > 5 * 1024 * 1024) {
          throw new Error("The image must be smaller than 5 MB.");
        }

        const filePath =
          `${me.id}/groups/${chat.id}/` +
          `${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, groupAvatarFile, {
            contentType: groupAvatarFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicFile } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        avatarUrl = publicFile.publicUrl;
      }

      const { data: savedChat, error: saveError } = await supabase
        .from("chats")
        .update({
          title: groupName,
          avatar: avatarUrl,
        })
        .eq("id", chat.id)
        .eq("is_group", true)
        .select("id, avatar")
        .single();

      if (saveError) throw saveError;

      if (!savedChat) {
        throw new Error("The group picture could not be saved.");
      }

      setGroupAvatarFile(null);
      setShowManage(false);

      window.dispatchEvent(new Event("rudal-chat-created"));
    } catch (error) {
      console.error("[GROUP] Picture save failed:", error);
      alert(`Could not save group: ${error.message}`);
    }
  }}
>
  Save Changes
</button>

<hr />

          <h3>Manage Group</h3>

          <div className="member-list">
            {members.map((m) => (
              <div key={m.id} className="member-item">
                <img src={m.avatar} className="member-avatar" />

                <div className="member-name">{m.username}</div>

                {m.id !== me.id && (
                  <button
                    className="remove-btn"
                    onClick={async () => {
                      await supabase
                        .from("chat_members")
                        .delete()
                        .eq("chat_id", chat.id)
                        .eq("user_id", m.id);

                      setMembers((prev) =>
                        prev.filter((x) => x.id !== m.id)
                      );
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <hr />

          <button
            className="leave-btn"
            onClick={async () => {
              await supabase
                .from("chat_members")
                .delete()
                .eq("chat_id", chat.id)
                .eq("user_id", me.id);

              window.location.reload();
            }}
          >
            Leave Group
          </button>
        </div>
      </div>
    )}

    </div>

    {showBlockedInfo && (
  <div
    className="block-overlay"
    onClick={() => setShowBlockedInfo(false)}
  >
    <div
      className="block-modal"
      onClick={(e) => e.stopPropagation()}
    >
      <h3>Unable to message</h3>

      <p>
        You can't message this user because the account may have been deleted
        or they have blocked you.
      </p>

      <div className="block-buttons">
        <button onClick={() => setShowBlockedInfo(false)}>
          Close
        </button>
      </div>
    </div>
  </div>
)}

    {showBlockConfirm && (
  <div
    className="block-overlay"
    onClick={() => setShowBlockConfirm(false)}
  >
    <div
      className="block-modal"
      onClick={(e) => e.stopPropagation()}
    >
      <h3>Caution</h3>

      <p>
        Are you sure that you want to block this user? You will need to send a new message request to communicate
        with this person again.
      </p>

      <div className="block-buttons">
        <button
          className="cancel-btn"
          onClick={() => setShowBlockConfirm(false)}
        >
          Cancel
        </button>

        <button
          className="confirm-block-btn"
          onClick={handleBlockUser}
        >
          Block
        </button>
      </div>
    </div>

  </div>
)}
  </>
);
});




export default ChatWindow;

