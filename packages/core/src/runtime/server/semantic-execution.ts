import { AsyncLocalStorage } from 'node:async_hooks';

export type SemanticExecutionOrigin = {
  readonly channel: 'web' | 'cli' | 'agent' | 'api' | 'system';
  readonly surface?: string;
  readonly clientInstanceId?: string;
};

export type SemanticExecutionSubject = {
  readonly kind: 'operation' | 'intent-resolution' | 'resource-attempt';
  readonly id: string;
  readonly runId?: string;
};

export type SemanticExecutionContext = {
  readonly executionId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly parentExecutionId?: string;
  readonly subject?: SemanticExecutionSubject;
  readonly origin?: SemanticExecutionOrigin;
};

let fallbackExecutionSequence = 0;

const createExecutionId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `ontahi-execution-${Date.now()}-${(fallbackExecutionSequence += 1)}`;

export const createSemanticExecutionContext = (
  origin?: SemanticExecutionOrigin,
): SemanticExecutionContext => {
  const executionId = createExecutionId();
  return {
    executionId,
    correlationId: executionId,
    ...(origin ? { origin } : {}),
  };
};

const semanticExecutionStorage = new AsyncLocalStorage<SemanticExecutionContext>();

export const getCurrentSemanticExecutionContext = (): SemanticExecutionContext | undefined =>
  semanticExecutionStorage.getStore();

export const runWithSemanticExecutionContext = <TValue>(
  context: SemanticExecutionContext,
  run: () => TValue,
): TValue => semanticExecutionStorage.run(context, run);

export const withSemanticExecutionActivity = <TValue>(
  subject: SemanticExecutionSubject,
  run: () => TValue,
): TValue => {
  const parent = getCurrentSemanticExecutionContext();
  if (!parent) return run();
  const executionId = createExecutionId();
  return runWithSemanticExecutionContext(
    {
      executionId,
      correlationId: parent.correlationId,
      causationId: parent.executionId,
      parentExecutionId: parent.executionId,
      subject,
      ...(parent.origin ? { origin: parent.origin } : {}),
    },
    run,
  );
};
