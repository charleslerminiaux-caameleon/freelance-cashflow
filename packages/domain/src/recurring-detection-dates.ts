import { localDate } from "@fc/shared";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

export function parseDate(value: string): DateParts {
  const validDate = localDate(value);
  return {
    year: Number(validDate.slice(0, 4)),
    month: Number(validDate.slice(5, 7)),
    day: Number(validDate.slice(8, 10)),
  };
}

export function formatDate(parts: DateParts): string {
  return localDate(
    `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`,
  );
}

export function daysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

export function monthSerial(parts: Pick<DateParts, "year" | "month">): number {
  return parts.year * 12 + parts.month - 1;
}

export function monthFromSerial(serial: number): Pick<DateParts, "year" | "month"> {
  return {
    year: Math.floor(serial / 12),
    month: ((serial % 12) + 12) % 12 + 1,
  };
}

export function dateForMonth(serial: number, dayOfMonth: number): string {
  const month = monthFromSerial(serial);
  return formatDate({
    ...month,
    day: Math.min(dayOfMonth, daysInMonth(month.year, month.month)),
  });
}

export function subtractMonthsClamped(value: string, months: number): string {
  const parts = parseDate(value);
  const target = monthFromSerial(monthSerial(parts) - months);
  return formatDate({
    ...target,
    day: Math.min(parts.day, daysInMonth(target.year, target.month)),
  });
}

export function addDays(value: string, days: number): string {
  const parts = parseDate(value);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day + days);
  return formatDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}
