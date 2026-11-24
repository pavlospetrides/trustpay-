import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export function normalizeIban(value: string): string {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) throw new Error("A valid IBAN is required");
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) throw new Error("Invalid IBAN check digits");
  return iban;
}

function encrypt(key: Buffer, plain: Buffer, aad?: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  if (aad) cipher.setAAD(aad);
  return Buffer.concat([nonce, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}

function decrypt(key: Buffer, encrypted: Buffer, aad?: Buffer): Buffer {
  if (encrypted.length < 29) throw new Error("Invalid encrypted data");
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(0, 12));
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(encrypted.subarray(-16));
  return Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]);
}

export class AccountProtector {
  constructor(private readonly encryptionKey: Buffer, private readonly fingerprintKey: Buffer) {
    if (encryptionKey.length !== 32 || fingerprintKey.length < 32) throw new Error("Account encryption and fingerprint keys must be at least 32 bytes");
  }

  static fromEnvironment(): AccountProtector {
    const encryption = process.env.TRUSTPAY_IBAN_ENCRYPTION_KEY;
    const fingerprint = process.env.TRUSTPAY_IBAN_FINGERPRINT_KEY;
    if (!encryption || !fingerprint) throw new Error("PostgreSQL mode requires both server-only IBAN keys");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encryption) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(fingerprint)) throw new Error("IBAN keys must be base64-encoded 32-byte values");
    return new AccountProtector(Buffer.from(encryption, "base64"), Buffer.from(fingerprint, "base64"));
  }

  protect(raw: string): { encrypted: Buffer; fingerprint: string; last4: string } {
    const iban = normalizeIban(raw);
    return { encrypted: encrypt(this.encryptionKey, Buffer.from(iban)), fingerprint: createHmac("sha256", this.fingerprintKey).update(iban).digest("hex"), last4: iban.slice(-4) };
  }

  reveal(encrypted: Buffer): string { return decrypt(this.encryptionKey, encrypted).toString("utf8"); }
  draftCipher(): DraftCipher { return new DraftCipher(this.encryptionKey); }
}

export class DraftCipher {
  constructor(private readonly encryptionKey: Buffer) {
    if (encryptionKey.length !== 32) throw new Error("A 32-byte encryption key is required");
  }
  private aad(organizationId: string, intakeId: string): Buffer {
    return Buffer.from(`trustpay-intake:${organizationId}:${intakeId}`, "ascii");
  }
  seal(fields: Record<string, unknown>, organizationId: string, intakeId: string): Buffer {
    const sorted = Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
    return encrypt(this.encryptionKey, Buffer.from(JSON.stringify(sorted)), this.aad(organizationId, intakeId));
  }
  open(encrypted: Buffer, organizationId: string, intakeId: string): Record<string, unknown> {
    return JSON.parse(decrypt(this.encryptionKey, encrypted, this.aad(organizationId, intakeId)).toString("utf8")) as Record<string, unknown>;
  }
}
