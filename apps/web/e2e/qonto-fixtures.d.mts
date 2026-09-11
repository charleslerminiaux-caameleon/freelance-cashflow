export const canaries: [string, string, string];
export const fakeIban: string;
export type RecurringCalendar = Readonly<{ today: string; timezone: string; offsetHours: number; instant: string }>;
export function createRecurringCalendar(now?: Date): RecurringCalendar;
export function fixtureResponse(url: URL, options?: { revision?: number; failure?: string; scenario?: string; calendar?: RecurringCalendar }): { status: number; body: unknown; headers?: Record<string, string> };
