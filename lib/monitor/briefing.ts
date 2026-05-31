import { streamHermes, type HermesMessage } from "@/lib/hermes-client";
import type { Procedure } from "@/lib/monitor/types";

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

export async function generateBriefing(
  vertical: string,
  procedures: Procedure[],
): Promise<string> {
  if (procedures.length === 0) {
    return `Няма нови процедури за вертикал "${vertical}" днес.`;
  }

  const proceduresList = procedures
    .map(
      (p, i) =>
        `${i + 1}. ${p.title}\n   Възложител: ${p.publisher ?? "?"}\n   Стойност: ${p.estimated_value?.toLocaleString("bg-BG") ?? "?"} лв.\n   Риск: ${p.risk_level}/10\n   Бележки: ${p.risk_notes ?? "—"}`,
    )
    .join("\n\n");

  const messages: HermesMessage[] = [
    {
      role: "system",
      content:
        "Ти си експерт-сводител по обществени поръчки. Изготвяш кратък сутрешен брифинг на български. Не повече от 200 думи. Започни с цифрова сводка (брой нови, брой рискови). Завърши с препоръка за действие за деня.",
    },
    {
      role: "user",
      content: `Изготви сутрешен брифинг за вертикал "${vertical}". Нови процедури днес:\n\n${proceduresList}`,
    },
  ];

  const { stream, fullText } = await streamHermes({ messages, timeoutMs: 30_000 });
  await collect(stream);
  return fullText;
}
