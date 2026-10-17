export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Almaty" });
export const month = () => today().slice(0, 7);
export const stamp = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const money = (n: number) =>
  new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 2 }).format(n) + " ₸";
export function dateLabel(date: string) {
  if (!date) return "Не указана";
  const d = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? date + "T12:00:00+05:00" : date,
  );
  return isNaN(d.getTime())
    ? date
    : d.toLocaleString("ru-KZ", {
        timeZone: "Asia/Almaty",
        ...(date.length === 10
          ? { year: "numeric", month: "short", day: "numeric" }
          : {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
      });
}
export const audienceLabel = (a: string) =>
  a === "residents" ? "Жители и председатель" : "Только председатель";
