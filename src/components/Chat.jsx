import React, { useState, useEffect } from "react";
import "../styles/Chat.css";


const Chat = () => {
  const [selectedChat, setSelectedChat] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const chats = [
    { id: 1, name: "Alice", status: "online", lastMessage: "See you soon!" },
    { id: 2, name: "Bob", status: "away", lastMessage: "Got it!" },
  ];

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

const chatsRef = useRef([]);
useEffect(() => {
  chatsRef.current = chats || [];
}, [chats]);

useEffect(() => {
  const handler = (e) => {
    const { chatId } = e.detail || {};
    console.log("[CHAT] received rudal:open-chat", chatId);
    if (!chatId) return;

    const found =
      chatsRef.current.find((c) => String(c.id) === String(chatId)) || null;

    if (found) {
      setSelectedChat(found);
    } else {
      console.warn("[CHAT] chatId not found:", chatId);
    }
  };

  
  return () => window.removeEventListener("rudal:open-chat", handler);
}, []);
  
useEffect(() => {
  const handler = (e) => {
    const { chatId } = e.detail || {};
    console.log("[CHAT] received rudal:open-chat", chatId);
    if (!chatId) return;

    // If you store the whole chat object:
    const found = chats?.find((c) => String(c.id) === String(chatId)) || null;
    if (found) {
      setActiveChat(chatId);
    } else {
      console.warn("[CHAT] chatId not found in chats list:", chatId);
    }
  };

 
  return () => window.removeEventListener("rudal:open-chat", handler);
}, [chats, setSelectedChat]);



  return (
    <div className="chat-container">
      {/* LEFT SIDEBAR */}
      <div className="sidebar-left">
        <div className="sidebar-header">
          <img src="rudal_logo.png" alt="Rudal" className="app-logo" />
          <h2>Rudal</h2>
        </div>

        <div className="user-info">
          <img
            src="https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg"
            alt="User"
            className="user-avatar"
          />
          <div>
            <div className="username">You</div>
            <select className="status-dropdown">
              <option>Available</option>
              <option>Away</option>
              <option>Do Not Disturb</option>
            </select>
          </div>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️
          </button>
        </div>

        <input
          className="search-bar"
          placeholder="Search people / chats"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="chat-list">
          {filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${
                selectedChat?.id === chat.id ? "active" : ""
              }`}
              onClick={() => setSelectedChat(chat)}
            >
              <img
                src={`https://i.pravatar.cc/50?u=${chat.id}`}
                alt={chat.name}
                className="chat-avatar"
              />
              <div className="chat-info">
                <div className="chat-top">
                  <span className="chat-name">{chat.name}</span>
                  <span
                    className={`status-circle ${chat.status}`}
                    title={chat.status}
                  ></span>
                </div>
                <div className="last-message">{chat.lastMessage}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CHAT WINDOW */}
      <div className={`chat-main ${showAddPeople ? "shrink" : ""}`}>
        {selectedChat ? (
          <>
            <div className="chat-header">
              <div className="chat-header-left">
                <img
                  src={`https://fvikcpdlrduilqwetkbd.supabase.co/storage/v1/object/public/avatars/user-avatars/rudal-default.jpg${selectedChat.id}`}
                  alt={selectedChat.name}
                  className="chat-header-avatar"
                />
                <span className="chat-header-name">{selectedChat.name}</span>
                <span
                  className={`status-circle ${selectedChat.status}`}
                  title={selectedChat.status}
                ></span>
              </div>

              <div className="chat-header-actions">
                <button className="icon-btn blue">📞</button>
                <button
                  className="icon-btn blue"
                  onClick={() => setShowAddPeople(!showAddPeople)}
                >
                  ➕
                </button>
              </div>
            </div>
            <div className="chat-history">Chat history goes here...</div>
            <div className="chat-input">
              <input placeholder="Type a message..." />
              <button>Send</button>
            </div>
          </>
        ) : (
          <div className="chat-placeholder">Select a chat to Start</div>
        )}
      </div>

      {/* RIGHT SIDEBAR (ADD PEOPLE) */}
      {showAddPeople && (
        <div className="sidebar-right">
          <h3>Add people</h3>
          <input
            className="search-bar"
            placeholder="Search people globally..."
          />
          <button className="create-group-btn">Create group with selected</button>
        </div>
      )}

      {/* ACCOUNT SETTINGS */}
      {showSettings && (
        <div className="settings-menu">
          <h3>Account settings</h3>
          <label>
            Profile picture
            <input type="file" accept="image/*" />
          </label>
          <label>
            Username
            <input type="text" />
          </label>
          <label>
            Email
            <input type="email" />
          </label>
          <div className="settings-actions">
            <button className="save-btn">Save</button>
            <button className="cancel-btn">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
