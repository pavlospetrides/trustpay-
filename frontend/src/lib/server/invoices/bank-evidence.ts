import { normalizeIban } from "../security/account";

export function validIbansInText(text: string): Set<string> {
  const values = new Set<string>();
  for (const line of text.toUpperCase().split(/\r?\n/)) {
    const starts = [...line.matchAll(/\b[A-Z]{2}\d{2}/g)];
    for (const [index, start] of starts.entries()) {
      const followingStart = starts[index + 1]?.index ?? line.length;
      const candidate = line.slice(start.index, followingStart).match(/^[A-Z0-9 \t]{15,60}/)?.[0] ?? "";
      for (let end = candidate.length; end >= 15; end--) {
        const prefix = candidate.slice(0, end).trimEnd();
        if (!/[A-Z0-9]$/.test(prefix)) continue;
        try { values.add(normalizeIban(prefix)); break; } catch { /* Try the next token boundary. */ }
      }
    }
  }
  return values;
}

export function accountAppearsInEvidence(text: string, account: string): boolean {
  const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const value = compact(account);
  return value.length >= 15 && compact(text).includes(value);
}
