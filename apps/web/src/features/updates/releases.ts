import 'server-only';
import { DAY, type Release, type UpdateResult, type updateSource } from './source';
type Source = typeof updateSource;
function parts(version: string) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ? version.split('.').map(Number) as [number, number, number] : null;
}
function compare(a: string, b: string) {
  const left = parts(a), right = parts(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return 0;
}
export function selectRelease(data: unknown, source: Source, mac: boolean): Release | null {
  if (!Array.isArray(data) || !/^[\w.-]+\/[\w.-]+$/.test(source.repository)) return null;
  let latest: Release | null = null;
  for (const item of data) {
    if (!item || item.draft !== false || typeof item.prerelease !== 'boolean' || (item.prerelease && !source.includePrereleases)) continue;
    if (typeof item.tag_name !== 'string' || !item.tag_name.startsWith(source.tagPrefix)) continue;
    const version = item.tag_name.slice(source.tagPrefix.length);
    if (!parts(version) || compare(version, latest?.version ?? source.version) <= 0) continue;
    const base = `https://github.com/${source.repository}/releases`;
    const asset = `${source.macAssetPrefix}-${version}-mac-arm64.dmg`;
    const hasAsset = Array.isArray(item.assets) && item.assets.some((a: {name?: string; state?: string}) => a?.name === asset && a.state === 'uploaded');
    latest = { version, notes: typeof item.body === 'string' ? item.body.slice(0, 16000) : 'Consultez la publication pour connaître les nouveautés.',
      notesUrl: `${base}/tag/${encodeURIComponent(item.tag_name)}`,
      downloadUrl: mac && hasAsset ? `${base}/download/${encodeURIComponent(item.tag_name)}/${encodeURIComponent(asset)}` : null };
  }
  return latest;
}
export function createReleaseChecker(source: Source, mac: boolean, request: typeof fetch = fetch, now = Date.now) {
  let expires = 0, pending: Promise<UpdateResult> | undefined;
  return function check(): Promise<UpdateResult> {
    if (pending && now() < expires) return pending;
    expires = now() + DAY;
    pending = (async (): Promise<UpdateResult> => {
      try {
        if (!/^[\w.-]+\/[\w.-]+$/.test(source.repository)) throw Error('Invalid source');
        const response = await request(`https://api.github.com/repos/${source.repository}/releases?per_page=100`, {
          headers: { Accept: 'application/vnd.github+json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw Error('Unavailable');
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw Error('Invalid response');
        return { status: 'ok', release: selectRelease(data, source, mac) };
      } catch { return { status: 'unavailable', release: null }; }
    })();
    return pending;
  };
}
