import type { ModelResourceActivity, ModelResourceUsage } from '../../contracts.js';
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
  const resourceOwner: ModelResourceActivity['owner'] =
    owner?.kind === 'operation' || owner?.kind === 'intent-resolution'
      ? { kind: owner.kind, id: owner.id, ...(owner.runId ? { runId: owner.runId } : {}) }
      : undefined;
  return {
    attemptId: attempt.executionId,
    correlationId: attempt.correlationId,
    ...(attempt.causationId ? { causationId: attempt.causationId } : {}),
    ...(resourceOwner ? { owner: resourceOwner } : {}),
    ...(attempt.origin ? { origin: attempt.origin } : {}),
    ...(admission ? { admission } : {}),
  };
};

export const withModelResourceAttempt = <TValue>(
  reportUsage: ((usage: ModelResourceUsage) => void) | undefined,
  run: (
    report: ((usage: ModelResourceUsage) => void) | undefined,
    admission: ModelResourceAdmission | undefined,
  ) => TValue,
): TValue => {
  const owner = getCurrentSemanticExecutionContext()?.subject;
  return withSemanticExecutionActivity({ kind: 'resource-attempt', id: 'model' }, () => {
    const admission = admitModelResourceAttempt();
    const activity = projectActivity(owner, admission);
    const report = reportUsage
      ? (usage: ModelResourceUsage) => {
          const { activity: _providerActivity, ...providerUsage } = usage;
          reportUsage(activity ? { ...providerUsage, activity } : providerUsage);
        }
      : undefined;
    return run(report, admission);
  });
};
