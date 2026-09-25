/** @typedef {{url:string, anonKey:string, serviceRoleKey:string, projectRef:string}} InstallationConfig */
/** @typedef {{version:string, filename:string, sha256:string}} Migration */
/** @typedef {{projectRef:string,kind:'empty'|'compatible'|'pending'|'incompatible',pending:Migration[],fingerprint:string}} DatabaseInspection */
/** @typedef {{origin:string,stop:()=>Promise<void>}} RunningServer */
export {};
