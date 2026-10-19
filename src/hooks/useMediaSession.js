import { useEffect, useState } from "react";

export default function useMediaSession() {
  const [media, setMedia] = useState(null);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const update = () => {
      const md = navigator.mediaSession.metadata;
      if (!md) {
        setMedia(null);
        return;
      }

      setMedia({
        title: md.title || "Unknown Title",
        artist: md.artist || "Unknown Artist",
        artwork:
          md.artwork?.[md.artwork.length - 1]?.src ||
          "/default-cover.png",
      });
    };

    navigator.mediaSession.setActionHandler("play", () => {
      navigator.mediaSession.playbackState = "playing";
      update();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      navigator.mediaSession.playbackState = "paused";
      update();
    });

    // Monitor any metadata changes
    const interval = setInterval(update, 500);

    return () => clearInterval(interval);
  }, []);

  return media;
}
