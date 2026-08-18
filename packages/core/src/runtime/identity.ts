import { cloneJson, type JsonValue } from '../value/json.js';

export type Principal = {
  subject: string;
  kind: 'user' | 'service';
  issuer?: string;
};

export type ExecutionIdentity = {
  principal: Principal | null;
  cacheScope?: JsonValue;
};

export const anonymousExecutionIdentity: ExecutionIdentity = Object.freeze({
  principal: null,
});

export const executionIdentityCacheKey = (identity: ExecutionIdentity): readonly JsonValue[] => {
  const cacheScope = identity.cacheScope === undefined ? null : cloneJson(identity.cacheScope);

  return identity.principal
    ? [
        'principal',
        identity.principal.kind,
        identity.principal.issuer ?? null,
        identity.principal.subject,
        cacheScope,
      ]
    : ['anonymous', cacheScope];
};
