import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { useCall } from "../context/CallContext";

export function useIncomingCalls(userId) {
  const {
    setIncomingCall,
    setActiveCall,
    setCallPhase,
    playRingtone,
    stopRingtone,
    resetCall,
    activeCall,
  } = useCall();

  // Prevent duplicate popups for same call id (INSERT + UPDATE)
  const handledCallIdsRef = useRef(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`incoming-calls:${userId}`);

    const handleIncoming = async (call) => {
      if (!call) return;
      if (call.callee_id !== userId) return;

      // Only care about ringing calls
      if (call.status !== "ringing") return;

      if (handledCallIdsRef.current.has(call.id)) return;
      handledCallIdsRef.current.add(call.id);

      console.log("[CALL] incoming:", call);

      // Fetch caller profile (may fail if RLS blocks it)
      let callerProfile = null;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("username, avatar")
          .eq("id", call.caller_id)
          .single();

        if (error) {
          console.warn("[CALL] failed to load caller profile:", error);
        } else {
          callerProfile = data;
        }
      } catch (e) {
        console.warn("[CALL] caller profile fetch crashed:", e);
      }

      const enrichedCall = {
        ...call,
        caller_name: callerProfile?.username || "Unknown",
        caller_avatar: callerProfile?.avatar || null,
      };

      setIncomingCall(enrichedCall);
      setActiveCall(enrichedCall);
      setCallPhase("ringing_in");
      playRingtone();
    };

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "calls",
        filter: `callee_id=eq.${userId}`,
      },
      async (payload) => {
        await handleIncoming(payload.new);
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `callee_id=eq.${userId}`,
      },
      async (payload) => {
        const call = payload.new;
        // If it becomes ringing via UPDATE, handle it
        await handleIncoming(call);

        // If it ends, cleanup
        if (
          call?.status &&
          ["ended", "declined", "ignored", "missed", "canceled"].includes(call.status)
        ) {
          stopRingtone();
          await resetCall();
        }
      }
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[CALL] incoming channel subscribed");
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    userId,
    setIncomingCall,
    setActiveCall,
    setCallPhase,
    playRingtone,
    stopRingtone,
    resetCall,
  ]);
}
