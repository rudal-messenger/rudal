import { supabase } from "../../supabaseClient";
import {
  ensureFlyrChat,
  FLYR_USER_ID,
} from "../../utils/flyr";

export async function openOrCreateDm(targetUserId) {
  if (targetUserId === FLYR_USER_ID) {
    return ensureFlyrChat();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const currentUserId = user.id;

  // 1. Bestehenden gemeinsamen Chat suchen.
  const { data: existingChats, error: fetchError } = await supabase
    .from("chat_members")
    .select("chat_id")
    .in("user_id", [currentUserId, targetUserId]);

  if (fetchError) throw fetchError;

  const chatCounts = {};

  (existingChats || []).forEach((row) => {
    chatCounts[row.chat_id] =
      (chatCounts[row.chat_id] || 0) + 1;
  });

  const existingChatId = Object.keys(chatCounts).find(
    (chatId) => chatCounts[chatId] === 2
  );

  if (existingChatId) {
    return existingChatId;
  }

  // 2. Neuen Chat erstellen.
  const { data: newChat, error: chatError } = await supabase
    .from("chats")
    .insert([{ is_group: false }])
    .select()
    .single();

  if (chatError) throw chatError;

  const chatId = newChat.id;

  // 3. Beide Benutzer hinzufügen.
  const { error: membersError } = await supabase
    .from("chat_members")
    .insert([
      { chat_id: chatId, user_id: currentUserId },
      { chat_id: chatId, user_id: targetUserId },
    ]);

  if (membersError) throw membersError;

  return chatId;
}