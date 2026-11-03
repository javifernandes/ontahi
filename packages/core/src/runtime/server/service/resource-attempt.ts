import type { ServiceResourceActivity } from '../../contracts.js';
import { getCurrentOperationExecutionAttempt } from '../context.js';
import { recordServiceResourceAttempt } from '../resource-evidence.js';
import {
  getCurrentSemanticExecutionContext,
  withSemanticExecutionActivity,
  type SemanticExecutionSubject,
} from '../semantic-execution.js';

import {
  admitServiceResourceAttempt,
  type ServiceResourceAdmission,
} from './resource-governance.js';

export type ServiceResourceAttemptOptions = {
  /** Stable semantic identity. Do not use a URL, credential, or tenant-specific secret. */
  readonly resourceId: string;
  /** Optional host/provider binding identity. Debug evidence may expose this value. */
  readonly provider?: string;
  /** Provider action being attempted, such as search or geocode. */
  readonly action?: string;
};

const projectActivity = (
  owner: SemanticExecutionSubject | undefined,
  admission: ServiceResourceAdmission | undefined,
): ServiceResourceActivity | undefined => {
  const attempt = getCurrentSemanticExecutionContext();
  if (!attempt) return undefined;
  const operationAttempt = getCurrentOperationExecutionAttempt();
  const resourceOwner: ServiceResourceActivity['owner'] =
    owner?.kind === 'operation' || owner?.kind === 'intent-resolution'
      ? { kind: owner.kind, id: owner.id, ...(owner.runId ? { runId: owner.runId } : {}) }
      : undefined;
  return {
    attemptId: attempt.executionId,
    correlationId: attempt.correlationId,
    ...(attempt.causationId ? { causationId: attempt.causationId } : {}),
    ...(operationAttempt ? { operationAttempt } : {}),
    ...(resourceOwner ? { owner: resourceOwner } : {}),
    ...(attempt.origin ? { origin: attempt.origin } : {}),
    ...(admission ? { admission } : {}),
  };
};

export const withServiceResourceAttempt = async <TValue>(
  options: ServiceResourceAttemptOptions,
  run: (admission: ServiceResourceAdmission | undefined) => Promise<TValue>,
): Promise<TValue> => {
  const owner = getCurrentSemanticExecutionContext()?.subject;
  return withSemanticExecutionActivity(
    { kind: 'resource-attempt', id: options.resourceId },
    async () => {
      const admission = admitServiceResourceAttempt(options.resourceId);
      const activity = projectActivity(owner, admission);
      const complete = recordServiceResourceAttempt({
        resourceId: options.resourceId,
        ...(options.provider ? { provider: options.provider } : {}),
        ...(options.action ? { action: options.action } : {}),
        ...(activity ? { activity } : {}),
      });
      const startedAt = performance.now();
      try {
        const value = await run(admission);
        complete('completed', performance.now() - startedAt);
        return value;
      } catch (error) {
        complete('failed', performance.now() - startedAt);
        throw error;
      }
    },
  );
};
