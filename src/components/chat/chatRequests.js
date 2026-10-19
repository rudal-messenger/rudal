import { supabase } from "../../supabaseClient";
import {
  ensureFlyrChat,
  FLYR_USER_ID,
} from "../../utils/flyr";

export async function openOrCreateDm(meId, otherId) {
  if (!meId || !otherId) return null;

  if (otherId === FLYR_USER_ID) {
    return {
      chatId: await ensureFlyrChat(),
      blocked: false,
    };
  }

  // Bestehenden gemeinsamen Chat suchen.
  const { data: memberships, error } = await supabase
    .from("chat_members")
    .select("chat_id,user_id")
    .in("user_id", [meId, otherId]);

  if (error) {
    console.error("membership lookup failed", error);
    return null;
  }

  const counts = {};

  (memberships || []).forEach((m) => {
    counts[m.chat_id] = (counts[m.chat_id] || 0) + 1;
  });

  const existingChatId = Object.keys(counts).find(
    (chatId) => counts[chatId] === 2
  );

  if (existingChatId) {
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("*")
      .eq("id", existingChatId)
      .single();

    if (chatError) {
      console.error("chat fetch failed", chatError);
      return null;
    }

    if (chat.blocked_by) {
      if (chat.blocked_by === meId) {
        return {
          chatId: existingChatId,
          blocked: true,
        };
      }

      return { blocked: true };
    }

    return { chatId: existingChatId };
  }

  // Neuen normalen Chat mit Nachrichtenanfrage erstellen.
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .insert({
      is_group: false,
      chat_status: "pending",
      initiator_id: meId,
      blocked_by: null,
    })
    .select()
    .single();

  if (chatError) {
    console.error("chat create failed", chatError);
    return null;
  }

  const chatId = chat.id;

  const { error: memberError } = await supabase
    .from("chat_members")
    .insert([
      { chat_id: chatId, user_id: meId },
      { chat_id: chatId, user_id: otherId },
    ]);

  if (memberError) {
    console.error("member insert failed", memberError);
    return null;
  }

  return { chatId };
}