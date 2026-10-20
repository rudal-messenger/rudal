import React, { useState, useEffect } from "react";
import "../styles/SidebarLeft.css";
import { supabase } from "../supabaseClient";
import useMediaSession from "../hooks/useMediaSession";
import MiniPlayer from "./MiniPlayer";
import chatIcon from "../assets/tabs/chat.png";
import chatIconSelected from "../assets/tabs/chat-selected.png";
import callsIcon from "../assets/tabs/calls.png";
import callsIconSelected from "../assets/tabs/calls-selected.png";
import { openOrCreateDm } from "./chat/chatRequests";
import {
  ensureFlyrChat,
  FLYR_USER_ID,
  isFlyrChat,
} from "../utils/flyr";
import requestsIcon from "../assets/tabs/requests.png";
import requestsIconSelected from "../assets/tabs/requests-selected.png";
import calendarIcon from "../assets/tabs/calendar.png";
import calendarIconSelected from "../assets/tabs/calendar-selected.png";
import keypadIcon from "../assets/tabs/keypad.png";





  async function updateStatus(newStatus) {
    await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", me.id);

    onStatusChange && onStatusChange(newStatus);
  }



export default function SidebarLeft({
   me,
   profiles = [],  // ← ADD THIS LINE
   chats = [],
   calls = [],
   calendar = [],
   activeChatId,
   onSelectChat,
   onOpenSettings,
   onStatusChange,
   onlineIds = new Set(),
   currentTab,
   setCurrentTab,
   onOpenDialPad,
}) {

  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [onlineMap, setStatusMap] = useState({});
const [searchText, setSearchText] = useState("");
const [users, setUsers] = useState([]);
const [searchResults, setSearchResults] = useState([]);



async function openOrCreateChatWith(user) {

  const meId = me?.id;
  const otherId = user?.id;

  console.log("DM FUNCTION INPUT:", meId, otherId);

  if (!meId || !otherId) {
  console.warn("DM skipped because ids missing", { meId, otherId });
  return { blocked: false };
}

  try {

    const res = await openOrCreateDm(meId, otherId);

    if (!res?.chatId) return;


    onSelectChat && onSelectChat({ id: res.chatId });

// 🔥 tell MainApp to reload chats
window.dispatchEvent(new Event("rudal-chat-created"));

    setCurrentTab("Chats");

  } catch (err) {
    console.error("openOrCreateChatWith failed:", err);
  }
}



// Safe lowercase to prevent crashes
const openOrCreateChat = async (targetUser) => {
  if (!me?.id || !targetUser?.id) return;

  const targetId = targetUser.id;

  if (targetId === FLYR_USER_ID) {
  const chatId = await ensureFlyrChat();

  onSelectChat?.(
    chats.find((c) => c.id === chatId) || {
      id: chatId,
      otherId: FLYR_USER_ID,
      name: "Flyr",
      is_group: false,
      chat_status: "accepted",
    }
  );

  setCurrentTab("Chats");
  return;
}

  // =========================
  // 1. BLOCK CHECK (HARD STOP)
  // =========================
  const { data: blocked } = await supabase
    .from("blocked_users")
    .select("*")
    .or(
      `and(blocker_id.eq.${me.id},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${me.id})`
    )
    .maybeSingle();

  if (blocked) {
    console.log("🚫 Blocked — cannot open chat");
    return;
  }

  // =========================
  // 2. FIND EXISTING CHAT
  // =========================
  const { data: myChats } = await supabase
    .from("chat_members")
    .select("chat_id")
    .eq("user_id", me.id);

  const chatIds = (myChats || []).map((c) => c.chat_id);

  if (chatIds.length > 0) {
    const { data: members } = await supabase
      .from("chat_members")
      .select("chat_id, user_id")
      .in("chat_id", chatIds);

    // group members by chat
    const chatMap = {};
    for (const m of members || []) {
      if (!chatMap[m.chat_id]) chatMap[m.chat_id] = [];
      chatMap[m.chat_id].push(m.user_id);
    }

    // find 1:1 chat
    const existingChatId = Object.entries(chatMap).find(
      ([chatId, users]) =>
        users.length === 2 &&
        users.includes(me.id) &&
        users.includes(targetId)
    )?.[0];

    if (existingChatId) {
      console.log("✅ Opening existing chat:", existingChatId);

      // 🔥 trigger your UI open logic
      window.dispatchEvent(
        new CustomEvent("rudal-open-chat", {
          detail: { chatId: existingChatId },
        })
      );

      return;
    }
  }

  // =========================
  // 3. CREATE NEW CHAT
  // =========================
  const { data: newChat, error } = await supabase
    .from("chats")
    .insert({
      is_group: false,
      chat_status: "pending",
      initiator_id: me.id,
    })
    .select()
    .single();

  if (error || !newChat) {
    console.error("❌ Chat creation failed:", error);
    return;
  }

  // add members
  await supabase.from("chat_members").insert([
    { chat_id: newChat.id, user_id: me.id },
    { chat_id: newChat.id, user_id: targetId },
  ]);

  console.log("🔥 Created new chat:", newChat.id);

  // refresh + open
  window.dispatchEvent(new Event("rudal-chat-created"));

  window.dispatchEvent(
    new CustomEvent("rudal-open-chat", {
      detail: { chatId: newChat.id },
    })
  );
};
const safeLower = (v) =>
  typeof v === "string" ? v.toLowerCase() : "";

// Users that match search text
const filteredUsers = profiles
  .filter((u) => u.id !== me?.id)
  .filter((u) =>
    safeLower(u.username).includes(searchText.toLowerCase())
  );


useEffect(() => {
  if (!me?.id) return;

  // === PRESENCE (online/offline) ===
  const presence = supabase.channel("presence", {
    config: { presence: { key: me.id } },
  });

  presence
    .on("presence", { event: "sync" }, () => {
      const state = presence.presenceState();
      const online = {};
      for (const uid in state) online[uid] = true;
     setStatusMap(online);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        presence.track({ status: me?.status ?? "online" });
      }
    });

  // === STATUS CHANGES (away/busy/online) ===
  const statusChannel = supabase
  .channel("profiles-status")
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "profiles" },
    (payload) => {
      const u = payload.new;

      setSearchResults((prev) =>
        prev.map((p) => (p.id === u.id ? { ...p, status: u.status } : p))
      );
    }
  )
  .subscribe();


  return () => {
    supabase.removeChannel(presence);
    supabase.removeChannel(statusChannel);
  };
}, [me?.id, me?.status]);


  function mergedStatus(user) {
  const isOnline = onlineIds?.has(user.id);

  if (!isOnline) return "offline";

  return user.status || "online";
}

const statusLabels = {
  online: "Available",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
};

  const statusColors = {
    online: "#4caf50",
    away: "#ff9800",
    busy: "#f44336",
    offline: "#9e9e9e",
  };

  const displayName = (me?.username || "User").slice(0, 30);
  
const myId = me?.id;

// SidebarLeft.jsx
// Die vorhandenen incomingRequests- und normalChats-Blöcke ersetzen:

const incomingRequests = chats.filter(
  (c) =>
    !isFlyrChat(c) &&
    !c.is_group &&
    c.chat_status === "pending" &&
    c.initiator_id !== myId
);

const normalChats = chats.filter(
  (c) =>
    isFlyrChat(c) ||
    c.is_group ||
    c.chat_status === "accepted" ||
    (
      c.chat_status === "pending" &&
      c.initiator_id === myId
    )
);

const filteredChats = normalChats.filter((c) =>
  (c.name || "").toLowerCase().includes((searchText || "").toLowerCase())
);

  return (
    <div className="sidebar-left">
      {/* ===== UPDATED PROFILE HEADER ===== */}
<div className="profile-header">

  <div className="profile-avatar-wrapper">
  <img
    src={me?.avatar || "https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg"}
    alt="Profile"
    className="profile-avatar"
    onError={(e) =>
      (e.currentTarget.src =
        "https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg")
    }
  />

  <span className={`avatar-status ${me?.status || "online"}`}></span>
</div>

  <div className="profile-info">
    <div className="profile-top-row">
      <div className="profile-name" title={me?.username || ""}>
        {displayName}
      </div>

      <button className="settings-btn" onClick={onOpenSettings}>
        ⋯
      </button>
    </div>

    <button
  type="button"
  className={`status-toggle ${showStatusMenu ? "open" : ""}`}
  onClick={() => setShowStatusMenu((v) => !v)}
>
  <span className="status-text">
    {statusLabels[me?.status] || "Available"}
  </span>

  <svg className="chevron" width="10" height="10" viewBox="0 0 24 24">
    <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
</button>
  </div>

  {showStatusMenu && (
    <div
      className="status-dropdown"
      onMouseLeave={() => setShowStatusMenu(false)}
    >
      {["online", "away", "busy", "offline"].map((s) => (
  <div
    key={s}
    className="status-option"
    onClick={() => {
      onStatusChange && onStatusChange(s);
      setShowStatusMenu(false);
    }}
  >
    <span
      className="status-dot"
      style={{ backgroundColor: statusColors[s] }}
    ></span>
    {statusLabels[s]}
  </div>
))}
    </div>
  )}
</div>


      {/* ===== GLOBAL SEARCH ===== */}
      <div className="global-search">
  <input
    type="text"
    placeholder="Search Rudal"
    value={searchText}
    onChange={(e) => setSearchText(e.target.value)}
  />

  
<button
  className="dialpad-btn"
  onClick={onOpenDialPad}
  aria-label="Open dialpad"
>
  <img
    src={keypadIcon}
    alt=""
    className="dialpad-icon"
  />
</button>

</div>

      {/* ===== TABS ===== */}
<div className="sidebar-tabs">
  <button
    className={`tab-btn ${currentTab === "Chats" ? "active" : ""}`}
    onClick={() => setCurrentTab("Chats")}
  >
    <img
      className="tab-icon"
      src={currentTab === "Chats" ? chatIconSelected : chatIcon}
      alt="Chats"
    />
    <span className="tab-label">Chats</span>
  </button>

  <button
    className={`tab-btn ${currentTab === "Calls" ? "active" : ""}`}
    onClick={() => setCurrentTab("Calls")}
  >
    <img
      className="tab-icon"
      src={currentTab === "Calls" ? callsIconSelected : callsIcon}
      alt="Calls"
    />
    <span className="tab-label">Calls</span>
  </button>

  <button
  className={`tab-btn ${currentTab === "Requests" ? "active" : ""}`}
  onClick={() => setCurrentTab("Requests")}
>
 
<img
  className="tab-icon"
  src={currentTab === "Requests" ? requestsIconSelected : requestsIcon}
  alt="Requests"
/>

  <span className="tab-label">Requests</span>

  {incomingRequests.length > 0 && (
    <span className="tab-badge">{incomingRequests.length}</span>
  )}
</button>


  <button
  className={`tab-btn ${currentTab === "Calendar" ? "active" : ""}`}
  onClick={() => setCurrentTab("Calendar")}
>
  
<img
  className="tab-icon"
  src={currentTab === "Calendar" ? calendarIconSelected : calendarIcon}
  alt="Calendar"
/>

  <span className="tab-label">Calendar</span>
</button>

</div>





      {/* ===== CONTENT ===== */}
      <div className="sidebar-content">
        {currentTab === "Chats" && (
  <div className="chat-list">
    {searchText.length > 0 ? (
      
      // ---- USER SEARCH RESULTS ----
      filteredUsers.length === 0 ? (
        <div className="empty-msg">No users found</div>
      ) : (
        filteredUsers.map((user) => (
          <div
            key={user.id}
            className="chat-item"
            onClick={() => openOrCreateChatWith(user)}

          >
            <img
              src={user.avatar || "https://i.pravatar.cc/100?img=5"}
              className="chat-avatar"
            />
            <div className="chat-info">
  <div className="chat-name">{user.username}</div>
  <div className="chat-preview">{mergedStatus(user)}</div>
</div>
          </div>
        ))
      )
    ) : (
      
      // ---- NORMAL CHAT LIST ----
      filteredChats.length === 0 ? (
        <div className="empty-msg">No Chats found</div>
      ) : (
        
        filteredChats.map((chat) => (
          
          <div
            key={chat.id}
            className={`chat-item ${
              activeChatId === chat.id ? "active" : ""
            }`}
            onClick={() => {
  const fixedChat = {
    ...chat,
    other: {
      id:
        chat.initiator_id === me.id
          ? chat.receiver_id
          : chat.initiator_id,
      username: chat.name,
      avatar: chat.avatar,
      status: "offline",
    },
  };

  onSelectChat && onSelectChat(fixedChat);
}}
          >
            <div className="chat-avatar-wrapper">
  <img
    src={chat.avatar || "https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg"}
    className="chat-avatar"
  />

  {!chat.is_group && !isFlyrChat(chat) && (
  <span
    className={`avatar-status ${
      onlineIds.has(chat.otherId)
        ? chat.status || "online"
        : "offline"
    }`}
  />
)}
</div>

            <div className="chat-info">
  <div className="chat-name">{chat.name}</div>
  <div className="chat-preview">
  {chat.previewText
    ? chat.last_from === me?.id
      ? `You: ${chat.previewText}`
      : chat.is_group && chat.last_sender_name
        ? `${chat.last_sender_name}: ${chat.previewText}`
        : chat.previewText
    : "No messages yet"}
</div>
</div>
          </div>
        ))
      )
    )}
  </div>
)}
{currentTab === "Requests" && (
  <div className="request-list">
    {incomingRequests.length === 0 ? (
      <div className="empty-msg">No requests</div>
    ) : (
      incomingRequests.map((chat) => (
       <div
  key={chat.id}
  className={`request-item ${
    activeChatId === chat.id ? "active" : ""
  }`}
 onClick={() => {
  console.log("REQUEST CLICKED:", chat);
  onSelectChat && onSelectChat(chat);
}}
>
  
          <img
            src={chat.avatar || "https://i.pravatar.cc/100?img=5"}
            className="chat-avatar"
          />

          <div className="chat-info">
            <div className="chat-name">{chat.name}</div>
            <div className="chat-preview">Message request</div>
          </div>

         
          
        </div>
      ))
    )}
  </div>
)}

        {currentTab === "Calls" && (
          <div className="call-list">
            {calls.length === 0 ? (
              <div className="empty-msg">No call history</div>
            ) : (
              calls.map((call) => (
                <div key={call.id} className="call-item">
                  <img
                    src={call.other?.avatar || "https://i.pravatar.cc/100?img=2"}
                    alt=""
                    className="call-avatar"
                    onError={(e) => (e.currentTarget.src = "https://i.pravatar.cc/100?img=2")}
                  />
                  <div className="call-info">
                    <div className="call-name">{call.other?.username || "Unknown"}</div>
                    <div className="call-details">
                      {call.status === "missed" ? "Missed" : "Answered"} •{" "}
                      {new Date(call.started_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        

        {currentTab === "Calendar" && (
          <div className="calendar-placeholder">
            <p>Open the calendar in the main window.</p>
          </div>
        )}
      </div>
    </div>
  );
}
