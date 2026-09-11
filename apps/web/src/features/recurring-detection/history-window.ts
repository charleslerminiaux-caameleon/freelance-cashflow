import { localDate } from "@fc/shared";

export function recurringHistoryWindow(today: string): { since: string; until: string } {
  localDate(today);
  const year = Number(today.slice(0, 4)); const month = Number(today.slice(5, 7)); const day = Number(today.slice(8, 10));
  const date = new Date(0); date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 7, 1);
  const end = new Date(date); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return { since: localDate(date.toISOString().slice(0, 10)), until: today };
}
