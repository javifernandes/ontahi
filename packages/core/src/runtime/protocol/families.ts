import { dataGraphRuntimeProtocolFamilies } from './data-graph.js';
import { durableOperationRuntimeProtocolFamily } from './durable-operation.js';
import { operationRuntimeProtocolFamily } from './operation.js';

export const runtimeProtocolFamilies = [
  operationRuntimeProtocolFamily,
  durableOperationRuntimeProtocolFamily,
  ...dataGraphRuntimeProtocolFamilies,
] as const;
