import type { ModelResourceActivity, ModelResourceUsage } from '../../contracts.js';
import {
  getCurrentSemanticExecutionContext,
  withSemanticExecutionActivity,
  type SemanticExecutionSubject,
} from '../semantic-execution.js';

const projectActivity = (
  owner: SemanticExecutionSubject | undefined,
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
  };
};

export const withModelResourceAttempt = <TValue>(
  reportUsage: ((usage: ModelResourceUsage) => void) | undefined,
  run: (report: ((usage: ModelResourceUsage) => void) | undefined) => TValue,
): TValue => {
  const owner = getCurrentSemanticExecutionContext()?.subject;
  return withSemanticExecutionActivity({ kind: 'resource-attempt', id: 'model' }, () => {
    const activity = projectActivity(owner);
    const report = reportUsage
      ? (usage: ModelResourceUsage) => reportUsage(activity ? { ...usage, activity } : usage)
      : undefined;
    return run(report);
  });
};
