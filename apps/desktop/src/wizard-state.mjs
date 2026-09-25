import {failure} from './errors.mjs';
const transitions={welcome:{CONFIGURE:'configuration'},configuration:{INSPECTED:'preview'},preview:{APPLIED:'auth',CONFIGURE:'configuration'},auth:{STARTED:'ready',CONFIGURE:'configuration'},ready:{CONFIGURE:'configuration'}};
export function transition(step,event) {
 const next=transitions[step]?.[event];if(!next)throw failure('INVALID_STEP');return next;
}
