import { expect, it } from 'vitest';
import { loadDirectConfig } from './direct-config';
it('requires complete credentials and rejects header injection', () => {
 expect(loadDirectConfig('pennylane', () => undefined)).toBeNull();
 expect(loadDirectConfig('pennylane', () => 'bad\r\nAuthorization: other')).toBeNull();
 expect(loadDirectConfig('pennylane', name => name === 'PENNYLANE_API_TOKEN' ? 'token' : undefined)).toEqual({token:'token'});
 expect(loadDirectConfig('revolut', name => name === 'REVOLUT_CLIENT_ID' ? 'id' : undefined)).toBeNull();
});
it('never reads browser supplied config and gives bunq a local context path', () => {
 const config = loadDirectConfig('bunq', name => name === 'BUNQ_API_KEY' ? 'bunq-key' : undefined);
 expect(config).toMatchObject({apiKey:'bunq-key'});
 expect(config && 'contextPath' in config && config.contextPath.endsWith('/.libra/bunq-context.json')).toBe(true);
});
