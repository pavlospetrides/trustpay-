import { describe, expect, it } from "vitest";
import { corpus, renderCorpusCase } from "./fixtures/universal-corpus";
import { readDocument } from "./document";

describe("independent synthetic invoice corpus", () => {
  it("contains 30 cases, including a separate unseen holdout and difficult documents", () => {
    expect(corpus).toHaveLength(30);
    expect(corpus.filter((test) => test.split === "holdout")).toHaveLength(6);
    expect(new Set(corpus.map((test) => test.layout)).size).toBe(12);
    expect(corpus.filter((test) => test.split === "holdout").every((test) => test.layout >= 6)).toBe(true);
    expect(new Set(corpus.map((test) => test.language)).size).toBeGreaterThanOrEqual(7);
    expect(corpus.some((test) => test.multipleInvoices)).toBe(true);
    expect(corpus.some((test) => test.promptInjection)).toBe(true);
  });
  it("renders and validates every generated document without Python", async () => {
    for (const test of corpus) {
      const rendered = await renderCorpusCase(test);
      const inspected = await readDocument(rendered.data, rendered.contentType);
      expect(inspected.page_count).toBeGreaterThanOrEqual(1);
      if (test.format === "digital_pdf") expect(inspected.text.length).toBeGreaterThan(50);
    }
  }, 120_000);
});
