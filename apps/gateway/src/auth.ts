import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface SecurityContext {
  tenantId: string;
  userId: string;
  roles: string[];
  authMode: 'entra' | 'dev-headers';
}

export type AuthResult =
  | { ok: true; context: SecurityContext }
  | { ok: false; status: number; code: string; message?: string };

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedTenant: string | undefined;

function devHeaders(req: Request): AuthResult {
  const tenantId = req.header('x-bcs-tenant-id');
  const userId = req.header('x-bcs-user-id');
  const roles = (req.header('x-bcs-roles') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!tenantId || !userId || roles.length === 0) {
    return { ok: false, status: 400, code: 'MISSING_SECURITY_CONTEXT' };
  }

  return { ok: true, context: { tenantId, userId, roles, authMode: 'dev-headers' } };
}

function jwksForTenant(tenantId: string) {
  if (!cachedJwks || cachedTenant !== tenantId) {
    cachedTenant = tenantId;
    cachedJwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
  }
  return cachedJwks;
}

function hasRequiredScope(scopeClaim: unknown, requiredScope: string): boolean {
  if (typeof scopeClaim !== 'string') return false;
  return scopeClaim.split(/\s+/).filter(Boolean).includes(requiredScope);
}

export async function authenticate(req: Request): Promise<AuthResult> {
  if (process.env.ALLOW_DEV_HEADERS === 'true') {
    return devHeaders(req);
  }

  const tenantId = process.env.ENTRA_TENANT_ID;
  const audience = process.env.ENTRA_API_AUDIENCE;
  const requiredScope = process.env.ENTRA_REQUIRED_SCOPE ?? 'access_as_user';
  if (!tenantId || !audience) {
    return {
      ok: false,
      status: 503,
      code: 'IDENTITY_EDGE_NOT_CONFIGURED',
      message: 'ENTRA_TENANT_ID and ENTRA_API_AUDIENCE are required.'
    };
  }

  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'BEARER_TOKEN_REQUIRED' };
  }

  const token = authorization.slice('Bearer '.length).trim();
  try {
    const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    const { payload } = await jwtVerify(token, jwksForTenant(tenantId), {
      issuer,
      audience
    });

    if (payload.tid !== tenantId) {
      return { ok: false, status: 403, code: 'TENANT_MISMATCH' };
    }

    if (!hasRequiredScope(payload.scp, requiredScope)) {
      return {
        ok: false,
        status: 403,
        code: 'DELEGATED_SCOPE_REQUIRED',
        message: `The delegated ${requiredScope} scope is required.`
      };
    }

    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is string => typeof role === 'string').map((role) => role.toLowerCase())
      : [];

    if (roles.length === 0) {
      return {
        ok: false,
        status: 403,
        code: 'APP_ROLE_REQUIRED',
        message: 'Assign one of the configured BCS ONE application roles.'
      };
    }

    const employeeClaimName = process.env.ENTRA_EMPLOYEE_ID_CLAIM ?? 'employee_id';
    const configuredEmployeeId = payload[employeeClaimName];
    const userId =
      (typeof configuredEmployeeId === 'string' && configuredEmployeeId) ||
      (typeof payload.oid === 'string' && payload.oid) ||
      payload.sub;

    if (!userId) {
      return { ok: false, status: 403, code: 'SUBJECT_IDENTIFIER_MISSING' };
    }

    return {
      ok: true,
      context: {
        tenantId,
        userId,
        roles,
        authMode: 'entra'
      }
    };
  } catch {
    return { ok: false, status: 401, code: 'INVALID_ACCESS_TOKEN' };
  }
}
