const TARGET_WORDS = 800;
const OVERLAP_WORDS = 80;

function splitSentences(text: string): string[] {
  // Bulgarian + English sentence boundaries
  return text
    .split(/(?<=[.!?])\s+(?=[А-ЯA-Z])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function chunkText(text: string): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentCount = 0;

  for (const s of sentences) {
    const c = wordCount(s);
    if (currentCount + c > TARGET_WORDS && current.length > 0) {
      chunks.push(current.join(" "));
      // overlap: keep last few sentences
      const overlap: string[] = [];
      let overlapCount = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const sentenceCount = wordCount(current[i]);
        if (overlapCount + sentenceCount > OVERLAP_WORDS) break;
        overlap.unshift(current[i]);
        overlapCount += sentenceCount;
      }
      current = [...overlap, s];
      currentCount = overlapCount + c;
    } else {
      current.push(s);
      currentCount += c;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks;
}
