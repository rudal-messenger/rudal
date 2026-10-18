export function normalizePhoneNumber(input) {
  return "+" + input.replace(/\D/g, "");
}