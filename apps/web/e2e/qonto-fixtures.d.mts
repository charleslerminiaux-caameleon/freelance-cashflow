export const canaries: [string, string, string];
export const fakeIban: string;
export function fixtureResponse(url: URL, options?: { revision?: number; failure?: string }): { status: number; body: unknown; headers?: Record<string, string> };
