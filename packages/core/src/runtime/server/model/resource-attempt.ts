import type { ModelResourceActivity, ModelResourceUsage } from '../../contracts.js';
import { getConfiguredRuntimeTelemetry } from '../config.js';
import { getCurrentOperationExecutionAttempt } from '../context.js';
import { recordModelResourceAttempt } from '../resource-evidence.js';
import {
  getCurrentSemanticExecutionContext,
  withSemanticExecutionActivity,
  type SemanticExecutionSubject,
} from '../semantic-execution.js';

import { admitModelResourceAttempt, type ModelResourceAdmission } from './resource-governance.js';

const projectActivity = (
  owner: SemanticExecutionSubject | undefined,
  admission: ModelResourceAdmission | undefined,
): ModelResourceActivity | undefined => {
  const attempt = getCurrentSemanticExecutionContext();
  if (!attempt) return undefined;
  const operationAttempt = getCurrentOperationExecutionAttempt();
  const resourceOwner: ModelResourceActivity['owner'] =
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

export const withModelResourceAttempt = async <TValue>(
  reportUsage: ((usage: ModelResourceUsage) => void) | undefined,
  run: (
    report: ((usage: ModelResourceUsage) => void) | undefined,
    admission: ModelResourceAdmission | undefined,
  ) => Promise<TValue>,
): Promise<TValue> => {
  const owner = getCurrentSemanticExecutionContext()?.subject;
  let admitted = false;
  const attempt = () =>
    withSemanticExecutionActivity({ kind: 'resource-attempt', id: 'model' }, async () => {
      const admission = admitModelResourceAttempt();
      admitted = true;
      const activity = projectActivity(owner, admission);
      const completeAttempt = recordModelResourceAttempt(activity);
      const report = reportUsage
        ? (usage: ModelResourceUsage) => {
            const { activity: _providerActivity, ...providerUsage } = usage;
            reportUsage(activity ? { ...providerUsage, activity } : providerUsage);
          }
        : undefined;
      try {
        const value = await run(report, admission);
        completeAttempt('completed');
        return value;
      } catch (error) {
        completeAttempt('failed');
        throw error;
      }
    });
  const telemetry = getConfiguredRuntimeTelemetry();
  if (!telemetry) return attempt();

  const result = await telemetry.withSpan('ontahi.runtime.model.attempt', {}, async span => {
    try {
      const value = await attempt();
      telemetry.markSuccess(span);
      return { ok: true, value } as const;
    } catch (error) {
      telemetry.markFailure(span, admitted ? 'model_attempt_failed' : 'model_admission_rejected');
      return { ok: false, error } as const;
    }
  });
  // Keep provider exceptions out of the adapter's automatic exception recording.
  if (!result.ok) throw result.error;
  return result.value;
};
