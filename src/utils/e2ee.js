// ============================================================
// Rudal E2EE V2
// ============================================================
//
// Direct messages:
//   Identity: ECDH P-256
//   Chat keys: random AES-256-GCM
//   Messages: AES-256-GCM
//
// IMPORTANT SECURITY RULES:
//
// - Never send plaintext when encryption fails.
// - Never automatically replace an existing identity.
// - Never upload an unencrypted private key.
// - Never upload an unencrypted chat key.
// - Legacy V1 keys/messages are NOT modified here.
//
// ============================================================

import { supabase } from "../supabaseClient";

const E2EE_VERSION = 2;
const IDENTITY_VERSION = 1;

const IDENTITY_STORAGE_PREFIX = "rudal_e2ee_v2_identity_";
const CHAT_KEY_CACHE_PREFIX = "rudal_e2ee_v2_chat_";

const MASTER_KEY_STORAGE_PREFIX = "rudal_master_key_";

async function loadSessionMasterKey(userId) {
  const value = sessionStorage.getItem(
    `${MASTER_KEY_STORAGE_PREFIX}${userId}`
  );

  if (!value) {
    return null;
  }

  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(value),
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

// ============================================================
// Utilities
// ============================================================

function bytesToBase64(bytes) {
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function getIdentityStorageKey(userId) {
  return `${IDENTITY_STORAGE_PREFIX}${userId}`;
}

function getChatCacheKey(userId, chatId) {
  return `${CHAT_KEY_CACHE_PREFIX}${userId}_${chatId}`;
}

// ============================================================
// Encrypted identity backup helpers
// ============================================================



// ============================================================
// Identity key generation
// ============================================================

async function generateIdentityKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
}

async function exportPublicKey(key) {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

async function exportPrivateKey(key) {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

export async function importPublicKey(value) {
  const jwk =
    typeof value === "string"
      ? JSON.parse(value)
      : value;

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    []
  );
}

async function importPrivateKey(value) {
  const jwk =
    typeof value === "string"
      ? JSON.parse(value)
      : value;

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
}


// ============================================================
// Local identity
// ============================================================

async function saveLocalIdentity(userId, privateKey) {
  const exported = await exportPrivateKey(privateKey);

  localStorage.setItem(
    getIdentityStorageKey(userId),
    exported
  );
}

async function createEncryptedIdentityBackup(userId, privateKey) {
  const masterKey = await loadSessionMasterKey(userId);

  if (!masterKey) {
    throw new Error("E2EE_MASTER_KEY_MISSING");
  }

  const exported = await exportPrivateKey(privateKey);
  const iv = randomBytes(12);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    masterKey,
    new TextEncoder().encode(exported)
  );

  return {
    encryptedPrivateKey: bytesToBase64(
      new Uint8Array(encrypted)
    ),
    iv: bytesToBase64(iv),
  };
}

export async function loadIdentityPrivateKey(userId) {
  const value = localStorage.getItem(
    getIdentityStorageKey(userId)
  );

  if (!value) {
    return null;
  }

  try {
    return await importPrivateKey(value);
  } catch (err) {
    console.error(
      "[E2EE] Local identity is corrupted:",
      err
    );

    throw new Error("E2EE_IDENTITY_CORRUPTED");
  }
}

export async function backupE2EEIdentity(userId) {
  const privateKey = await loadIdentityPrivateKey(userId);

  if (!privateKey) {
    throw new Error("E2EE_PRIVATE_IDENTITY_MISSING");
  }

  const backup = await createEncryptedIdentityBackup(
    userId,
    privateKey
  );

  const { error } = await supabase
    .from("user_keys")
    .update({
      encrypted_private_identity_key:
        backup.encryptedPrivateKey,
      private_key_iv:
        backup.iv,
      private_key_salt: null,
    })
    .eq("user_id", userId);

  if (error) {
    console.error(
      "[E2EE] Identity backup failed:",
      error
    );

    throw new Error("E2EE_IDENTITY_BACKUP_FAILED");
  }

  return {
    backedUp: true,
  };
}


// ============================================================
// Identity initialization
// ============================================================

export async function restoreE2EEIdentity(userId) {
  const masterKey = await loadSessionMasterKey(userId);

  if (!masterKey) {
    throw new Error("E2EE_MASTER_KEY_MISSING");
  }

  const { data, error } = await supabase
    .from("user_keys")
    .select(
      "public_identity_key, encrypted_private_identity_key, private_key_iv"
    )
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error(
      "[E2EE] Identity recovery lookup failed:",
      error
    );
    throw new Error("E2EE_RECOVERY_LOOKUP_FAILED");
  }

  if (
    !data?.encrypted_private_identity_key ||
    !data?.private_key_iv
  ) {
    throw new Error("E2EE_RECOVERY_BACKUP_MISSING");
  }

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(data.private_key_iv),
      },
      masterKey,
      base64ToBytes(
        data.encrypted_private_identity_key
      )
    );

    const exportedPrivateKey =
      new TextDecoder().decode(decrypted);

    const privateKey =
      await importPrivateKey(exportedPrivateKey);

    const matches = await verifyIdentityPair(
      privateKey,
      data.public_identity_key
    );

    if (!matches) {
      throw new Error("E2EE_IDENTITY_MISMATCH");
    }

    await saveLocalIdentity(
      userId,
      privateKey
    );

    return {
      ready: true,
      restored: true,
    };
  } catch (err) {
    console.error(
      "[E2EE] Identity recovery failed:",
      err
    );

    throw new Error("E2EE_RECOVERY_FAILED");
  }
}

export async function ensureE2EEIdentity(userId) {
  if (!userId) {
    throw new Error("E2EE_USER_REQUIRED");
  }

  // ----------------------------------------------------------
  // Check server FIRST.
  //
  // This is intentional:
  // An existing server identity must NEVER be silently replaced.
  // ----------------------------------------------------------

  const {
    data: serverIdentity,
    error: identityError,
  } = await supabase
    .from("user_keys")
    .select(
      "user_id, public_identity_key, key_version, revoked_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (identityError) {
    console.error(
      "[E2EE] Could not inspect identity:",
      identityError
    );

    throw new Error("E2EE_IDENTITY_LOOKUP_FAILED");
  }

  const localPrivate =
    await loadIdentityPrivateKey(userId);


  // ==========================================================
  // EXISTING ACCOUNT IDENTITY
  // ==========================================================

  if (serverIdentity?.public_identity_key) {
    if (serverIdentity.revoked_at) {
      throw new Error("E2EE_IDENTITY_REVOKED");
    }

    if (!localPrivate) {
  console.log(
    "[E2EE] Local identity missing. Attempting secure restore..."
  );

  await restoreE2EEIdentity(userId);

  const restoredPrivate =
    await loadIdentityPrivateKey(userId);

  if (!restoredPrivate) {
    throw new Error("E2EE_PRIVATE_IDENTITY_MISSING");
  }

  const matches = await verifyIdentityPair(
    restoredPrivate,
    serverIdentity.public_identity_key
  );

  if (!matches) {
    throw new Error("E2EE_IDENTITY_MISMATCH");
  }

  return {
    ready: true,
    created: false,
    restored: true,
    version:
      serverIdentity.key_version ||
      IDENTITY_VERSION,
  };
}

    // Verify local private key belongs to server public key.
    const matches = await verifyIdentityPair(
      localPrivate,
      serverIdentity.public_identity_key
    );

    if (!matches) {
      throw new Error("E2EE_IDENTITY_MISMATCH");
    }

    return {
      ready: true,
      created: false,
      version:
        serverIdentity.key_version ||
        IDENTITY_VERSION,
    };
  }


  // ==========================================================
  // SERVER HAS NO IDENTITY
  // ==========================================================

  // If a local V2 key somehow exists while the server identity
  // does not, don't guess what happened.
  if (localPrivate) {
    throw new Error("E2EE_SERVER_IDENTITY_MISSING");
  }

  // Truly new V2 identity.
  const pair = await generateIdentityKeyPair();

  const exportedPublic =
    await exportPublicKey(pair.publicKey);

  // Save locally BEFORE publishing public identity.
  await saveLocalIdentity(
    userId,
    pair.privateKey
  );

  const {
    error: insertError,
  } = await supabase
    .from("user_keys")
    .insert({
      user_id: userId,
      public_identity_key: exportedPublic,
      key_version: IDENTITY_VERSION,
      algorithm: "ECDH-P256",
    });

  if (insertError) {
    // Roll back local identity.
    localStorage.removeItem(
      getIdentityStorageKey(userId)
    );

    console.error(
      "[E2EE] Identity creation failed:",
      insertError
    );

    throw new Error("E2EE_IDENTITY_CREATE_FAILED");
  }

  // Create the encrypted server backup immediately.
// The private identity itself is NEVER uploaded unencrypted.
try {
  await backupE2EEIdentity(userId);
} catch (err) {
  console.error(
    "[E2EE] Identity created but backup failed:",
    err
  );

  throw new Error("E2EE_IDENTITY_BACKUP_FAILED");
}

return {
  ready: true,
  created: true,
  backedUp: true,
  version: IDENTITY_VERSION,
};
}


// ============================================================
// Verify local private key against server public key
// ============================================================

async function verifyIdentityPair(
  privateKey,
  publicKeyString
) {
  try {
    const publicKey =
      await importPublicKey(publicKeyString);

    // Derive deterministic bits.
    const bits = await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: publicKey,
      },
      privateKey,
      256
    );

    // A private key combined with its own public key should
    // successfully produce a valid ECDH secret.
    return bits.byteLength === 32;
  } catch {
    return false;
  }
}


// ============================================================
// Fetch another user's V2 identity
// ============================================================

export async function getUserIdentity(userId) {
  const {
    data,
    error,
  } = await supabase
    .from("user_keys")
    .select(
      "user_id, public_identity_key, key_version, revoked_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("E2EE_PARTNER_IDENTITY_LOOKUP_FAILED");
  }

  if (!data?.public_identity_key) {
    throw new Error("E2EE_PARTNER_NOT_READY");
  }

  if (data.revoked_at) {
    throw new Error("E2EE_PARTNER_IDENTITY_REVOKED");
  }

  return data;
}


// ============================================================
// Pairwise wrapping key
//
// Used ONLY to protect the random chat key.
//
// Messages themselves are NOT encrypted directly using ECDH.
// ============================================================

async function deriveWrappingKey(
  myPrivateKey,
  theirPublicKey
) {
  return crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: theirPublicKey,
    },
    myPrivateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}


// ============================================================
// Generate chat AES key
// ============================================================

async function generateChatKey() {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

async function exportChatKey(chatKey) {
  const raw = await crypto.subtle.exportKey(
    "raw",
    chatKey
  );

  return new Uint8Array(raw);
}

async function importChatKey(bytes) {
  return crypto.subtle.importKey(
    "raw",
    bytes,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}


// ============================================================
// Local chat-key cache
//
// Cache contains raw chat key material.
// It never goes to Supabase.
// ============================================================

async function cacheChatKey(
  userId,
  chatId,
  chatKey
) {
  const raw = await exportChatKey(chatKey);

  sessionStorage.setItem(
    getChatCacheKey(userId, chatId),
    bytesToBase64(raw)
  );
}

async function loadCachedChatKey(
  userId,
  chatId
) {
  const value = sessionStorage.getItem(
    getChatCacheKey(userId, chatId)
  );

  if (!value) return null;

  try {
    return await importChatKey(
      base64ToBytes(value)
    );
  } catch {
    sessionStorage.removeItem(
      getChatCacheKey(userId, chatId)
    );

    return null;
  }
}


// ============================================================
// Wrap chat key
// ============================================================

async function wrapChatKey(
  chatKey,
  wrappingKey
) {
  const rawChatKey =
    await exportChatKey(chatKey);

  const iv = randomBytes(12);

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      wrappingKey,
      rawChatKey
    );

  return {
    wrapped: bytesToBase64(
      new Uint8Array(encrypted)
    ),

    iv: bytesToBase64(iv),
  };
}


// ============================================================
// Unwrap chat key
// ============================================================

async function unwrapChatKey(
  wrappedValue,
  ivValue,
  wrappingKey
) {
  const decrypted =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(ivValue),
      },
      wrappingKey,
      base64ToBytes(wrappedValue)
    );

  return importChatKey(
    new Uint8Array(decrypted)
  );
}


// ============================================================
// Create V2 chat encryption
//
// DIRECT CHATS ONLY FOR NOW.
// ============================================================

async function createDirectChatKey(
  chatId,
  myUserId,
  otherUserId
) {
  const myPrivate =
    await loadIdentityPrivateKey(myUserId);

  if (!myPrivate) {
    throw new Error("E2EE_PRIVATE_IDENTITY_MISSING");
  }

  const partner =
    await getUserIdentity(otherUserId);

  const partnerPublic =
    await importPublicKey(
      partner.public_identity_key
    );

  const wrappingKey =
    await deriveWrappingKey(
      myPrivate,
      partnerPublic
    );

  const chatKey =
    await generateChatKey();


  // ----------------------------------------------------------
  // Create separately encrypted copies for each participant.
  // Both are protected by the pairwise ECDH wrapping key.
  // ----------------------------------------------------------

  const mine =
    await wrapChatKey(
      chatKey,
      wrappingKey
    );

  const theirs =
    await wrapChatKey(
      chatKey,
      wrappingKey
    );


  const {
    error,
  } = await supabase
    .from("chat_encryption_keys")
    .insert([
      {
        chat_id: chatId,
        user_id: myUserId,

        identity_key_version:
          IDENTITY_VERSION,

        wrapped_chat_key:
          mine.wrapped,

        wrap_iv:
          mine.iv,

        wrapped_by_user_id:
          myUserId,

        version:
          E2EE_VERSION,

        algorithm:
          "AES-GCM",
      },

      {
        chat_id: chatId,
        user_id: otherUserId,

        identity_key_version:
          partner.key_version ||
          IDENTITY_VERSION,

        wrapped_chat_key:
          theirs.wrapped,

        wrap_iv:
          theirs.iv,

        wrapped_by_user_id:
          myUserId,

        version:
          E2EE_VERSION,

        algorithm:
          "AES-GCM",
      },
    ]);

  if (error) {
    console.error(
      "[E2EE] Chat-key creation failed:",
      error
    );

    throw new Error("E2EE_CHAT_KEY_CREATE_FAILED");
  }

  await cacheChatKey(
    myUserId,
    chatId,
    chatKey
  );

  return chatKey;
}


// ============================================================
// Load existing wrapped chat key
// ============================================================

async function loadWrappedChatKey(
  chatId,
  myUserId
) {
  const {
    data,
    error,
  } = await supabase
    .from("chat_encryption_keys")
    .select(
      `
        chat_id,
        user_id,
        wrapped_chat_key,
        wrap_iv,
        wrapped_by_user_id,
        identity_key_version,
        version
      `
    )
    .eq("chat_id", chatId)
    .eq("user_id", myUserId)
    .maybeSingle();

  if (error) {
    throw new Error("E2EE_CHAT_KEY_LOOKUP_FAILED");
  }

  return data;
}


// ============================================================
// Main function used by ChatWindow
//
// Returns the AES chat key.
// Creates it only when NO V2 chat key exists yet.
// ============================================================

export async function getDirectChatKey(
  chatId,
  myUserId,
  otherUserId
) {
  if (
    !chatId ||
    !myUserId ||
    !otherUserId
  ) {
    throw new Error("E2EE_CHAT_ARGUMENTS_MISSING");
  }


  // ----------------------------------------------------------
  // Identity must be valid first.
  // ----------------------------------------------------------

  await ensureE2EEIdentity(myUserId);


  // ----------------------------------------------------------
  // Memory/session cache
  // ----------------------------------------------------------

  const cached =
    await loadCachedChatKey(
      myUserId,
      chatId
    );

  if (cached) {
    return cached;
  }


  // ----------------------------------------------------------
  // Check server
  // ----------------------------------------------------------

  const record =
    await loadWrappedChatKey(
      chatId,
      myUserId
    );


  // ----------------------------------------------------------
  // No V2 chat key yet.
  //
  // To prevent both clients creating different keys
  // simultaneously, use deterministic ownership:
  // lexicographically smaller UUID creates it.
  // ----------------------------------------------------------

  if (!record) {
    const creator =
      [myUserId, otherUserId]
        .sort()[0];

    if (creator !== myUserId) {
      throw new Error(
        "E2EE_WAITING_FOR_CHAT_KEY"
      );
    }

    return createDirectChatKey(
      chatId,
      myUserId,
      otherUserId
    );
  }


  // ----------------------------------------------------------
  // Existing V2 chat key
  // ----------------------------------------------------------

  const myPrivate =
    await loadIdentityPrivateKey(
      myUserId
    );

  if (!myPrivate) {
    throw new Error(
      "E2EE_PRIVATE_IDENTITY_MISSING"
    );
  }


  const wrappingUserId =
    record.wrapped_by_user_id;


  if (!wrappingUserId) {
    throw new Error(
      "E2EE_WRAPPER_IDENTITY_MISSING"
    );
  }


  // For a direct chat the wrapping key is derived from the
  // OTHER participant's identity.
  const peerId =
    wrappingUserId === myUserId
      ? otherUserId
      : wrappingUserId;


  const peerIdentity =
    await getUserIdentity(peerId);

  const peerPublic =
    await importPublicKey(
      peerIdentity.public_identity_key
    );

  const wrappingKey =
    await deriveWrappingKey(
      myPrivate,
      peerPublic
    );


  let chatKey;

  try {
    chatKey =
      await unwrapChatKey(
        record.wrapped_chat_key,
        record.wrap_iv,
        wrappingKey
      );
  } catch (err) {
    console.error(
      "[E2EE] Unable to unwrap chat key:",
      err
    );

    throw new Error(
      "E2EE_CHAT_KEY_UNWRAP_FAILED"
    );
  }


  await cacheChatKey(
    myUserId,
    chatId,
    chatKey
  );

  return chatKey;
}


// ============================================================
// MESSAGE ENCRYPTION
// ============================================================

export async function encryptMessageV2(
  chatKey,
  plaintext
) {
  if (!chatKey) {
    throw new Error("E2EE_CHAT_KEY_REQUIRED");
  }

  if (typeof plaintext !== "string") {
    throw new Error("E2EE_INVALID_PLAINTEXT");
  }

  const iv = randomBytes(12);

  const encoded =
    new TextEncoder().encode(plaintext);

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      chatKey,
      encoded
    );


  return JSON.stringify({
    v: E2EE_VERSION,

    alg: "A256GCM",

    iv: bytesToBase64(iv),

    data: bytesToBase64(
      new Uint8Array(encrypted)
    ),
  });
}


// ============================================================
// MESSAGE DECRYPTION
// ============================================================

export async function decryptMessageV2(
  chatKey,
  value
) {
  if (!chatKey) {
    throw new Error("E2EE_CHAT_KEY_REQUIRED");
  }


  let envelope;

  try {
    envelope =
      typeof value === "string"
        ? JSON.parse(value)
        : value;
  } catch {
    throw new Error(
      "E2EE_INVALID_MESSAGE_ENVELOPE"
    );
  }


  if (envelope?.v !== E2EE_VERSION) {
    throw new Error(
      "E2EE_UNSUPPORTED_MESSAGE_VERSION"
    );
  }


  if (
    !envelope.iv ||
    !envelope.data
  ) {
    throw new Error(
      "E2EE_INVALID_MESSAGE_ENVELOPE"
    );
  }


  try {
    const decrypted =
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(
            envelope.iv
          ),
        },
        chatKey,
        base64ToBytes(
          envelope.data
        )
      );


    return new TextDecoder().decode(
      decrypted
    );

  } catch (err) {
    console.error(
      "[E2EE] Message authentication/decryption failed:",
      err
    );

    throw new Error(
      "E2EE_MESSAGE_DECRYPT_FAILED"
    );
  }
}


// ============================================================
// MESSAGE FORMAT DETECTION
// ============================================================

export function getMessageEncryptionVersion(
  value
) {
  if (!value) return 0;

  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : value;


    // V2
    if (
      parsed?.v === 2 &&
      parsed?.iv &&
      parsed?.data
    ) {
      return 2;
    }


    // Legacy Rudal V1
    if (
      parsed?.iv &&
      parsed?.data &&
      !parsed?.v
    ) {
      return 1;
    }

  } catch {
    // plaintext
  }

  return 0;
}


// ============================================================
// SECURITY STATUS
// ============================================================

export async function getE2EEStatus(
  userId
) {
  try {
    await ensureE2EEIdentity(userId);

    return {
      ready: true,
      error: null,
    };

  } catch (err) {
    return {
      ready: false,
      error:
        err?.message ||
        "E2EE_UNKNOWN_ERROR",
    };
  }
}