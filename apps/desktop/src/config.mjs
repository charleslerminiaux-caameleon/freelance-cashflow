import {failure} from './errors.mjs';
function jwtPayload(key,role,ref) {
 if(typeof key!=='string'||key.length>16384) throw Error();
 const parts=key.split('.'); if(parts.length!==3) throw Error();
 const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
 if(claims.role!==role||claims.ref!==ref) throw Error();
 if(claims.exp!==undefined && (!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())) throw Error();
 return key;
}
export function validateConfig(input) {
 try {
  if(!input||typeof input.url!=='string'||input.url.length>256) throw Error();
  const url=new URL(input.url.trim());
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/') throw Error();
  const match=/^([a-z]{20})\.supabase\.co$/.exec(url.hostname); if(!match) throw Error();
  const projectRef=match[1];
  return {url:url.origin,projectRef,anonKey:jwtPayload(input.anonKey?.trim(),'anon',projectRef),
   serviceRoleKey:jwtPayload(input.serviceRoleKey?.trim(),'service_role',projectRef)};
 } catch {throw failure('INVALID_CONFIGURATION');}
}
