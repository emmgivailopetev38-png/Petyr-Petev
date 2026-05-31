import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/knowledge/chunker";

describe("chunkText", () => {
  it("returns empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    const text = "Това е кратък текст. Има няколко изречения. И още едно.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("кратък");
  });

  it("splits long text into multiple chunks", () => {
    const sentence = "Това е изречение с известен брой думи в него за тест на чункване. ";
    const longText = sentence.repeat(200); // ~3000 words
    const chunks = chunkText(longText);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("produces overlapping chunks on long text", () => {
    const sentences = Array.from({ length: 200 }, (_, i) =>
      `Изречение номер ${i} съдържа различен текст за разграничаване между чъповете. `,
    ).join("");
    const chunks = chunkText(sentences);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Last sentences of chunk[0] should appear in start of chunk[1] (overlap)
    const lastWordsOfFirst = chunks[0].split(/\s+/).slice(-20).join(" ");
    const firstWordsOfSecond = chunks[1].split(/\s+/).slice(0, 40).join(" ");
    // There should be SOME word overlap
    const overlap = lastWordsOfFirst
      .split(/\s+/)
      .filter((w) => firstWordsOfSecond.includes(w)).length;
    expect(overlap).toBeGreaterThan(0);
  });
});
