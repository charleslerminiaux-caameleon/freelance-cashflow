import { expect, it } from 'vitest';
import { selectRelease, createReleaseChecker } from './releases';
const source={name:'Community',repository:'community/cashflow',version:'0.1.5',tagPrefix:'desktop-v',includePrereleases:true,macAssetPrefix:'Freelance.Cashflow'};
const release=(version:string,extra={})=>({tag_name:`desktop-v${version}`,draft:false,prerelease:false,body:'Nouveautés',assets:[{name:`Freelance.Cashflow-${version}-mac-arm64.dmg`,state:'uploaded'}],...extra});
it('compares numeric versions and ignores older, draft and unrelated releases',()=>{
 const result=selectRelease([release('0.1.9'),release('0.1.10'),release('0.2.0',{draft:true}),release('8.0.0',{tag_name:'other-v8.0.0'})],source,true);
 expect(result?.version).toBe('0.1.10');
 expect(selectRelease([release('0.1.5'),release('0.1.4')],source,true)).toBeNull();
});
it('uses only the configured fork and constructs safe links instead of trusting release URLs',()=>{
 const result=selectRelease([release('0.1.6',{html_url:'https://evil.example',body:'<script>bad</script>'})],source,true);
 expect(result?.downloadUrl).toBe('https://github.com/community/cashflow/releases/download/desktop-v0.1.6/Freelance.Cashflow-0.1.6-mac-arm64.dmg');
 expect(result?.notesUrl).toBe('https://github.com/community/cashflow/releases/tag/desktop-v0.1.6');
});
it('honors the release channel and falls back to instructions when no Mac asset exists',()=>{
 expect(selectRelease([release('0.1.6',{prerelease:true})],{...source,includePrereleases:false},true)).toBeNull();
 expect(selectRelease([release('0.1.6',{assets:[]})],source,true)?.downloadUrl).toBeNull();
 expect(selectRelease([release('0.1.6')],source,false)?.downloadUrl).toBeNull();
});
it('coalesces concurrent checks and caches failures for one day without breaking the app',async()=>{
 let calls=0,now=1000;
 const check=createReleaseChecker(source,true,async()=>{calls++;throw Error('offline');},()=>now);
 expect((await Promise.all([check(),check()])).map(r=>r.status)).toEqual(['unavailable','unavailable']);
 await check();expect(calls).toBe(1);
 now+=86400001;await check();expect(calls).toBe(2);
});
it('fetches public releases without credentials and reports newer versions',async()=>{
 const check=createReleaseChecker(source,true,async(url,options)=>{
 expect(url).toBe('https://api.github.com/repos/community/cashflow/releases?per_page=100');
 expect(options?.headers).not.toHaveProperty('Authorization');
 return new Response(JSON.stringify([release('0.1.6')]));
 });
 expect((await check()).release?.version).toBe('0.1.6');
});
