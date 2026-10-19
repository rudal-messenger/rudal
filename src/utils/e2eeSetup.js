import { supabase } from "../supabaseClient";
import {
  generateKeyPair,
  exportPublicKey,
  exportPrivateKey,
} from "./e2ee";

export async function setupKeys(user) {
  if (!user?.id) return;

  const keyName = `rudal_private_key_${user.id}`;

  // Already have a private key for this account
  const storedPrivate = localStorage.getItem(keyName);
  if (storedPrivate) return;

  console.log("🔑 Generating new Rudal E2EE keypair...");

  // Generate fresh keypair
  const { publicKey, privateKey } = await generateKeyPair();

  // Store private key locally ONLY
  const exportedPrivate = await exportPrivateKey(privateKey);
  localStorage.setItem(keyName, exportedPrivate);

  // Export public key
  const exportedPublic = await exportPublicKey(publicKey);

  // Upload public key to profiles
  const { error } = await supabase
    .from("profiles")
    .update({ public_key: exportedPublic })
    .eq("id", user.id);

  if (error) {
    console.error("❌ Failed to upload public key:", error);
    return;
  }

  console.log("🔐 E2EE setup complete.");
}