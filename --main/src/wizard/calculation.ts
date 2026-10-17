import type { WizardInput, CostGroup } from "./models";
export const groups: Record<CostGroup, string> = {
  management: "Управление (без содержания)",
  maintenance: "Содержание общего имущества",
  savings: "Накопления (отдельный план)",
  target: "Целевые сборы (отдельный план)",
};
export function fixed(raw: string, places: number): bigint | null {
  const s = raw.trim().replace(",", ".");
  if (!new RegExp("^\\d+(?:\\.\\d{1," + places + "})?$").test(s)) return null;
  const [whole, fraction = ""] = s.split(".");
  if (whole.length > 12) return null;
  return (
    BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"))
  );
}
export const roundDiv = (a: bigint, b: bigint) => {
  if (a < 0n || b <= 0n)
    throw new Error("Недопустимые исходные данные для округления.");
  return (a * 2n + b) / (b * 2n);
};
export function decimal(n: bigint, places = 2) {
  const scale = 10n ** BigInt(places);
  return `${n / scale}.${String(n % scale).padStart(places, "0")}`;
}
export function amount(n: bigint) {
  return Number(n) / 100;
}
export function calculate(input: WizardInput) {
  const totals: Record<CostGroup, bigint> = {
    management: 0n,
    maintenance: 0n,
    savings: 0n,
    target: 0n,
  };
  const issues: string[] = [];
  const lines = input.items.map((item) => {
    const qty = fixed(item.quantity, 4),
      price = fixed(item.price, 2);
    const f = /^\d{1,3}$/.test(item.frequency) ? BigInt(item.frequency) : null;
    let cents: bigint | null = null;
    if (
      qty !== null &&
      qty > 0n &&
      price !== null &&
      f !== null &&
      f > 0n &&
      f <= 366n
    ) {
      cents = roundDiv(qty * price * f, 10000n);
      if (cents > 900000000000000n) {
        issues.push(
          `Статья «${item.title || "без названия"}»: сумма превышает лимит точного экспорта.`,
        );
        cents = null;
      } else totals[item.group] += cents;
    } else
      issues.push(
        `Статья «${item.title || "без названия"}»: проверьте положительное количество (до 4 знаков), цену (до 2 знаков) и число выполнений в год (1–366).`,
      );
    return { id: item.id, cents };
  });
  const core = totals.management + totals.maintenance;
  const income = fixed(input.commercialIncome, 2);
  const area = fixed(input.declaredArea, 2);
  let rateSix: string | null = null;
  const charges: {
    number: string;
    kind: string;
    area: string;
    monthly: string;
  }[] = [];
  if (income !== null && area !== null && area > 0n && core >= income) {
    const net = core - income;
    rateSix = decimal(roundDiv(net * 1000000n, area * 12n), 6);
    for (const room of input.areas) {
      const a = fixed(room.area, 2);
      if (a !== null && a > 0n)
        charges.push({
          number: room.number,
          kind: room.kind,
          area: room.area,
          monthly: decimal(roundDiv(net * a, area * 12n)),
        });
    }
  }
  if (Object.values(totals).some((v) => v > 900000000000000n))
    issues.push("Итог превышает лимит точного экспорта. Разделите расчет.");
  return { lines, totals, core, income, area, rateSix, charges, issues };
}
