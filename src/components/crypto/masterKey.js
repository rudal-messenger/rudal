// src/crypto/masterKey.js

/**
 * Encrypts the exported master key using the password-derived key.
 */
export async function encryptMasterKey(masterKey, passwordKey) {
  const rawMasterKey = await exportMasterKey(masterKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    passwordKey,
    rawMasterKey
  );

  return {
    encrypted,
    iv,
  };
}

/**
 * Decrypts the encrypted master key.
 */
export async function decryptMasterKey(
  encryptedMasterKey,
  iv,
  passwordKey
) {
  const rawMasterKey = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    passwordKey,
    encryptedMasterKey
  );

  return importMasterKey(rawMasterKey);
}

/**
 * 
 * 
 * Generates a new AES-256 master key.
 */
export async function generateMasterKey() {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // exportable
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a CryptoKey into raw bytes.
 */
export async function exportMasterKey(masterKey) {
  return crypto.subtle.exportKey("raw", masterKey);
}

/**
 * Imports raw bytes back into a CryptoKey.
 */
export async function importMasterKey(rawKey) {
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    {
      name: "AES-GCM",
    },
    true,
    ["encrypt", "decrypt"]
  );
}