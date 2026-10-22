import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '../shared/contracts';
import type { Env } from './security';

let cachedJWKS: { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

export function keyMode(env: Env) {
  if (env.KEY_MODE && !['byok', 'server'].includes(env.KEY_MODE))
    throw new AppError('CONFIG_ERROR', 503);
  return env.KEY_MODE === 'server' ? 'server' : 'byok';
}

export async function verifyAccess(request: Request, env: Env): Promise<string> {
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https:\/\//, '').replace(/\/$/, '');
  if (!domain || !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain) || !env.CF_ACCESS_AUD)
    throw new AppError('CONFIG_ERROR', 503);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16_384) throw new AppError('AUTH_REQUIRED', 401);
  const issuer = `https://${domain}`;
  if (!cachedJWKS || cachedJWKS.issuer !== issuer)
    cachedJWKS = {
      issuer,
      keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
        timeoutDuration: 5000,
      }),
    };
  try {
    const { payload } = await jwtVerify(token, cachedJWKS.keys, {
      issuer,
      audience: env.CF_ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'sub'],
    });
    return payload.sub!;
  } catch {
    throw new AppError('AUTH_REQUIRED', 401);
  }
}

export async function resolveKey(request: Request, env: Env, authenticate = verifyAccess) {
  if (keyMode(env) === 'server') {
    const identity = await authenticate(request, env);
    if (!env.DEEPSEEK_API_KEY) throw new AppError('CONFIG_ERROR', 503);
    return { key: env.DEEPSEEK_API_KEY, identity };
  }
  const header = request.headers.get('Authorization');
  const key = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!key) throw new AppError('MISSING_KEY', 401);
  if (!/^[\x21-\x7e]{8,512}$/.test(key)) throw new AppError('INVALID_KEY', 401);
  return { key, identity: request.headers.get('CF-Connecting-IP') ?? 'local' };
}
