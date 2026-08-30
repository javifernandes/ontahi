import { dataGraphRuntimeProtocolFamilies } from './data-graph.js';
import { operationRuntimeProtocolFamily } from './operation.js';

export const runtimeProtocolFamilies = [
  operationRuntimeProtocolFamily,
  ...dataGraphRuntimeProtocolFamilies,
] as const;
