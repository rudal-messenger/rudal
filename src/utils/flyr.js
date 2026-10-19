// 3. NEUE DATEI: client/src/utils/flyr.js

import { supabase } from "../supabaseClient";

export const FLYR_USER_ID =
  "6d58a3ee-0f25-4896-aa60-6a77f8e5c18f";

export const isFlyrChat = (chat) =>
  !!chat &&
  !chat.is_group &&
  (
    chat.otherId === FLYR_USER_ID ||
    chat.other?.id === FLYR_USER_ID
  );

export async function ensureFlyrChat() {
  const { data, error } = await supabase.rpc("ensure_flyr_chat");

  if (error) {
    throw new Error(`Flyr setup failed: ${error.message}`);
  }

  return data;
}