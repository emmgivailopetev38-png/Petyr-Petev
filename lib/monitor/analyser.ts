import { streamHermes, type HermesMessage } from "@/lib/hermes-client";
import type { ScrapedProcedure, AnalysisResult } from "@/lib/monitor/types";

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

const SYSTEM_PROMPT = `Ти си експерт-аудитор по обществени поръчки в България. Анализирай дадена обществена поръчка и върни СТРОГО JSON със следния формат:

{
  "vertical": "food" | "construction" | "supervision" | "deliveries" | "services" | "framework",
  "risk_level": число от 0 до 10 (0=безпроблемна, 10=много рискова за участие),
  "risk_notes": "кратко описание на основните рискове — двусмислия в спецификацията, ограничителни условия, проблематични критерии за оценка, нереалистични срокове",
  "draft_appeal": "пълен текст на жалба към КЗК, ако risk_level >= 7, иначе null"
}

Класификация по вертикала:
- food: храни, хранителни продукти
- construction: строителство, СМР, реконструкции
- supervision: строителен надзор
- deliveries: доставки на стоки (без строителство)
- services: услуги (IT, консултантски, обучителни)
- framework: рамкови споразумения

ВАЖНО: Върни САМО JSON, без markdown ограждения, без обяснения.`;

export async function analyseProcedure(p: ScrapedProcedure): Promise<AnalysisResult> {
  const userPrompt = `Заглавие: ${p.title}
Възложител: ${p.publisher}
Прогнозна стойност: ${p.estimated_value ?? "няма"} лв.
Срок: ${p.deadline ?? "няма"}

Описание:
${p.raw_text}

Анализирай и върни JSON.`;

  const messages: HermesMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const { stream, fullText } = await streamHermes({ messages, timeoutMs: 45_000 });
  await collect(stream);
  const text = await fullText;

  // Try to extract JSON
  let parsed: unknown;
  try {
    // Sometimes models wrap in ```json ... ``` — strip
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const jsonStr =
      firstBrace >= 0 && lastBrace > firstBrace
        ? cleaned.slice(firstBrace, lastBrace + 1)
        : cleaned;
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      vertical: "services",
      risk_level: 0,
      risk_notes: "Не успях да парсна анализ от модела: " + text.slice(0, 200),
      draft_appeal: null,
    };
  }

  const obj = parsed as Partial<AnalysisResult>;
  return {
    vertical: typeof obj.vertical === "string" ? obj.vertical : "services",
    risk_level:
      typeof obj.risk_level === "number" && obj.risk_level >= 0 && obj.risk_level <= 10
        ? Math.round(obj.risk_level)
        : 0,
    risk_notes: typeof obj.risk_notes === "string" ? obj.risk_notes : "",
    draft_appeal: typeof obj.draft_appeal === "string" ? obj.draft_appeal : null,
  };
}
