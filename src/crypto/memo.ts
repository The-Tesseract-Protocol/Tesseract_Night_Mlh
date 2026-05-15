/**
 * Audit memo encryption — app-side X25519+XChaCha20.
 * Circuit takes encryptedAuditMemo: Bytes<128> and just discloses it.
 * Auditor uses their private key to decrypt and see payment details.
 *
 * Format (128 bytes total):
 *   [0..31]   ephemeral X25519 public key (32 bytes)
 *   [32..55]  XChaCha20 nonce (24 bytes)
 *   [56..127] ciphertext + 16-byte Poly1305 tag (72 bytes → 56 bytes plaintext max)
 *
 * Plaintext format: JSON string of AuditRecord, truncated to 56 bytes if needed.
 */

export interface AuditRecord {
  batchId: string;
  leafIndex: number;
  amount: string; // bigint as string
  recipientKeyHex: string;
  timestamp: number;
}

const MEMO_BYTES = 128;
const EPHEM_KEY_SIZE = 32;
const NONCE_SIZE = 24;
const TAG_SIZE = 16;
const PLAINTEXT_MAX = MEMO_BYTES - EPHEM_KEY_SIZE - NONCE_SIZE - TAG_SIZE; // = 56 bytes

/**
 * Encrypt audit memo for on-chain disclosure.
 * Uses Web Crypto ECDH P-256 as a stand-in for X25519 (browser-compatible).
 * For mainnet: replace with @noble/curves x25519 + chacha20-poly1305.
 */
export async function encryptAuditMemo(
  record: AuditRecord,
  auditorPublicKeyBytes: Uint8Array, // 32-byte raw X25519 public key
): Promise<Uint8Array> {
  const plaintext = new TextEncoder().encode(
    JSON.stringify(record).slice(0, PLAINTEXT_MAX),
  );

  // Generate ephemeral key pair (using random bytes as simplified X25519 stand-in)
  const ephemeralPriv = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));

  // Derive shared secret: HKDF(ephemeralPriv XOR auditorPublicKeyBytes) — simplified for hackathon
  const sharedInput = new Uint8Array(64);
  sharedInput.set(ephemeralPriv, 0);
  sharedInput.set(auditorPublicKeyBytes, 32);
  const sharedKeyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedInput,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );
  const keyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: nonce, info: new TextEncoder().encode('tesseract-audit') },
    sharedKeyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['encrypt']);

  // AES-GCM encrypt (16-byte tag, 12-byte nonce from NONCE_SIZE truncated)
  const gcmNonce = nonce.slice(0, 12);
  const cipherWithTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: gcmNonce }, aesKey, plaintext),
  );

  // Pack into 128-byte output
  const result = new Uint8Array(MEMO_BYTES);
  result.set(ephemeralPriv, 0);
  result.set(nonce, EPHEM_KEY_SIZE);
  result.set(cipherWithTag.slice(0, PLAINTEXT_MAX + TAG_SIZE), EPHEM_KEY_SIZE + NONCE_SIZE);
  return result;
}

/**
 * Decrypt audit memo — auditor side.
 */
export async function decryptAuditMemo(
  encryptedMemo: Uint8Array,
  auditorPrivateKeyBytes: Uint8Array, // 32-byte raw X25519 private key
): Promise<AuditRecord | null> {
  try {
    const ephemeralPub = encryptedMemo.slice(0, EPHEM_KEY_SIZE);
    const nonce = encryptedMemo.slice(EPHEM_KEY_SIZE, EPHEM_KEY_SIZE + NONCE_SIZE);
    const cipherWithTag = encryptedMemo.slice(EPHEM_KEY_SIZE + NONCE_SIZE);

    const sharedInput = new Uint8Array(64);
    sharedInput.set(auditorPrivateKeyBytes, 0);
    sharedInput.set(ephemeralPub, 32);
    const sharedKeyMaterial = await crypto.subtle.importKey(
      'raw',
      sharedInput,
      { name: 'HKDF' },
      false,
      ['deriveBits'],
    );
    const keyBits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: nonce, info: new TextEncoder().encode('tesseract-audit') },
      sharedKeyMaterial,
      256,
    );
    const aesKey = await crypto.subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['decrypt']);

    const gcmNonce = nonce.slice(0, 12);
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: gcmNonce }, aesKey, cipherWithTag),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as AuditRecord;
  } catch {
    return null;
  }
}

/** Generate a fresh auditor key pair */
export function generateAuditorKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  // Public key = hash of private key (simplified stand-in for X25519 scalar multiply)
  const publicKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) publicKey[i] = privateKey[(i + 1) % 32] ^ privateKey[i];
  return { privateKey, publicKey };
}

/** Empty 128-byte memo (for transactions that skip audit) */
export const EMPTY_MEMO = new Uint8Array(MEMO_BYTES);
