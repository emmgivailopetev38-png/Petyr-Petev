import type { ScrapedProcedure } from "@/lib/monitor/types";

// STUB: returns mock procedures for MVP. Real aop.bg scraper to be wired later.
// In production, replace with actual fetch + parse of aop.bg public listing.
export async function scrapeNewProcedures(): Promise<ScrapedProcedure[]> {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 7 * 86400000).toISOString();

  return [
    {
      aop_id: `STUB-${today}-001`,
      source_url: "https://www2.aop.bg/stub/001",
      title: "Доставка на хранителни продукти за общинско обединение „Здравец“",
      publisher: "Община Пловдив",
      estimated_value: 280000,
      deadline: tomorrow,
      raw_text:
        "Предмет: периодична доставка на пресни плодове и зеленчуци, замразени продукти и млечни изделия за нуждите на 8 детски градини. Срок 24 месеца. Прогнозна стойност 280 000 лв. без ДДС. Изисквания: HACCP, ISO 22000, собствен охладен транспорт. Гаранция за изпълнение 3%. Срок за подаване: 14 дни.",
    },
    {
      aop_id: `STUB-${today}-002`,
      source_url: "https://www2.aop.bg/stub/002",
      title: "Извършване на строително-монтажни работи — детска градина №7",
      publisher: "Община Варна",
      estimated_value: 1450000,
      deadline: tomorrow,
      raw_text:
        "Предмет: реконструкция на сграда на детска градина. Категория III по ЗУТ. Прогнозна стойност 1 450 000 лв. без ДДС. Гаранция за участие 1%, гаранция за изпълнение 4%. Минимални изисквания: технически ръководител с 5 г. опит, оборот за последните 3 г. над 3 млн. лв. Срок за изпълнение 18 месеца.",
    },
    {
      aop_id: `STUB-${today}-003`,
      source_url: "https://www2.aop.bg/stub/003",
      title: "Доставка на копирни машини и тонери — рамково споразумение",
      publisher: "Министерство на правосъдието",
      estimated_value: 600000,
      deadline: tomorrow,
      raw_text:
        "Рамково споразумение с един изпълнител за срок 4 години. Предмет: доставка и поддръжка на копирна техника и консумативи. Прогнозна стойност 600 000 лв. без ДДС. Изисквания: CE сертификати, гаранционен срок 24 месеца, реакция в рамките на 8 работни часа. Гаранция за изпълнение 4%.",
    },
  ];
}
