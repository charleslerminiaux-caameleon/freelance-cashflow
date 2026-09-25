/** Calendar landmarks for display only; daily forecasts still determine risk. */
export function projectionDates(first: string | undefined, last: string | undefined, horizonDays: number): string[] {
  if (!first || !last) return [];
  const dates = new Set([first, last]);
  const cursor = new Date(`${first}T12:00:00Z`);
  if (horizonDays === 30) cursor.setUTCDate(cursor.getUTCDate() + 7);
  else { cursor.setUTCDate(1); cursor.setUTCMonth(cursor.getUTCMonth() + 1); }
  while (cursor.toISOString().slice(0, 10) < last) {
    dates.add(cursor.toISOString().slice(0, 10));
    if (horizonDays === 30) cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return [...dates].sort();
}
