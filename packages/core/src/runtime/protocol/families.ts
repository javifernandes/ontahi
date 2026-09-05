import { dataGraphRuntimeProtocolFamilies } from './data-graph.js';
import { durableOperationRuntimeProtocolFamily } from './durable-operation.js';
import { operationRuntimeProtocolFamily } from './operation.js';

export const runtimeProtocolFamilies = [
  operationRuntimeProtocolFamily,
  durableOperationRuntimeProtocolFamily,
  ...dataGraphRuntimeProtocolFamilies,
] as const;

export type RuntimeProtocolFamily = (typeof runtimeProtocolFamilies)[number]['name'];

export const runtimeProtocolFamilyNames = runtimeProtocolFamilies.map(
  family => family.name,
) as readonly RuntimeProtocolFamily[];

const runtimeProtocolFamilyNameSet = new Set<string>(runtimeProtocolFamilyNames);

export const isRuntimeProtocolFamily = (value: unknown): value is RuntimeProtocolFamily =>
  typeof value === 'string' && runtimeProtocolFamilyNameSet.has(value);
