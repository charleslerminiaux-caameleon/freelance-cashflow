// A distribution owns its update source. Fork maintainers must change this before release.
export const updateSource = {
  name: 'Freelance Cashflow — distribution officielle',
  repository: 'charleslerminiaux-caameleon/freelance-cashflow',
  version: '0.1.5',
  tagPrefix: 'desktop-v',
  includePrereleases: true,
  macAssetPrefix: 'Freelance.Cashflow',
};
export const DAY = 86_400_000;
export const projectUrl = `https://github.com/${updateSource.repository}`;
export const preferenceKey = `fc:updates:${updateSource.repository}:${updateSource.tagPrefix}`;
export type Release = { version: string; notes: string; notesUrl: string; downloadUrl: string | null };
export type UpdateResult = { status: 'ok' | 'unavailable'; release: Release | null };
