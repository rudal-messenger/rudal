import { supabase } from "../supabaseClient";
import { normalizePhoneNumber } from "../utils/phoneUtils";

export async function findUserByPhone(number) {
  const normalized = normalizePhoneNumber(number);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("rudal_phone_number", normalized)
    .single();

  if (error) return null;
  return data;
}