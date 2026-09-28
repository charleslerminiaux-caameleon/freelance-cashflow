import {fireEvent,render,screen,waitFor,cleanup,act} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {UpdateProvider,UpdateSettings} from './update-notice';
import {updateSource} from './source';
const payload={status:'ok',release:{version:'0.1.6',notes:'Un changement utile',notesUrl:'https://github.com/example/project/releases/tag/desktop-v0.1.6',downloadUrl:null}};
const mount=()=>render(<UpdateProvider><p>Application utilisable</p><UpdateSettings/></UpdateProvider>);
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(payload))));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
it('shows notes before a voluntary update and persists ignoring only this version',async()=>{
 const view=mount();
 await screen.findByRole('button',{name:'Ignorer cette version'});
 fireEvent.click(screen.getByText('Voir les nouveautés'));
 expect(screen.getByText('Un changement utile')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Ignorer cette version'}));
 expect(screen.queryByRole('button',{name:'Ignorer cette version'})).not.toBeInTheDocument();
 view.unmount();mount();
 await screen.findByText(/Version ignorée/);
 expect(screen.queryByRole('button',{name:'Ignorer cette version'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Réafficher la version ignorée'}));
 expect(screen.getByRole('button',{name:'Ignorer cette version'})).toBeInTheDocument();
});
it('disables subsequent checks and keeps application usable offline',async()=>{
 const view=mount();await screen.findByRole('button',{name:'Ignorer cette version'});
 fireEvent.click(screen.getByLabelText('Vérifier automatiquement les nouvelles versions'));
 view.unmount();vi.mocked(fetch).mockClear();mount();
 await waitFor(()=>expect(screen.getByLabelText('Vérifier automatiquement les nouvelles versions')).not.toBeChecked());
 expect(fetch).not.toHaveBeenCalled();expect(screen.getByText('Application utilisable')).toBeVisible();
});
it('persists postponement and shows distribution and installed version',async()=>{
 const view=mount();await screen.findByRole('button',{name:'Plus tard'});
 fireEvent.click(screen.getByRole('button',{name:'Plus tard'}));view.unmount();mount();
 expect(screen.queryByRole('button',{name:'Plus tard'})).not.toBeInTheDocument();
 expect(screen.getByText(new RegExp(updateSource.version.replaceAll('.','\\.')))).toBeInTheDocument();
});
it('announces a later release even when an earlier version was ignored',async()=>{
 const {preferenceKey}=await import('./source');
 localStorage.setItem(preferenceKey,JSON.stringify({enabled:true,ignored:'0.1.5',deferredUntil:0}));
 mount();expect(await screen.findByRole('button',{name:'Ignorer cette version'})).toBeVisible();
});
it('shows no blocking alert when the network fails and reuses the daily cached result',async()=>{
 vi.mocked(fetch).mockRejectedValue(new Error('offline'));
 const view=mount();await screen.findByText(/momentanément indisponible/);
 expect(screen.getByText('Application utilisable')).toBeVisible();
 expect(screen.queryByRole('button',{name:'Ignorer cette version'})).not.toBeInTheDocument();
 view.unmount();vi.mocked(fetch).mockClear();mount();
 await screen.findByText(/momentanément indisponible/);expect(fetch).not.toHaveBeenCalled();
});
it('renders untrusted release notes as text, never executable markup',async()=>{
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({...payload,release:{...payload.release,notes:'<img src=x onerror=alert(1)>'}})));
 const view=mount();await screen.findByRole('button',{name:'Ignorer cette version'});
 fireEvent.click(screen.getByText('Voir les nouveautés'));
 expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
 expect(view.container.querySelector('img')).toBeNull();
});

it('keeps checks disabled in memory when browser storage refuses writes',async()=>{
 vi.useFakeTimers();
 mount();await act(async()=>{await Promise.resolve();});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
 fireEvent.click(screen.getByLabelText('Vérifier automatiquement les nouvelles versions'));
 vi.mocked(fetch).mockClear();
 await act(async()=>{await vi.advanceTimersByTimeAsync(86400001);});
 expect(screen.getByLabelText('Vérifier automatiquement les nouvelles versions')).not.toBeChecked();
 expect(fetch).not.toHaveBeenCalled();
});
it('rechecks after one day despite network latency and expires postponement while open',async()=>{
 vi.useFakeTimers();let calls=0;
 vi.mocked(fetch).mockImplementation(async()=>{calls++;await new Promise(r=>setTimeout(r,100));return new Response(JSON.stringify(payload));});
 mount();await act(async()=>{await vi.advanceTimersByTimeAsync(101);});
 fireEvent.click(screen.getByRole('button',{name:'Plus tard'}));
 await act(async()=>{await vi.advanceTimersByTimeAsync(86460000);});
 expect(calls).toBe(2);
 expect(screen.getByRole('button',{name:'Plus tard'})).toBeInTheDocument();
});
