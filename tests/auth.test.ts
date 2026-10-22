import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyAccess } from '../worker/auth';
import type { Env } from '../worker/security';

let privateKey: CryptoKey, publicKey: CryptoKey;
const issuer = 'https://quietsearch-test.cloudflareaccess.com',
  audience = 'test-audience';
const env = {
  CF_ACCESS_TEAM_DOMAIN: 'quietsearch-test.cloudflareaccess.com',
  CF_ACCESS_AUD: audience,
} as Env;
beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('RS256'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
async function token(
  options: {
    issuer?: string;
    audience?: string;
    expired?: boolean;
    wrongKey?: boolean;
    noExpiry?: boolean;
    future?: boolean;
  } = {},
) {
  const signing = options.wrongKey ? (await generateKeyPair('RS256')).privateKey : privateKey;
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('synthetic-user')
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? audience)
    .setIssuedAt();
  if (!options.noExpiry)
    jwt = jwt.setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : '5m');
  if (options.future) jwt = jwt.setNotBefore('5m');
  return jwt.sign(signing);
}
async function mockJWKS() {
  const jwk = await exportJWK(publicKey);
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ keys: [{ ...jwk, kid: 'test-key', use: 'sig', alg: 'RS256' }] }),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function req(value: string) {
  return new Request('https://test.local/api/search', {
    headers: { 'Cf-Access-Jwt-Assertion': value },
  });
}

describe('real Access JWT signature and claims verification', () => {
  it('verifies a signed token using only configured JWKS', async () => {
    const fetcher = await mockJWKS();
    expect(await verifyAccess(req(await token()), env)).toBe('synthetic-user');
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${issuer}/cdn-cgi/access/certs`);
  });
  it.each([
    { issuer: 'https://evil.example' },
    { audience: 'wrong-audience' },
    { expired: true },
    { wrongKey: true },
    { noExpiry: true },
    { future: true },
  ])('rejects invalid signature/claims %j', async (options) => {
    await mockJWKS();
    await expect(verifyAccess(req(await token(options)), env)).rejects.toThrow('AUTH_REQUIRED');
  });
  it('rejects header presence without a valid token', async () => {
    await expect(verifyAccess(req('made-up-token'), env)).rejects.toThrow('AUTH_REQUIRED');
  });
  it('rejects untrusted or missing verification configuration', async () => {
    await expect(
      verifyAccess(req('token'), { ...env, CF_ACCESS_TEAM_DOMAIN: 'evil.example' }),
    ).rejects.toThrow('CONFIG_ERROR');
    await expect(verifyAccess(req('token'), { ...env, CF_ACCESS_AUD: '' })).rejects.toThrow(
      'CONFIG_ERROR',
    );
  });
});
