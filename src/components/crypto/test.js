const masterKey = await generateMasterKey();

const salt = generateSalt();

const passwordKey = await derivePasswordKey(
  "SuperSecretPassword123",
  salt
);

const { encrypted, iv } = await encryptMasterKey(
  masterKey,
  passwordKey
);

const restoredMasterKey = await decryptMasterKey(
  encrypted,
  iv,
  passwordKey
);

console.log(masterKey);
console.log(restoredMasterKey);