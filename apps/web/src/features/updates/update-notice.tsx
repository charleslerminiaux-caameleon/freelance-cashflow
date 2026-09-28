'use client';
import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { DAY, preferenceKey, projectUrl, updateSource, type UpdateResult } from './source';
type Preferences = { enabled: boolean; ignored: string | null; deferredUntil: number };
const defaults: Preferences = { enabled: true, ignored: null, deferredUntil: 0 };
type State = { preferences: Preferences; change: (value: Partial<Preferences>) => void; result: UpdateResult | null };
const Context = createContext<State | null>(null);
function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
    return { enabled: value.enabled !== false, ignored: typeof value.ignored === 'string' ? value.ignored : null,
      deferredUntil: Number.isFinite(value.deferredUntil) ? value.deferredUntil : 0 };
  } catch { return defaults; }
}
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const currentPreferences = useRef(defaults);
  const refreshNow = useRef<() => void>(() => {});
  const [clock, setClock] = useState(0);
  const [result, setResult] = useState<UpdateResult | null>(null);
  useEffect(() => {
    let active = true;
    const initial = readPreferences();
    // Hydrate browser-local preferences only after mounting.
    currentPreferences.current = initial;
    setPreferences(initial);
    setClock(Date.now());
    let nextCheck = 0;
    const refresh = async () => {
      if (!currentPreferences.current.enabled || Date.now() < nextCheck) return;
      const cacheKey = `${preferenceKey}:${updateSource.version}:check`;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
        if (cached && Date.now() - cached.time >= 0 && Date.now() - cached.time < DAY) {
          nextCheck = cached.time + DAY;
          if (active) setResult(cached.result);
          return;
        }
      } catch { /* Storage may be unavailable; checking must remain optional. */ }
      const checkedAt = Date.now();
      nextCheck = checkedAt + DAY;
      let value: UpdateResult;
      try {
        const response = await fetch('/api/updates', { signal: AbortSignal.timeout(7000) });
        if (!response.ok) throw Error('Unavailable');
        value = await response.json();
        if (!['ok', 'unavailable'].includes(value.status)) throw Error('Invalid response');
      } catch { value = { status: 'unavailable', release: null }; }
      if (!active) return;
      setResult(value);
      const completedAt = Date.now();
      nextCheck = completedAt + DAY;
      try { localStorage.setItem(cacheKey, JSON.stringify({ time: completedAt, result: value })); } catch { /* Optional persistence. */ }
    };
    void refresh();
    refreshNow.current = () => { void refresh(); };
    const timer = setInterval(() => { setClock(Date.now()); void refresh(); }, 60_000);
    const sync = (event: StorageEvent) => {
      if (event.key !== preferenceKey && event.key !== null) return;
      const next = readPreferences(); currentPreferences.current = next; setPreferences(next); void refresh();
    };
    window.addEventListener('storage', sync);
    return () => { active = false; clearInterval(timer); window.removeEventListener('storage', sync); };
  }, []);
  function change(value: Partial<Preferences>) {
    const next = { ...preferences, ...value };
    currentPreferences.current = next;
    setPreferences(next);
    setClock(Date.now());
    if (next.enabled) refreshNow.current();
    try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* Current session still works. */ }
  }
  const release = result?.release;
  const visible = preferences.enabled && release && release.version !== preferences.ignored && clock >= preferences.deferredUntil;
  return <Context.Provider value={{ preferences, change, result }}>
    {visible && <section className="update-notice" aria-label="Mise à jour disponible">
      <strong>Une mise à jour de Freelance Cashflow est disponible : {release.version}</strong>
      <p>Votre version reste utilisable. Vous choisissez si et quand installer cette mise à jour.</p>
      <details><summary>Voir les nouveautés</summary>
        <p className="update-release-notes">{release.notes}</p>
        <a href={release.notesUrl} target="_blank" rel="noreferrer">Lire la publication complète</a>
      </details>
      <div className="update-actions">
        <a href={release.downloadUrl ?? `${projectUrl}/blob/main/docs/UPDATES.md`} target="_blank" rel="noreferrer">{release.downloadUrl ? 'Télécharger la mise à jour Mac' : 'Voir la procédure de mise à jour'}</a>
        <button type="button" onClick={() => change({ deferredUntil: Date.now() + DAY })}>Plus tard</button>
        <button type="button" onClick={() => change({ ignored: release.version })}>Ignorer cette version</button>
      </div>
      {release.downloadUrl && <p>Après le téléchargement, quittez Freelance Cashflow et remplacez l’application dans Applications. Vérifiez les consignes et la sauvegarde avant toute migration de la base.</p>}
    </section>}
    {children}
  </Context.Provider>;
}
export function UpdateSettings() {
  const state = useContext(Context);
  if (!state) return null;
  const { preferences, change, result } = state;
  return <section className="panel settings-panel update-settings" aria-labelledby="updates-title">
    <h2 id="updates-title">Mises à jour</h2>
    <p>Version installée : {updateSource.version}</p>
    <p>Provenance : <a href={projectUrl} target="_blank" rel="noreferrer">{updateSource.name}</a></p>
    <p>Dépôt suivi : {updateSource.repository}. {updateSource.includePrereleases ? 'Les préversions sont incluses.' : 'Versions stables uniquement.'}</p>
    <label><input type="checkbox" checked={preferences.enabled} onChange={e => change({ enabled: e.target.checked })}/> Vérifier automatiquement les nouvelles versions</label>
    <p>Une vérification par jour auprès de GitHub, sans compte ni envoi de vos données financières. Ces préférences sont conservées dans ce navigateur. Aucun téléchargement ni installation automatique.</p>
    {preferences.enabled && result?.status === 'unavailable' && <p>La vérification est momentanément indisponible. Vous pouvez continuer à utiliser l’application.</p>}
    {preferences.enabled && result?.status === 'ok' && !result.release && <p>Aucune version plus récente détectée lors de la dernière vérification.</p>}
    {preferences.ignored && <p>Version ignorée : {preferences.ignored}. <button type="button" onClick={() => change({ ignored: null, deferredUntil: 0 })}>Réafficher la version ignorée</button></p>}
    <p>Chaque distribution suit ses propres publications. Passer à un fork est un changement volontaire de distribution : consultez ses instructions de migration et sauvegardez votre base avant de l’installer.</p>
    <a href={`${projectUrl}/releases`} target="_blank" rel="noreferrer">Consulter toutes les versions</a>
  </section>;
}
