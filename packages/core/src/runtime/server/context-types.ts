export type OperationExecutionAttempt = {
  readonly attemptId: string;
  readonly ordinal: number;
  readonly implementation?: {
    readonly id: string;
    readonly kind?: string;
  };
  readonly terminal?: {
    readonly kind: 'retry-exhausted';
    readonly maxAttempts: number;
    readonly failureReason: string;
  };
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
