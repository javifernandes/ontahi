import type {
  ReflectedEntityDataColumn,
  ReflectedEntityDataFilter,
  ReflectedEntityDataFilterOperator,
  ReflectedEntityDataOmittedColumn,
  ReflectedEntityDataQuery,
  ReflectedEntityDataResult,
  ReflectedEntityDataSort,
  ReflectedEntityDisplayDescriptor,
} from '@ontahi/core/data-graph';
import type { TaskRunListItem, TaskRunSource } from '@ontahi/core/runtime/contracts';

export type ExplorerMetric = {
  label: string;
  value: number;
};

export type ExplorerEntityDescriptor = {
  name: string;
  fieldCount: number;
  relationCount: number;
  graphOperationCount: number;
  domainOperationCount: number;
  durableOperationCount: number;
  taskCount: number;
  exposure?: string;
  relationOwner?: {
    source: string;
    name: string;
    cardinality: string;
    target: string;
  };
  display?: ExplorerEntityDisplayDescriptor;
};

export type ExplorerEntityDisplayDescriptor = ReflectedEntityDisplayDescriptor;

export type ExplorerEntityDetail = ExplorerEntityDescriptor & {
  diagram: string;
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    enumValues?: string[];
  }>;
  relations: Array<{
    name: string;
    kind: string;
    target: string;
  }>;
};

export type ExplorerSchemaVariant = {
  type: string;
  fields: ExplorerSchemaField[];
};

export type ExplorerSchemaFieldPresentation = {
  booleanLabels?: {
    true?: string;
    false?: string;
    unset?: string;
  };
};

export type ExplorerSchemaField = {
  path: string;
  type: string;
  required: boolean;
  description?: string;
  enumValues?: string[];
  variants?: ExplorerSchemaVariant[];
  presentation?: ExplorerSchemaFieldPresentation;
  selection?: {
    entityName: string;
    cardinality: 'one' | 'many';
    identity?: {
      name: string;
      fields: string[];
    };
  };
};

export type ExplorerSchemaDescriptor = {
  source: 'ontahi' | 'unknown' | 'not-declared';
  summary: string;
  fields: ExplorerSchemaField[];
  jsonSchema?: unknown;
  error?: string;
};

export type ExplorerOperationInputRefDescriptor = {
  path: string;
  entityName: string;
  receiver: boolean;
  optional: boolean;
  locators: Array<{
    name: string;
    fields: string[];
    sourceFields: string[];
    path?: {
      kind: 'relation-path';
      steps: Array<{
        name: string;
        entityName: string;
        sourceField: string;
        locator?: string;
        relation?: string;
        role?: string;
        cardinality?: string;
        optional?: boolean;
      }>;
    };
  }>;
};

export type ExplorerOperationDescriptor = {
  id: string;
  entityName: string;
  name: string;
  kind: 'graph' | 'domain' | 'durable';
  description?: string;
  authority: string;
  exposure: string;
  hasBridgeQuery?: boolean;
  bridgeQueryCount?: number;
  bridgeInvalidationCount?: number;
  durable?: {
    taskId: string;
    runtime: string;
    hasSubject: boolean;
    idempotencyPolicy?: string;
    runRefSchema: ExplorerSchemaDescriptor;
    progressSchema: ExplorerSchemaDescriptor;
    finalOutputSchema: ExplorerSchemaDescriptor;
  };
  ingressRoutes?: Array<{
    kind: 'http';
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    route: string;
    provider?: string;
    channel?: string;
  }>;
  inputSchema: ExplorerSchemaDescriptor;
  inputRefs?: ExplorerOperationInputRefDescriptor[];
  resultSchema: ExplorerSchemaDescriptor;
};

export type ExplorerTaskDescriptor = {
  id: string;
  entityName: string;
  name: string;
  inputSchema: ExplorerSchemaDescriptor;
  progressSchema: ExplorerSchemaDescriptor;
  resultSchema: ExplorerSchemaDescriptor;
  steps: Array<{
    id: string;
    inputSchema: ExplorerSchemaDescriptor;
    resultSchema: ExplorerSchemaDescriptor;
  }>;
};

export type ExplorerEventDescriptor = {
  type: string;
  domain: string;
  actorScoped: boolean;
  payloadFields: Array<{
    name: string;
    type: string;
  }>;
  relatedEntities: string[];
  handlers: string[];
};

export type ExplorerTaskRunListItem = TaskRunListItem;
export type ExplorerTaskRunSource = TaskRunSource;
export type ExplorerTaskRunRef = Pick<ExplorerTaskRunListItem, 'taskId' | 'runId'>;
export type ExplorerRecentTaskRunsLoader = () => Promise<ExplorerTaskRunListItem[]>;
export type ExplorerTaskRunSourceLoader = (
  ref: ExplorerTaskRunRef,
) => Promise<ExplorerTaskRunSource>;

export type ExplorerSnapshot = {
  metrics: ExplorerMetric[];
  entities: ExplorerEntityDescriptor[];
  operations: ExplorerOperationDescriptor[];
  tasks: ExplorerTaskDescriptor[];
  events: ExplorerEventDescriptor[];
  recentTaskRuns: ExplorerTaskRunListItem[];
};

export type ExplorerEntityDataFilterOperator = ReflectedEntityDataFilterOperator;
export type ExplorerEntityDataFilter = ReflectedEntityDataFilter;
export type ExplorerEntityDataSort = ReflectedEntityDataSort;
export type ExplorerEntityDataQuery = ReflectedEntityDataQuery;
export type ExplorerEntityDataColumn = ReflectedEntityDataColumn;
export type ExplorerEntityDataOmittedColumn = ReflectedEntityDataOmittedColumn;
export type ExplorerEntityDataResult = ReflectedEntityDataResult;
