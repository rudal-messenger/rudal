import { supabase } from "../supabaseClient";

export function normalizeRudalNumber(value) {
  const raw = String(value ?? "").trim();

  if (!/^[\d\s()-]+$/.test(raw)) return "";

  const digits = raw.replace(/\D/g, "");

  return (
    /^1\d{12}$/.test(digits) &&
    Number(digits.slice(0, 4)) > 1000
  )
    ? digits
    : "";
}

export function formatRudalNumber(value) {
  const digits = normalizeRudalNumber(value);

  if (!digits) return "";

  return [
    digits.slice(0, 4),
    digits.slice(4, 7),
    digits.slice(7, 10),
    digits.slice(10),
  ].join(" ");
}

export async function claimRudalNumber(countryCode) {
  const { data, error } = await supabase.rpc(
    "claim_rudal_number",
    {
      p_country_code: Number(countryCode),
    }
  );

  if (error) throw error;

  return data;
}

export async function findUserByRudalNumber(value) {
  const number = normalizeRudalNumber(value);

  if (!number) {
    throw new Error(
      "Enter all 13 digits, including the Rudal country prefix."
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar, status, rudal_number")
    .eq("rudal_number", number)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("No Rudal user has this number.");
  }

  return data;
}