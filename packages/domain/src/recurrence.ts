import { localDate, type LocalDate } from "@fc/shared";

export type RecurrenceFrequency = "monthly" | "quarterly" | "yearly";

export type GenerateOccurrencesInput = {
  frequency: RecurrenceFrequency;
  dayOfMonth: number;
  startDate: LocalDate;
  endDate: LocalDate;
};

function dateParts(value: LocalDate) {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
  };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function occurrenceDate(year: number, month: number, configuredDay: number): LocalDate {
  const day = Math.min(configuredDay, daysInMonth(year, month));
  return localDate(
    `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}`,
  );
}

export function generateOccurrences(input: GenerateOccurrencesInput): LocalDate[] {
  const startDate = localDate(input.startDate);
  const endDate = localDate(input.endDate);

  if (endDate < startDate) {
    throw new Error("Recurrence end date must not be before start date");
  }
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) {
    throw new Error("Recurrence day must be an integer between 1 and 31");
  }

  const intervalMonths = {
    monthly: 1,
    quarterly: 3,
    yearly: 12,
  }[input.frequency];

  if (intervalMonths === undefined) {
    throw new Error("Unsupported recurrence frequency");
  }

  const start = dateParts(startDate);
  const end = dateParts(endDate);
  const finalMonthIndex = end.year * 12 + end.month - 1;
  const occurrences: LocalDate[] = [];

  for (
    let monthIndex = start.year * 12 + start.month - 1;
    monthIndex <= finalMonthIndex;
    monthIndex += intervalMonths
  ) {
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const occurrence = occurrenceDate(year, month, input.dayOfMonth);

    if (occurrence >= startDate && occurrence <= endDate) {
      occurrences.push(occurrence);
    }
  }

  return occurrences;
}
