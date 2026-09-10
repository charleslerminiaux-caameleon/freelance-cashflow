import { parseE2EEnvironment } from '../../../e2e/global-setup';
const environment = { E2E_STACK_PROJECT: 'jalon-2-qonto-tests', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321', SUPABASE_SERVICE_ROLE_KEY: 'fake-test-service-role' };
it('allows only the dedicated test stack', () => {
  expect(parseE2EEnvironment(environment).NEXT_PUBLIC_SUPABASE_URL).toBe(environment.NEXT_PUBLIC_SUPABASE_URL);
});
it.each(['http://127.0.0.1:55321', 'http://localhost:56321', 'https://example.supabase.co'])('refuses %s before owner mutation', url => {
  expect(() => parseE2EEnvironment({ ...environment, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow();
});
it('requires dedicated project identity', () => {
  expect(() => parseE2EEnvironment({ ...environment, E2E_STACK_PROJECT: 'user-data' })).toThrow();
});
