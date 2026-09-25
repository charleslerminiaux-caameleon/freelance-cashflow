export function failure(code, stage='setup', retryable=true) {
 return Object.assign(new Error(code),{code,stage,retryable});
}
export function publicFailure(error) {
 return {code: typeof error?.code==='string' && /^[A-Z_]{3,60}$/.test(error.code) ? error.code : 'OPERATION_FAILED',
 stage:'setup',retryable:true};
}
