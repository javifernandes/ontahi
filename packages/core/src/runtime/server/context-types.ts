export type OperationRuntimeContext = {
  scope: string;
  telemetrySpanName: string;
  input?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  resources: Map<string, unknown>;
};

export type ServerOperationContext = OperationRuntimeContext;
