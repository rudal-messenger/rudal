import React from "react";
import "../styles/MiniPlayer.css";

export default function MiniPlayer({ media }) {
  if (!media) return null; // hidden unless playing

  const playPause = () => {
    if (!navigator.mediaSession) return;
    const state = navigator.mediaSession.playbackState;
    navigator.mediaSession.setActionHandler(
      state === "playing" ? "pause" : "play",
      () => {}
    );
  };

  const next = () => {
    navigator.mediaSession.playbackState = "playing";
    try {
      navigator.mediaSession.setActionHandler("nexttrack", () => {});
    } catch {}
  };

  const prev = () => {
    navigator.mediaSession.playbackState = "playing";
    try {
      navigator.mediaSession.setActionHandler("previoustrack", () => {});
    } catch {}
  };

  return (
    <div className="mini-player">
      <img src={media.artwork} className="mini-cover" alt="" />

      <div className="mini-track-info">
        <div className="mini-title">{media.title}</div>
        <div className="mini-artist">{media.artist}</div>
      </div>

      <div className="mini-buttons">
        <button onClick={prev}>⏮️</button>
        <button onClick={playPause}>⏯️</button>
        <button onClick={next}>⏭️</button>
      </div>
    </div>
  );
}
