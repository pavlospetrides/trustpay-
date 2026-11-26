import { describe, expect, it } from "vitest";
import { characterErrorRate } from "./ocr-metrics";

describe("OCR measurement", () => {
  it("measures character edits against independent reference text", () => {
    expect(characterErrorRate("ABCD", "ABXD")).toEqual({ edits: 1, reference_characters: 4, rate: 0.25 });
    expect(characterErrorRate("", "AB")).toEqual({ edits: 2, reference_characters: 0, rate: null });
  });
});
