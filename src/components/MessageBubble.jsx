import React from "react";

export default function MessageBubble({ meId, senderProfile, content, ts, showSenderName }) {
  const isMine = senderProfile ? senderProfile.id === meId : false;
  const time = ts ? (new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : "";

  return (
    <div className={`bubble ${isMine ? "bubble-right" : "bubble-left"}`}>
      <div className="bubble-text">
        {showSenderName && !isMine && <div style={{ fontWeight: 700, marginBottom: 6 }}>{senderProfile?.username || "Unknown"}</div>}
        <div>{content}</div>
      </div>
      <div className="bubble-time">{time}</div>
    </div>
  );
}
