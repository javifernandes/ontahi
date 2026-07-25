import type { Effectors } from './effect-intents/types.js';
import type { LayerConcern } from './layer-types.js';
import type { OperationInput, OperationRequirement } from './operation/requirement-types.js';
import type { TaskConfig } from './tasks.js';

export type ArchitectureNamespace = Record<string, unknown>;

export type ArchitectureLayerDefaults = {
  requires?: ReadonlyArray<OperationRequirement<OperationInput>>;
  concerns?: ReadonlyArray<LayerConcern<any, unknown>>;
};

export type ArchitectureDefinition<TEvent = unknown> = {
  effectors?: Effectors<TEvent>;
  layers?: Record<string, ArchitectureLayerDefaults>;
  server?: ArchitectureNamespace;
  graph?: ArchitectureNamespace;
  operation?: ArchitectureNamespace;
  ingress?: ArchitectureNamespace;
  transport?: ArchitectureNamespace;
  client?: ArchitectureNamespace;
  auth?: ArchitectureNamespace;
  require?: ArchitectureNamespace;
  concern?: ArchitectureNamespace;
  validation?: ArchitectureNamespace;
  cache?: ArchitectureNamespace;
  effects?: ArchitectureNamespace;
  runtime?: ArchitectureNamespace;
  task?: ArchitectureNamespace & TaskConfig;
};
