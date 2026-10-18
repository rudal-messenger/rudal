import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export async function setUserStatus(userId, status) {
  await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId);
}

export function usePresence(userId, meta = {}) {
  const [state, setState] = useState({});

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("presence:global", {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      setState(channel.presenceState());
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: userId,
          ...meta,
          last_seen: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return state;
}