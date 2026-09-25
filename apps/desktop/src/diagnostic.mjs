export function publicDiagnostic({version,platform,step,running}) {
 return {version,platform,step,running:Boolean(running)};
}
