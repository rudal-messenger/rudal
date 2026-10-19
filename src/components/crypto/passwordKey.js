// src/crypto/passwordKey.js

/**
 * Creates a random salt.
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Imports the user's password.
 */
async function importPassword(password) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
}

/**
 * Derives an AES-256 key from the password.
 */
export async function derivePasswordKey(password, salt) {
  const passwordKey = await importPassword(password);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 600000,
      hash: "SHA-256",
    },
    passwordKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}