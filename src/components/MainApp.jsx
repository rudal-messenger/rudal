import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import SidebarLeft from "./SidebarLeft.jsx";
import ChatWindow from "./ChatWindow.jsx";
import SidebarRight from "./SidebarRight.jsx";
import IncomingCall from "./IncomingCall.jsx";
import "../styles/Chat.css";
import "../styles/Call.css";
import CalendarView from "./CalendarView.jsx";
import { ensureFlyrChat, FLYR_USER_ID } from "../utils/flyr";
import {
  ensureE2EEIdentity,
  getDirectChatKey,
  decryptMessageV2,
  getMessageEncryptionVersion,
  backupE2EEIdentity,
  restoreE2EEIdentity,
} from "../utils/e2ee";
import { useIncomingCalls } from "../hooks/useIncomingCalls";
import { usePresence } from "../hooks/usePresence";
import DialPad from "./DialPad";
import {
  generateMasterKey,
  exportMasterKey,
} from "./crypto/masterKey";
import { useCall } from "../context/CallContext";
import { startCallerWebRTC } from "./calls/webrtc";
import { findUserByRudalNumber } from "../utils/rudalNumbers";
import chatIcon from "../assets/tabs/chat.png";
import chatIconSelected from "../assets/tabs/chat-selected.png";
import callsIcon from "../assets/tabs/calls.png";
import callsIconSelected from "../assets/tabs/calls-selected.png";
import requestsIcon from "../assets/tabs/requests.png";
import requestsIconSelected from "../assets/tabs/requests-selected.png";
import calendarIcon from "../assets/tabs/calendar.png";
import calendarIconSelected from "../assets/tabs/calendar-selected.png";




export default function MainApp() {
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [activeSection, setActiveSection] = useState("chat"); // "chat", "calls", "calendar"
  const userId = session?.user?.id;
  const [showDialPad, setShowDialPad] = useState(false);
  const [statusMap, setStatusMap] = useState({});
const [manualStatus, setManualStatus] = useState(null); // ✅ ensure this exists before usePresence

const presenceState = usePresence(userId, { status: manualStatus || "online" });
const onlineIds = new Set(Object.keys(presenceState || {})); // ✅ safe
function SettingsToggle({
  title,
  description,
  enabled = false,
  onChange,
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-field-info">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>

      <button
        type="button"
        className={`settings-switch ${enabled ? "on" : ""}`}
        onClick={onChange}
        aria-pressed={enabled}
      >
        <span />
      </button>
    </div>
  );
}
const statusWriteInFlight = useRef(false);
const lastSentStatus = useRef(null);
  useIncomingCalls(userId);

  useEffect(() => {
    const handler = (e) => {
      const { chatId } = e.detail || {};
      if (!chatId) return;

      // IMPORTANT: use the same method as clicking a chat
      setActiveChat(chatId); // <-- replace with your real setter
    };

    
    return () => window.removeEventListener("rudal:open-chat", handler);
  }, []);

 async function decryptPreview(
  content,
  myUserId,
  otherUserId,
  chatId
) {
  if (!content) return "";

  const version = getMessageEncryptionVersion(content);

  // Normal legacy plaintext
  if (version === 0) {
    return content;
  }

  // Old Rudal V1 E2EE.
  // Leave the original DB content untouched.
  // V2 keys cannot decrypt V1 ciphertext.
  if (version === 1) {
    return "Encrypted message";
  }

  // Rudal E2EE V2
  if (version === 2) {
    if (!myUserId || !otherUserId || !chatId) {
      return "Encrypted message";
    }

    try {
      const chatKey = await getDirectChatKey(
        chatId,
        myUserId,
        otherUserId
      );

      const plaintext = await decryptMessageV2(
        chatKey,
        content
      );

      return plaintext || "";
    } catch (err) {
      console.warn(
        "[E2EE] Could not decrypt chat preview:",
        err
      );

      return "Encrypted message";
    }
  }

  return "Encrypted message";
}
useEffect(() => {
  const fetchStatuses = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, status");

    if (error) {
      console.error(error);
      return;
    }

    const map = {};
data.forEach(p => {
  map[p.id] = p.status;
});

    console.log("INITIAL STATUS MAP:", map);
   setStatusMap(map);
  };

  fetchStatuses();
}, []);


useEffect(() => {

  const handler = () => window.location.reload();

  window.addEventListener("rudal-chat-created", handler);

  return () => {
    window.removeEventListener("rudal-chat-created", handler);
  };

}, []);

  useEffect(() => {
    const handler = (e) => {
      const { chatId, otherId } = e.detail || {};
      if (chatId) {
        // TODO: replace with your real way to select/open a chat
        setActiveChat(chatId);
      } else if (otherId) {
        // optional: find/create DM with otherId then open it
        // openDmWithUser(otherId);
      }
    };

    window.addEventListener("rudal:open-chat", handler);
    return () => window.removeEventListener("rudal:open-chat", handler);
  }, []);





  useEffect(() => {
    // ---- Get session on startup ----
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);

      // 🔥 Add keys if user is logged in on page load
      if (data.session?.user) {
  try {
   await ensureE2EEIdentity(data.session.user.id);

// TEMP: expose E2EE backup to Chrome DevTools
window.rudalBackupE2EE = async () => {
  const recoveryKey = await backupE2EEIdentity(
    data.session.user.id
  );

  console.log(
    "RUDAL E2EE RECOVERY KEY:",
    recoveryKey
  );

  return recoveryKey;
};
    console.log("🔐 E2EE V2 identity ready");
  } catch (err) {
    console.error("🔐 E2EE V2 identity unavailable:", err);
  }
}
    });

    

    // ---- Listen for login/logout ----
    const { data: authListener } =
  supabase.auth.onAuthStateChange((event, newSession) => {
    setSession(newSession);

    if (event !== "SIGNED_IN" || !newSession?.user) {
      return;
    }

    // Run Supabase requests after the auth callback has returned.
    const userId = newSession.user.id;

    setTimeout(async () => {
      try {
        await ensureE2EEIdentity(userId);
        console.log("🔐 E2EE V2 identity ready");
      } catch (err) {
        console.error(
          "🔐 E2EE V2 identity unavailable:",
          err
        );
      }
    }, 0);
  });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Tabs
  const [currentTab, setCurrentTab] = useState("Chats");
  const [calls, setCalls] = useState([]);
  // ✅ Calendar state removed from MainApp (CalendarView loads events from Supabase)

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("account");
  const [draft, setDraft] = useState(null);

  const [appSettings, setAppSettings] = useState(() => {
  const saved = localStorage.getItem("rudal-settings");

  const defaults = {
    autoStart: false,
    launchBackground: true,
    keepRunning: true,

    incomingCallSounds: true,
    callNotifications: true,

    readReceipts: true,
    typingIndicators: true,

    messageNotifications: true,
    notificationSounds: true,

    microphoneId: "default",
    speakerId: "default",
    cameraId: "default",
  };

  if (!saved) return defaults;

  try {
    return {
      ...defaults,
      ...JSON.parse(saved),
    };
  } catch {
    return defaults;
  }
});

const [settingsDraft, setSettingsDraft] = useState(appSettings);

const updateSetting = (name, value) => {
  setSettingsDraft((prev) => ({
    ...prev,
    [name]: value,
  }));
};

const toggleSetting = (name) => {
  setSettingsDraft((prev) => ({
    ...prev,
    [name]: !prev[name],
  }));
};

const enableMessageNotifications = async () => {
  // Turning notifications OFF
  if (settingsDraft.messageNotifications) {
    updateSetting("messageNotifications", false);
    return;
  }

  // Browser doesn't support notifications
  if (!("Notification" in window)) {
    console.warn("Notifications are not supported by this browser.");
    return;
  }

  // Ask for permission when turning them ON
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      updateSetting("messageNotifications", false);
      return;
    }
  }

  // Permission was previously blocked
  if (Notification.permission === "denied") {
    console.warn("Notification permission is blocked.");
    updateSetting("messageNotifications", false);
    return;
  }

  updateSetting("messageNotifications", true);
};

  // Account management
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  // Status & idle

  
const onlineIdSet = new Set(Object.keys(presenceState || {}));
  const [lastActive, setLastActive] = useState(Date.now());
  const idleTimer = useRef(null);
  const lastNonAutoStatus = useRef("online");

  // Design
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("rudal-darkmode") === "true";
  });
  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
    localStorage.setItem("rudal-darkmode", darkMode);
  }, [darkMode]);

  const [avatarFile, setAvatarFile] = useState(null);

  // Calls
  const [incomingCall, setIncomingCall] = useState(null);
  const chatWindowRef = useRef(null);

  // ---------- STATUS MANAGEMENT ----------
  const updateStatus = async (newStatus) => {
  if (!userId) return;

  // don't spam the same value
  if (lastSentStatus.current === newStatus) return;

  // prevent overlapping writes
  if (statusWriteInFlight.current) return;

  statusWriteInFlight.current = true;
  lastSentStatus.current = newStatus;

  setMe((prev) => (prev ? { ...prev, status: newStatus } : prev));

  try {
    await supabase.from("profiles").update({ status: newStatus }).eq("id", userId);
  } catch (err) {
    console.warn("Status update failed:", err.message);
    // allow retry if it failed
    lastSentStatus.current = null;
  } finally {
    statusWriteInFlight.current = false;
  }
};

  const handleManualStatusChange = async (status) => {
    setManualStatus(status);
    await updateStatus(status);
  };

  const setBusyDuringCall = async (inCall) => {
    if (!me?.id) return;
    if (inCall) {
      lastNonAutoStatus.current = me.status || "online";
      await updateStatus("busy");
    } else {
      await updateStatus(lastNonAutoStatus.current || "online");
    }
  };

  // Auto offline / online
  // Auto away/online based on tab visibility
useEffect(() => {
  if (!userId) return;

  const handleVisibility = () => {
    if (manualStatus) return;

    if (document.hidden) updateStatus("away");
    else updateStatus("online");
  };

  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}, [userId, manualStatus]);

// Set initial status once when userId becomes available
useEffect(() => {
  if (!userId) return;
  if (manualStatus) return;

  updateStatus("online");
}, [userId, manualStatus]); // intentionally only userId

  // Away after 10 min inactivity
  useEffect(() => {
  if (!userId) return;

  const onActivity = () => {
    if (document.hidden) return;

    setLastActive(Date.now());

    // only auto-return online if status is away AND user didn't set manual status
    if (!manualStatus && lastSentStatus.current === "away") {
      updateStatus("online");
    }
  };

  const interval = setInterval(() => {
    if (document.hidden) return;
    if (manualStatus) return;

    const inactive = Date.now() - lastActive;
    if (inactive > 10 * 60 * 1000) {
      updateStatus("away");
    }
  }, 60_000);

  window.addEventListener("mousemove", onActivity);
  window.addEventListener("keydown", onActivity);

  return () => {
    window.removeEventListener("mousemove", onActivity);
    window.removeEventListener("keydown", onActivity);
    clearInterval(interval);
  };
  // ✅ DO NOT depend on `me`
}, [userId, manualStatus, lastActive]);

  // ---------- LOAD PROFILE + CHATS + CALLS ----------
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data: prof } = await supabase
          .from("profiles")
          .select(
  "id, username, email, avatar, status, rudal_number, rudal_country_code"
)
          .eq("id", user.id)
          .maybeSingle();

        const my = {
          id: user.id,
          username: prof?.username || user.email.split("@")[0],
          email: prof?.email || user.email,
          avatar:
            prof?.avatar ||
            "https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg",
          status: prof?.status || "online",
          rudal_number: prof?.rudal_number || null,
rudal_country_code: prof?.rudal_country_code || null,
        };
        setMe(my);

      

        const { data: others } = await supabase
          .from("profiles")
          .select("id, username, avatar")
          .neq("id", user.id);
        setProfiles(others || []);

        await ensureFlyrChat();

        const { data: hidden } = await supabase
          .from("hidden_chats")
          .select("chat_id")
          .eq("user_id", user.id);
        const hiddenIds = new Set((hidden || []).map((h) => h.chat_id));

        const { data: memberChats } = await supabase
          .from("chat_members")
          .select("chat_id")
          .eq("user_id", user.id);
        const chatIds = (memberChats || [])
          .map((m) => m.chat_id)
          .filter((id) => !hiddenIds.has(id));

        if (!chatIds.length) {
          setChats([]);
        } else {
          const { data: baseChats } = await supabase
            .from("chats")
.select("id, is_group, title, avatar, created_at, initiator_id, chat_status, blocked_by")
            .in("id", chatIds);

          const enriched = await Promise.all(
            baseChats.map(async (c) => {
              let name = c.title;
              let avatar = c.avatar;
              let status = "online";

              let otherId = null;
              let otherProfile = null;

if (!c.is_group) {
  const { data: members } = await supabase
  .from("chat_members")
  .select("user_id") // 👈 IMPORTANT
  .eq("chat_id", c.id);

  
  const other = members?.find((m) => m.user_id !== user.id);
  otherId = other?.user_id || null;

  if (otherId) {
    const { data: op } = await supabase
  .from("profiles")
  .select("id, username, avatar, status, rudal_number")
  .eq("id", otherId)
  .single();

otherProfile = op || null;

name = op?.username || "Unknown";
avatar = op?.avatar;
status = op?.status || "offline";
  }
}

              const { data: lastMsg } = await supabase
                .from("messages")
                .select("content, created_at, from_id")
                .eq("chat_id", c.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

                const decryptedPreview =
  lastMsg && !c.is_group && otherId !== FLYR_USER_ID
    ? await decryptPreview(
        lastMsg.content,
        user.id,
        otherId,
        c.id
      )
    : lastMsg?.content || "";

              return {
  ...c,
  chat_status:
  otherId === FLYR_USER_ID ? "accepted" : c.chat_status,
  otherId,
  other: otherProfile,
  name,
  avatar,
  status,

  previewText: decryptedPreview,
  last_from: lastMsg?.from_id || null,
  lastActivity: lastMsg?.created_at || c.created_at,
};
            })
          );

          enriched.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
          setChats(enriched);
        }

        // -------- Load call history --------
        const { data: rawCalls } = await supabase
          .from("calls")
          .select("*")
          .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
          .order("created_at", { ascending: false });

        const callsEnriched = await Promise.all(
          (rawCalls || []).map(async (call) => {
            const otherId = call.caller_id === user.id ? call.callee_id : call.caller_id;
            const { data: other } = await supabase
              .from("profiles")
              .select("username, avatar")
              .eq("id", otherId)
              .single();
            return { ...call, other };
          })
        );
        setCalls(callsEnriched);
      } catch (err) {
        console.error("Initial load failed:", err.message);
      }
    })();
  }, []);

 // Realtime chat previews
const sidebarChatsRef = useRef(chats);

useEffect(() => {
  sidebarChatsRef.current = chats;
}, [chats]);

useEffect(() => {
  if (!me?.id) return;

  let disposed = false;
  const latestMessageByChat = new Map();

  const channel = supabase
    .channel("sidebar-message-previews")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      async ({ new: row }) => {
        const chat = sidebarChatsRef.current.find(
          (item) => item.id === row.chat_id
        );

        if (!chat) return;

        latestMessageByChat.set(row.chat_id, row.id);

        let previewText = "";

        try {
          if (
            !chat.is_group &&
            chat.otherId !== FLYR_USER_ID
          ) {
            previewText = await decryptPreview(
              row.content || "",
              me.id,
              chat.otherId,
              row.chat_id
            );
          } else {
            previewText = row.content || "";
          }
        } catch (error) {
          console.error(
            "Sidebar preview decryption failed:",
            error
          );

          previewText = "Encrypted message";
        }

        // Eine langsamere Entschlüsselung darf keine
        // inzwischen neuere Vorschau überschreiben.
        if (
          disposed ||
          latestMessageByChat.get(row.chat_id) !== row.id
        ) {
          return;
        }

        setChats((previous) => {
          const updated = previous.map((item) => {
            if (item.id !== row.chat_id) return item;

            if (
              item.lastActivity &&
              new Date(item.lastActivity).getTime() >
                new Date(row.created_at).getTime()
            ) {
              return item;
            }

            return {
              ...item,
              previewText,
              last_from: row.from_id || row.sender_id,
              lastActivity: row.created_at,
            };
          });

          return updated.sort(
            (a, b) =>
              new Date(b.lastActivity).getTime() -
              new Date(a.lastActivity).getTime()
          );
        });
      }
    )
    .subscribe();

  return () => {
    disposed = true;
    supabase.removeChannel(channel);
  };
}, [me?.id]);

  // ---------- REALTIME PRESENCE (STATUS UPDATES) ----------
useEffect(() => {
  if (!me?.id) return;

  console.log("[PRESENCE] setting up profiles realtime...");

  

  const channel = supabase
    .channel("rt:profiles")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles" },
      (payload) => {
        console.log("[PRESENCE] profiles UPDATE payload:", payload);

        const updated = payload.new;


// 🔥 ADD THIS
setStatusMap(prev => ({
  ...prev,
  [updated.id]: updated.status
}));

        setProfiles((prev) =>
          prev.map((p) => (p.id === updated.id ? { ...p, status: updated.status } : p))
        );

        setChats((prev) =>
          prev.map((c) => (c.otherId === updated.id ? { ...c, status: updated.status } : c))
        );

        if (updated.id === me.id) {
          setMe((prev) => (prev ? { ...prev, status: updated.status } : prev));
        }
      }
    )
    .subscribe((status) => {
      console.log("[PRESENCE] rt:profiles subscribe status:", status);
    });

  return () => {
    console.log("[PRESENCE] removing profiles realtime channel");
    supabase.removeChannel(channel);
  };
}, [me?.id]);

console.log("PRESENCE:", presenceState);
console.log("ONLINE IDS:", onlineIds);

// ---------- MESSAGE NOTIFICATIONS ----------
useEffect(() => {
  if (!me?.id) return;

  const messageSound = new Audio("/rudal/sounds/message.mp3");
  messageSound.preload = "auto";

  const channel = supabase
    .channel(`message-notifications:${me.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      async (payload) => {
        const msg = payload.new;

        // Never notify for our own messages.
        if (msg.from_id === me.id) return;

        // Only process chats that belong to us.
        const chat = chats.find(
          (c) => c.id === msg.chat_id
        );

        if (!chat) return;

        // Only notify when Rudal isn't actively being viewed.
        const rudalIsActive =
          document.visibilityState === "visible" &&
          document.hasFocus();

        if (rudalIsActive) {
          return;
        }

        let notificationText = "New message";

        // Decrypt direct-message notification if possible.
        if (!chat.is_group) {
          try {
            notificationText = await decryptPreview(
              msg.content,
              me.id,
              chat.otherId,
              chat.id
            );

            if (
              !notificationText ||
              notificationText === "Encrypted message"
            ) {
              notificationText = "New encrypted message";
            }
          } catch (err) {
            console.warn(
              "[NOTIFICATION] Could not decrypt preview:",
              err
            );

            notificationText = "New encrypted message";
          }
        } else {
          notificationText = msg.content || "New message";
        }

        // Sound setting
        if (appSettings.notificationSounds) {
          try {
            messageSound.currentTime = 0;
            await messageSound.play();
          } catch (err) {
            console.warn(
              "Notification sound blocked:",
              err.message
            );
          }
        }

        // Browser notification setting
        if (
          appSettings.messageNotifications &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const notification = new Notification(
            chat.name || "Rudal",
            {
              body: notificationText,
              icon: "/rudal/RudalLogo.png",
              tag: `rudal-chat-${chat.id}`,
            }
          );

          notification.onclick = () => {
            window.focus();

            setActiveChat(chat);
            setCurrentTab("Chats");

            notification.close();
          };
        }
      }
    )
    .subscribe((status) => {
      console.log(
        "NOTIFICATION SUB STATUS:",
        status
      );
    });

  return () => {
    supabase.removeChannel(channel);
  };
}, [
  me?.id,
  chats,
  appSettings.messageNotifications,
  appSettings.notificationSounds,
]);


  // ---------- SETTINGS ----------
  const openSettings = () => {
  setDraft(me);
  setSettingsDraft(appSettings);
  setAuthMessage("");
  setSettingsTab("account");
  setSettingsOpen(true);
};

  const saveAppearance = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      let avatarUrl = draft.avatar || me.avatar;
      const fileInput = document.getElementById("profile-avatar-input");

      // ✅ check if user picked a new file
      if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];

        // get old avatar path if exists
        const oldAvatarPath = me.avatar?.includes("avatars/")
          ? me.avatar.split("/avatars/")[1]
          : null;

        // new unique path
        const newPath = `user-avatars/${user.id}-${Date.now()}-${file.name}`;

        // upload new file
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(newPath, file, { upsert: true });

        if (uploadError) throw uploadError;

        // get public URL
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(newPath);
        avatarUrl = pub.publicUrl;

        // delete old file if applicable
        if (oldAvatarPath && !oldAvatarPath.includes("default")) {
          const { error: delError } = await supabase.storage
            .from("avatars")
            .remove([`user-avatars/${oldAvatarPath}`]);
          if (delError) {
            console.warn("⚠️ Failed to delete old avatar:", delError.message);
          }
        }
      }

      // update database
      const { error } = await supabase
        .from("profiles")
        .update({
          username: draft.username,
          status: draft.status,
          avatar: avatarUrl,
        })
        .eq("id", user.id);

      if (error) throw error;

      setMe((prev) => ({
        ...prev,
        username: draft.username,
        status: draft.status,
        avatar: avatarUrl,
      }));

      await updateStatus(draft.status);
      setSettingsOpen(false);
    } catch (err) {
      console.error("❌ Unexpected error:", err.message);
    }
  };

  const handleEmailChange = async () => {
    try {
      if (!newEmail) return setAuthMessage("Enter new email.");
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setAuthMessage("Email updated! Check inbox to confirm.");
    } catch (err) {
      setAuthMessage(err.message);
    }
  };

  const handlePasswordChange = async () => {
    try {
      if (!currentPassword || !newPassword || !confirmPassword)
        return setAuthMessage("Fill out all password fields.");
      if (newPassword !== confirmPassword)
        return setAuthMessage("Passwords do not match.");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const signIn = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signIn.error) return setAuthMessage("Current password incorrect.");

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setAuthMessage("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setAuthMessage(err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/rudal/login";
  };

  // ---------- ARCHIVE ----------
  const archiveChat = async (chatId) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;
      await supabase.from("hidden_chats").upsert({
        user_id: user.id,
        chat_id: chatId,
        hidden_at: new Date().toISOString(),
      });
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
    } catch (e) {
      console.error("Archive failed:", e.message);
    }
  };

const {
  callPhase,
  setActiveCall,
  setCallPhase,
  resetCall,
  pcRef,
  localStreamRef,
} = useCall();

const dialingRef = useRef(false);

const handleDialCall = async (number) => {
  if (!me?.id) {
    throw new Error("Please sign in first.");
  }

  if (dialingRef.current || callPhase !== "idle") {
    throw new Error("Finish the current call first.");
  }

  dialingRef.current = true;
  let started = false;

  try {
    const target = await findUserByRudalNumber(number);

    if (target.id === me.id) {
      throw new Error("You cannot call yourself.");
    }

    if (target.id === FLYR_USER_ID) {
      throw new Error("Flyr does not support calls.");
    }

    const { data: chatId, error } = await supabase.rpc(
      "rudal_dm_for_call",
      {
        target_user: target.id,
      }
    );

    if (error) throw error;

    const { data: baseChat, error: chatError } =
      await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .single();

    if (chatError) throw chatError;

    const chat = {
      ...baseChat,
      otherId: target.id,
      other: target,
      name: target.username || "Rudal user",
      avatar: target.avatar,
      status: target.status || "offline",
    };

    setCallPhase("ringing_out");
    started = true;

    let ended = false;

    const result = await startCallerWebRTC({
      userId: me.id,
      calleeId: target.id,
      chatId,
      callerName: me.username,
      callerAvatar: me.avatar,

      onConnected: () => {
        setCallPhase("in_call");
      },

      onEnded: async () => {
        ended = true;
        await resetCall();
      },
    });

    if (ended) return;

    pcRef.current = result.pc;
    localStreamRef.current = result.localStream;

    setActiveCall({
      id: result.callId,
      caller_id: me.id,
      callee_id: target.id,
      chat_id: chatId,
      chatId,
    });

    setChats((previous) =>
      previous.some((item) => item.id === chatId)
        ? previous
        : [
            {
              ...chat,
              previewText: "",
              lastActivity: baseChat.created_at,
            },
            ...previous,
          ]
    );

    setActiveChat(chat);
    setCurrentTab("Chats");
  } catch (err) {
    if (started) {
      await resetCall();
    }

    throw err;
  } finally {
    dialingRef.current = false;
  }
};

  // ---------- UI ----------
  return (
  <div
    className={[
      "rudal-shell",
      !showDialPad &&
      activeChat &&
      (currentTab === "Chats" || currentTab === "Requests")
        ? "mobile-chat-open"
        : "",
      !showDialPad &&
      (currentTab === "Calls" || currentTab === "Calendar")
        ? "mobile-main-open"
        : "",
    ].filter(Boolean).join(" ")}
  >
      {showDialPad ? (
  <div className="sidebar-left">
    <DialPad
  key={me?.id || "loading"}
  me={me}
  onClose={() => setShowDialPad(false)}
  onCall={handleDialCall}
  onNumberAssigned={(number, countryCode) => {
    setMe((previous) => ({
      ...previous,
      rudal_number: number,
      rudal_country_code: countryCode,
    }));
  }}
/>
  </div>
) : (
  <SidebarLeft
    me={me}
    setMe={setMe}
    profiles={profiles}
    chats={chats}
    calls={calls}
    onlineIds={onlineIds}
    currentTab={currentTab}
    setCurrentTab={(tab) => {
      setCurrentTab(tab);
      setActiveChat(null);
    }}
    activeChatId={activeChat?.id}
    onSelectChat={(c) =>
  setActiveChat(chats.find((item) => item.id === c.id) || c)
}
    onOpenSettings={openSettings}
    onStatusChange={handleManualStatusChange}

    // 🔥 ADD THIS LINE
    onOpenDialPad={() => setShowDialPad(true)}
  showDialPad={showDialPad}
  onCloseDialPad={() => setShowDialPad(false)}
/>
)}



      <div className="chat-area">

  {(currentTab === "Chats" || currentTab === "Requests") && (
  activeChat ? (
    <ChatWindow
  ref={chatWindowRef}
  chat={activeChat}
  me={me}
  statusMap={statusMap}
  onlineIds={onlineIds}
  profiles={profiles}
  onAddPeople={() => setShowAddPeople(true)}
  onBack={() => {
  setActiveChat(null);
  setShowAddPeople(false);
}}
  onArchive={archiveChat}
  setBusyDuringCall={setBusyDuringCall}
  otherId={activeChat?.otherId}
  key={activeChat.id}
/>
  ) : (
    <div className="empty-chat">
      {currentTab === "Requests"
        ? "Select a request to preview"
        : "Select a chat to Start"}
    </div>
  )
)}

  {currentTab === "Calls" && (
    <div className="call-history">
      {calls.length === 0 ? (
        <div className="empty-chat">No call history yet</div>
      ) : (
        calls.map((call) => (
          <div key={call.id} className="call-item">
            <img
              src={call.other?.avatar || "https://i.pravatar.cc/100?img=2"}
              className="call-avatar"
              alt=""
            />
            <div className="call-info">
              <div className="call-name">{call.other?.username}</div>
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
    <CalendarView me={me} />
  )}

</div>
      {showAddPeople && (
        <SidebarRight
  me={me}
  onClose={() => setShowAddPeople(false)}
/>
      )}

<nav className="mobile-bottom-nav" aria-label="Main navigation">
  {[
    {
      tab: "Chats",
      icon: chatIcon,
      selectedIcon: chatIconSelected,
    },
    {
      tab: "Calls",
      icon: callsIcon,
      selectedIcon: callsIconSelected,
    },
    
{
  tab: "Requests",
  icon: requestsIcon,
  selectedIcon: requestsIconSelected,
},
{
  tab: "Calendar",
  icon: calendarIcon,
  selectedIcon: calendarIconSelected,
},

  ].map(({ tab, icon, selectedIcon, symbol }) => (
    <button
      key={tab}
      type="button"
      className={`mobile-nav-button ${
        currentTab === tab ? "active" : ""
      }`}
      aria-current={currentTab === tab ? "page" : undefined}
      onClick={() => {
        setCurrentTab(tab);
        setActiveChat(null);
        setShowDialPad(false);
        setShowAddPeople(false);
      }}
    >
      {icon ? (
        <img
          src={currentTab === tab ? selectedIcon : icon}
          alt=""
        />
      ) : (
        <span className="mobile-nav-symbol" aria-hidden="true">
          {symbol}
        </span>
      )}

      <span>{tab}</span>
    </button>
  ))}
</nav>

{/* =========================
    SKYPE-STYLE SETTINGS MODAL
========================= */}
{settingsOpen && (
  <div
    className="settings-overlay"
    onClick={() => setSettingsOpen(false)}
  >
    <div
      className="settings-modal skype-settings"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ===== LEFT NAVIGATION ===== */}
      <aside className="settings-nav">
        <div className="settings-nav-title">Settings</div>

        <button
          className={`settings-nav-item ${
            settingsTab === "account" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("account")}
        >
          <span className="settings-nav-icon">♙</span>
          <span>Account &amp; Profile</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "general" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("general")}
        >
          <span className="settings-nav-icon">⚙</span>
          <span>General</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "appearance" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("appearance")}
        >
          <span className="settings-nav-icon">✎</span>
          <span>Appearance</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "audio" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("audio")}
        >
          <span className="settings-nav-icon">♩</span>
          <span>Audio &amp; Video</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "calling" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("calling")}
        >
          <span className="settings-nav-icon">☎</span>
          <span>Calling</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "messaging" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("messaging")}
        >
          <span className="settings-nav-icon">▤</span>
          <span>Messaging</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "notifications" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("notifications")}
        >
          <span className="settings-nav-icon">♢</span>
          <span>Notifications</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "about" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("about")}
        >
          <span className="settings-nav-icon">ⓘ</span>
          <span>About Rudal</span>
        </button>
      </aside>

      {/* ===== RIGHT CONTENT ===== */}
      <main className="settings-page">
        <button
          type="button"
          className="settings-close"
          onClick={() => setSettingsOpen(false)}
          title="Close"
        >
          ×
        </button>

        {/* ================= ACCOUNT ================= */}
        {settingsTab === "account" && (
          <>
            <div className="settings-section-label">
              ACCOUNT &amp; PROFILE
            </div>

            <div className="settings-profile-header">
              <img
                src={
                  me?.avatar ||
                  "https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg"
                }
                className="settings-profile-avatar"
                alt=""
              />

              <div>
                <div className="settings-profile-name">
                  {me?.username || "Rudal User"}
                </div>

                <div className="settings-description">
                  Manage your Rudal account and profile
                </div>
              </div>
            </div>

            <div className="settings-section-label">PROFILE</div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Username</strong>
                <span>The name other Rudal users see.</span>
              </div>

              <input
                className="settings-input"
                type="text"
                value={me?.username || ""}
                onChange={(e) =>
                  setMe((prev) => ({
                    ...prev,
                    username: e.target.value,
                  }))
                }
              />
            </div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Email</strong>
                <span>Your Rudal account email address.</span>
              </div>

              <input
                className="settings-input"
                type="email"
                value={me?.email || ""}
                onChange={(e) =>
                  setMe((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
              />
            </div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Profile picture</strong>
                <span>Choose how you appear to other users.</span>
              </div>

              <label className="settings-outline-button">
                Change picture

                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];

                    if (!file) return;

                    setAvatarFile(file);

                    const url = URL.createObjectURL(file);

                    setMe((prev) => ({
                      ...prev,
                      avatar: url,
                    }));
                  }}
                />
              </label>
            </div>

            <div className="settings-section-label">SECURITY</div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Change password</strong>
                <span>
                  Choose a new password for your Rudal account.
                </span>
              </div>

              <button
                type="button"
                className="settings-outline-button"
                onClick={() => {
                  setSettingsTab("password");
                }}
              >
                Change password
              </button>
            </div>
          </>
        )}

        {/* ================= PASSWORD ================= */}
        {settingsTab === "password" && (
          <>
            <div className="settings-section-label">SECURITY</div>

            <div className="settings-link-row">
              <div>
                <strong>Change password</strong>
                <div className="settings-description">
                  Update your Rudal account password.
                </div>
              </div>
            </div>

            <div className="settings-password-form">
              <label>Current password</label>

              <input
                className="settings-input settings-password-input"
                type="password"
                value={currentPassword}
                onChange={(e) =>
                  setCurrentPassword(e.target.value)
                }
              />

              <label>New password</label>

              <input
                className="settings-input settings-password-input"
                type="password"
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(e.target.value)
                }
              />

              <label>Confirm new password</label>

              <input
                className="settings-input settings-password-input"
                type="password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
              />

              <button
                type="button"
                className="settings-save inline"
                onClick={handlePasswordChange}
              >
                Change password
              </button>

              {authMessage && (
                <div className="settings-description">
                  {authMessage}
                </div>
              )}
            </div>
          </>
        )}

        {/* ================= GENERAL ================= */}
        {settingsTab === "general" && (
          <>
            <div className="settings-section-label">GENERAL</div>

            <div className="settings-link-row">
              <div className="settings-row-main">
                <span className="settings-large-icon">A文</span>
                <strong>Language</strong>
              </div>

              <span className="settings-chevron">›</span>
            </div>

            <div className="settings-section-label">
              STATUS
            </div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Rudal status</strong>
                <span>
                  Choose how other people see your availability.
                </span>
              </div>

              <select
                className="settings-select"
                value={me?.status || "online"}
                onChange={(e) =>
                  setMe((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
              >
                <option value="online">Available</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            <div className="settings-section-label">
              STARTUP AND CLOSE
            </div>

           <SettingsToggle
  title="Automatically start Rudal"
  description="Start Rudal automatically when you sign in."
  enabled={settingsDraft.autoStart}
  onChange={() => toggleSetting("autoStart")}
/>

<SettingsToggle
  title="Launch Rudal in the background"
  description="Rudal starts minimized and stays ready for messages."
  enabled={settingsDraft.launchBackground}
  onChange={() => toggleSetting("launchBackground")}
/>

<SettingsToggle
  title="On close, keep Rudal running"
  description="Keep Rudal running after closing the application window."
  enabled={settingsDraft.keepRunning}
  onChange={() => toggleSetting("keepRunning")}
/>
          </>
        )}

        {/* ================= APPEARANCE ================= */}
        {settingsTab === "appearance" && (
          <>
            <div className="settings-section-label">APPEARANCE</div>

            <div className="settings-toggle-row">
              <div className="settings-field-info">
                <strong>Dark mode</strong>
                <span>
                  Use Rudal's dark appearance.
                </span>
              </div>

              <button
                type="button"
                className={`settings-switch ${
                  darkMode ? "on" : ""
                }`}
                onClick={() => setDarkMode((prev) => !prev)}
              >
                <span />
              </button>
            </div>

            <div className="settings-link-row">
              <div>
                <strong>Chat appearance</strong>
                <div className="settings-description">
                  Customize how conversations look.
                </div>
              </div>

              <span className="settings-chevron">›</span>
            </div>
          </>
        )}

        {/* ================= AUDIO & VIDEO ================= */}
        {settingsTab === "audio" && (
          <>
            <div className="settings-section-label">
              AUDIO &amp; VIDEO
            </div>

            <div className="settings-link-row">
              <div>
                <strong>Microphone</strong>
                <div className="settings-description">
                  Choose the microphone Rudal uses for calls.
                </div>
              </div>

              <span className="settings-chevron">›</span>
            </div>

            <div className="settings-link-row">
              <div>
                <strong>Speakers</strong>
                <div className="settings-description">
                  Choose where call audio is played.
                </div>
              </div>

              <span className="settings-chevron">›</span>
            </div>

            <div className="settings-link-row">
              <div>
                <strong>Camera</strong>
                <div className="settings-description">
                  Choose the camera Rudal uses for video calls.
                </div>
              </div>

              <span className="settings-chevron">›</span>
            </div>
          </>
        )}

        {/* ================= CALLING ================= */}
        {settingsTab === "calling" && (
          <>
            <div className="settings-section-label">CALLING</div>

           <SettingsToggle
  title="Incoming call sounds"
  description="Play a ringtone when somebody calls you."
  enabled={settingsDraft.incomingCallSounds}
  onChange={() => toggleSetting("incomingCallSounds")}
/>

<SettingsToggle
  title="Call notifications"
  description="Show notifications for incoming Rudal calls."
  enabled={settingsDraft.callNotifications}
  onChange={() => toggleSetting("callNotifications")}
/>
          </>
        )}

        {/* ================= MESSAGING ================= */}
        {settingsTab === "messaging" && (
          <>
            <div className="settings-section-label">MESSAGING</div>

           <SettingsToggle
  title="Read receipts"
  description="Let people know when you've read their messages."
  enabled={settingsDraft.readReceipts}
  onChange={() => toggleSetting("readReceipts")}
/>

<SettingsToggle
  title="Typing indicators"
  description="Show when somebody is typing a message."
  enabled={settingsDraft.typingIndicators}
  onChange={() => toggleSetting("typingIndicators")}
/>

            <div className="settings-link-row">
              <div>
                <strong>Message appearance</strong>
                <div className="settings-description">
                  Customize how Rudal messages are displayed.
                </div>
              </div>

              <span className="settings-chevron">›</span>
            </div>
          </>
        )}

        {/* ================= NOTIFICATIONS ================= */}
        {settingsTab === "notifications" && (
          <>
            <div className="settings-section-label">
              NOTIFICATIONS
            </div>

            <SettingsToggle
  title="Message notifications"
  description="Show a notification when you receive a message."
  enabled={settingsDraft.messageNotifications}
  onChange={() => toggleSetting("messageNotifications")}
/>

<SettingsToggle
  title="Notification sounds"
  description="Play a sound when a new message arrives."
  enabled={settingsDraft.notificationSounds}
  onChange={() => toggleSetting("notificationSounds")}
/>
          </>
        )}

        {/* ================= ABOUT ================= */}
        {settingsTab === "about" && (
          <>
            <div className="settings-section-label">
              ABOUT RUDAL
            </div>

            <div className="settings-about">
  <img
  src={`${import.meta.env.BASE_URL}RudalLogo.png`}
  alt="Rudal logo"
  className="settings-about-logo"
  style={{
    display: "block",
    width: "88px",
    height: "88px",
    maxWidth: "88px",
    objectFit: "contain",
    margin: "0 auto 16px",
    flexShrink: 0,
  }}
/>

  <h2>Rudal</h2>
  <p>Rudal Communication Technologies</p>

  <p className="settings-description">
    Communication made simple.
  </p>
</div>

            <div className="settings-link-row">
              <strong>Privacy</strong>
              <span className="settings-chevron">›</span>
            </div>

            <button
  type="button"
  className="settings-link-row rudal-terms-link"
  onClick={() => setSettingsTab("terms")}
>
  <strong>Terms of Use</strong>
  <span className="settings-chevron">›</span>
</button>

<div className="settings-section-label">
  ACCOUNT
</div>

<div className="settings-field-row">
  <div className="settings-field-info">
    <strong>Sign out</strong>
    <span>Sign out of your Rudal account on this device.</span>
  </div>

  <button
    type="button"
    className="settings-outline-button"
    onClick={handleLogout}
  >
    Sign out
  </button>
</div>
          </>
        )}

        {/* ===== SAVE BAR ===== */}
        {settingsTab !== "password" && (
          <div className="settings-bottom">
            <button
              type="button"
              className="settings-cancel"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              className="settings-save"
              onClick={async () => {
                try {
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();

                  if (!user?.id) return;

                  let avatarUrl = me?.avatar;

                  /* Upload new avatar if one was selected */
                  if (avatarFile) {
                    const path =
                      `user-avatars/${user.id}-${Date.now()}-${avatarFile.name}`;

                    const { error: uploadError } =
                      await supabase.storage
                        .from("avatars")
                        .upload(path, avatarFile, {
                          upsert: true,
                        });

                    if (uploadError) {
                      throw uploadError;
                    }

                    const { data: publicData } =
                      supabase.storage
                        .from("avatars")
                        .getPublicUrl(path);

                    avatarUrl = publicData.publicUrl;
                  }

                  const { error: profileError } =
                    await supabase
                      .from("profiles")
                      .update({
                        username: me?.username,
                        status: me?.status,
                        avatar: avatarUrl,
                      })
                      .eq("id", user.id);

                  if (profileError) {
                    throw profileError;
                  }

                  /*
                   * Auth email is changed through Supabase Auth,
                   * not just the profiles table.
                   */
                  if (
                    me?.email &&
                    me.email !== user.email
                  ) {
                    const { error: emailError } =
                      await supabase.auth.updateUser({
                        email: me.email,
                      });

                    if (emailError) {
                      throw emailError;
                    }
                  }

                  setMe((prev) => ({
                    ...prev,
                    avatar: avatarUrl,
                  }));


                  
                  // Save application settings
setAppSettings(settingsDraft);
localStorage.setItem(
  "rudal-settings",
  JSON.stringify(settingsDraft)
);

setAvatarFile(null);
setSettingsOpen(false);
                } catch (err) {
                  console.error(
                    "Settings save failed:",
                    err
                  );

                  setAuthMessage(
                    err?.message || "Failed to save settings."
                  );
                }
              }}
            >
              Save
            </button>
          </div>
        )}
      </main>
    </div>
  </div>
)}

      {incomingCall && (
        <IncomingCall
          caller={incomingCall.caller}
          onAccept={() => {
            chatWindowRef.current?.acceptIncomingCall(incomingCall.payload);
            setIncomingCall(null);
          }}
          onDecline={() => {
            chatWindowRef.current?.declineCall?.();
            setIncomingCall(null);
          }}
          onIgnore={() => setIncomingCall(null)}
        />
      )}

      {/* Incoming Call Popup */}
      {incomingCall && (
        <IncomingCall
          caller={incomingCall.caller}
          onAccept={() => {
            chatWindowRef.current?.acceptIncomingCall(incomingCall.payload);
            setIncomingCall(null);
          }}
          onDecline={() => setIncomingCall(null)}
        />
      )}
    </div>
  );
}
