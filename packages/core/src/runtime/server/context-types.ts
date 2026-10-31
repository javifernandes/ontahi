export type OperationExecutionAttempt = {
  readonly attemptId: string;
  readonly ordinal: number;
};

export type OperationRuntimeContext = {
  scope: string;
  telemetrySpanName: string;
  input?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  resources: Map<string, unknown>;
  attempt?: OperationExecutionAttempt;
};

export type ServerOperationContext = OperationRuntimeContext;
