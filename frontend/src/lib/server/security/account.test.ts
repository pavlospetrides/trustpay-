import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { AccountProtector, DraftCipher, normalizeIban } from "./account";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const intake = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const iban = "GB82WEST12345698765432";

describe("Python encrypted data compatibility", () => {
  it("normalizes and validates IBAN checksums", () => {
    expect(normalizeIban("GB82 WEST 1234 5698 7654 32")).toBe(iban);
    expect(() => normalizeIban("GB82 WEST 1234 5698 7654 33")).toThrow();
  });

  it("ignores dashes like spaces and checks the registry length per country", () => {
    expect(normalizeIban("GB82-WEST-1234-5698-7654-32")).toBe(iban);
    const protector = new AccountProtector(Buffer.alloc(32, "a"), Buffer.alloc(32, "b"));
    expect(protector.protect("gb82-west 1234-5698 7654-32").fingerprint).toBe(protector.protect(iban).fingerprint);
    // A checksum-valid 24-character IBAN that claims to be Cypriot (CY is 28): the length rule, not the checksum, rejects it.
    const withCheckDigits = (country: string, bban: string) => { let r = 0; for (const c of `${bban}${country}00`) for (const d of /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c) r = (r * 10 + Number(d)) % 97; return `${country}${String(98 - r).padStart(2, "0")}${bban}`; };
    const short = withCheckDigits("CY", "00200128000000120052");
    expect(() => normalizeIban(short)).toThrow("A CY IBAN must have 28 characters");
    expect(normalizeIban("CY17 0020 0128 0000 0012 0052 7600")).toBe("CY17002001280000001200527600");
    // Countries outside the table keep the generic rule.
    expect(() => normalizeIban("ZZ00")).toThrow("A valid IBAN is required");
  });

  it("reads Python AES-GCM account ciphertext and preserves HMAC fingerprint", () => {
    const key = Buffer.alloc(32, "a");
    // Produced by Python cryptography AESGCM with a fixed synthetic nonce and key.
    const ciphertext = Buffer.from("070707070707070707070707147a22f2d52542864d5378ec6cf4484f51658392089112812f4c30349a9c9ce306640f279f0e", "hex");
    const protector = new AccountProtector(key, Buffer.alloc(32, "b"));
    expect(protector.reveal(ciphertext)).toBe(iban);
    const result = protector.protect("GB82 WEST 1234 5698 7654 32");
    expect(result.fingerprint).toBe("4b904895d95d3c980fa21df11a4bbc8e075ae2af41312d605a9985ec75392e0b");
    expect(result.last4).toBe("5432");
    expect(protector.reveal(result.encrypted)).toBe(iban);
  });

  it("reads a Python-format intake draft only for its original tenant and intake", () => {
    const key = createHash("sha256").update("synthetic test key").digest();
    const fields = { iban, supplier_name: "Synthetic Supplier" };
    // Produced by Python DraftCipher's JSON serialization, AAD, and AESGCM.
    const encrypted = Buffer.from("0808080808080808080808081907a523402e1fe6b46c09afdf671ade873315b6459e48af5a880f80b4e67894a81d0a17b394fd16c209369b0635ca01171093a8946f0e47de8630e3d5951995a42f08d1aaea2bba803ccc3e51a913cc958acf542425", "hex");
    const drafts = new DraftCipher(key);
    expect(drafts.open(encrypted, org, intake)).toEqual(fields);
    expect(() => drafts.open(encrypted, org, "cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toThrow();
  });
});
