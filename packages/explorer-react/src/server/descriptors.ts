import { inferEntityRefInputLocatorFieldGroups } from '@ontahi/core/data-graph';
import { z } from 'zod';

import type {
  ExplorerEntityDescriptor,
  ExplorerEntityDetail,
  ExplorerEventDescriptor,
  ExplorerOperationDescriptor,
  ExplorerOperationInputRefDescriptor,
  ExplorerSnapshot,
  ExplorerTaskDescriptor,
  ExplorerTaskRunListItem,
} from '../contracts/index.js';

import { describeExplorerEntityDisplay } from './entity-display.js';
import {
  describeRuntimeSchema,
  undeclaredInputSchema,
  undeclaredResultSchema,
} from './schema-descriptor.js';

const TaskRunRefSchema = z.object({
  taskId: z.string(),
  runId: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  subject: z
    .object({
      type: z.string(),
      id: z.string(),
    })
    .optional(),
});

export type ExplorerEntityLike = {
  kind?: string;
  name?: string;
  entityName?: string;
  fields?: Record<string, unknown>;
  relations?: Record<
    string,
    {
      relationKind?: string;
      target?: {
        name?: string;
      };
    }
  >;
  graph?: {
    exposure?: string;
  };
  relation?: {
    source?: string;
    name?: string;
    cardinality?: string;
    target?: string;
  };
};

export type ExplorerEntityFieldLike = {
  fieldType?: string;
  nullable?: boolean;
  enumValues?: readonly string[];
};

export type ExplorerGraphEntitySummaryLike = {
  name: string;
  graphExposure?: string;
  graphOperationNames?: readonly string[];
  domainOperationNames?: readonly string[];
  durableOperationNames?: readonly string[];
  taskNames?: readonly string[];
};

export type ExplorerGraphSummaryLike = {
  entities?: readonly ExplorerGraphEntitySummaryLike[];
};

export type ExplorerOperationLike = {
  id: string;
  entityName: string;
  name: string;
  authority: string;
  exposure: string;
  description?: string;
  input?: unknown;
  output?: unknown;
  bridge?: {
    query?: readonly unknown[];
    invalidate?: readonly (readonly unknown[])[];
  };
  inputRefs?: Record<
    string,
    {
      kind?: string;
      entityName?: string;
      isReceiver?: boolean;
      isOptional?: boolean;
      locators?: readonly {
        name?: string;
        fields?: readonly string[];
        sourceFields?: readonly string[];
      }[];
      inferredLocators?: readonly {
        name?: string;
        fields?: readonly string[];
        sourceFields?: readonly string[];
      }[];
    }
  >;
  graphOps?: {
    inputRefs?: Record<
      string,
      {
        locators?: Record<
          string,
          {
            path?: {
              kind?: string;
              steps?: readonly {
                name?: string;
                entityName?: string;
                sourceField?: string;
                locator?: string;
                relation?: string;
                role?: string;
                cardinality?: string;
                optional?: boolean;
              }[];
            };
          }
        >;
      }
    >;
  };
  durable?: {
    runtime?: string;
    taskId?: string;
    progress?: unknown;
    finalOutput?: unknown;
    subject?: unknown;
    idempotency?: {
      policy?: string;
    };
  };
};

export type ExplorerTaskLike = {
  id: string;
  entityName: string;
  name: string;
};

export type ExplorerTaskStepDefinitionLike = {
  id: string;
  input?: unknown;
};

export type ExplorerTaskDefinitionLike = {
  input?: unknown;
  progress?: unknown;
  output?: unknown;
  steps?:
    | Record<string, ExplorerTaskStepDefinitionLike>
    | readonly ExplorerTaskStepDefinitionLike[];
};

export type ExplorerHttpIngressLike = {
  operationId?: string;
  kind?: string;
  method?: string;
  route?: string;
  provider?: string;
  channel?: string;
};

export type BuildExplorerSnapshotInput = {
  entities: readonly unknown[];
  graphSummary?: ExplorerGraphSummaryLike;
  graphOperations?: readonly ExplorerOperationLike[];
  domainOperations?: readonly ExplorerOperationLike[];
  tasks?: readonly ExplorerTaskLike[];
  events?: readonly ExplorerEventDescriptor[];
  recentTaskRuns?: readonly ExplorerTaskRunListItem[];
  httpIngress?: readonly ExplorerHttpIngressLike[];
  getTaskDefinition?: (taskId: string) => ExplorerTaskDefinitionLike | undefined;
};

const getEntityShape = (entity: unknown): ExplorerEntityLike => entity as ExplorerEntityLike;

const getEntityRelationOwner = (
  shape: ExplorerEntityLike,
): ExplorerEntityDescriptor['relationOwner'] => {
  const relation = shape.relation;

  if (
    shape.kind !== 'graph-relation' ||
    !relation?.source ||
    !relation.name ||
    !relation.cardinality ||
    !relation.target
  ) {
    return undefined;
  }

  return {
    source: relation.source,
    name: relation.name,
    cardinality: relation.cardinality,
    target: relation.target,
  };
};

const uniqueBy = <TValue>(
  values: readonly TValue[],
  getKey: (value: TValue) => string | undefined,
): TValue[] => {
  const seen = new Set<string>();

  return values.filter(value => {
    const name = getKey(value);

    if (!name || seen.has(name)) {
      return false;
    }

    seen.add(name);
    return true;
  });
};

const mermaidString = (value: string) => value.replaceAll('"', '#quot;');

const mermaidId = (prefix: string, value: string) =>
  `${prefix}_${value.replaceAll(/[^a-zA-Z0-9_]/g, '_')}`;

const uniqueStrings = (values: readonly string[]) => [...new Set(values)];

type ExplorerOperationInputRefLocatorPath = NonNullable<
  ExplorerOperationInputRefDescriptor['locators'][number]['path']
>;

const describeInputRefLocatorPath = (
  operation: ExplorerOperationLike,
  inputRefPath: string,
  locatorName: string,
): ExplorerOperationInputRefLocatorPath | undefined => {
  const path = operation.graphOps?.inputRefs?.[inputRefPath]?.locators?.[locatorName]?.path;

  if (path?.kind !== 'relation-path' || !Array.isArray(path.steps)) {
    return undefined;
  }

  const steps = path.steps.flatMap(step => {
    if (!step.name || !step.entityName || !step.sourceField) {
      return [];
    }

    return [
      {
        name: step.name,
        entityName: step.entityName,
        sourceField: step.sourceField,
        ...(step.locator ? { locator: step.locator } : {}),
        ...(step.relation ? { relation: step.relation } : {}),
        ...(step.role ? { role: step.role } : {}),
        ...(step.cardinality ? { cardinality: step.cardinality } : {}),
        ...(step.optional === true ? { optional: true } : {}),
      },
    ];
  });

  return steps.length > 0
    ? {
        kind: 'relation-path',
        steps,
      }
    : undefined;
};

const describeInputRefLocators = (
  path: string,
  inputRef: NonNullable<ExplorerOperationLike['inputRefs']>[string],
  operation: ExplorerOperationLike,
) => {
  const locators = inputRef.locators ?? [];

  if (locators.length > 0) {
    return locators.flatMap(locator => {
      if (!locator.name) {
        return [];
      }

      const locatorPath = describeInputRefLocatorPath(operation, path, locator.name);

      return [
        {
          name: locator.name,
          fields: [...(locator.fields ?? [])],
          sourceFields: [...(locator.sourceFields ?? locator.fields ?? [])],
          ...(locatorPath ? { path: locatorPath } : {}),
        },
      ];
    });
  }

  return (inputRef.inferredLocators ?? []).flatMap(locator => {
    if (!locator.name) {
      return [];
    }

    const sourceFields = locator.sourceFields ?? locator.fields ?? [];
    const locatorPath = describeInputRefLocatorPath(operation, path, locator.name);

    return [
      {
        name: locator.name,
        fields: uniqueStrings(
          inferEntityRefInputLocatorFieldGroups(path, sourceFields).flatMap(group => [...group]),
        ),
        sourceFields: [...sourceFields],
        ...(locatorPath ? { path: locatorPath } : {}),
      },
    ];
  });
};

const describeOperationInputRefs = (
  operation: ExplorerOperationLike,
): ExplorerOperationDescriptor['inputRefs'] => {
  const descriptors = Object.entries(operation.inputRefs ?? {}).flatMap(([path, inputRef]) => {
    if (inputRef.kind !== 'entity-ref-input' || !inputRef.entityName) {
      return [];
    }

    return [
      {
        path,
        entityName: inputRef.entityName,
        receiver: Boolean(inputRef.isReceiver),
        optional: Boolean(inputRef.isOptional),
        locators: describeInputRefLocators(path, inputRef, operation),
      },
    ];
  });

  return descriptors.length > 0 ? descriptors : undefined;
};

const buildEntityDiagram = (entity: ExplorerEntityDetail) => {
  const lines = ['flowchart LR'];
  const entityNodeId = mermaidId('entity', entity.name);

  lines.push(`  ${entityNodeId}["${mermaidString(entity.name)}"]`);

  if (entity.relationOwner) {
    const sourceNodeId = mermaidId('entity', entity.relationOwner.source);
    const targetNodeId = mermaidId('entity', entity.relationOwner.target);
    const label = `${entity.relationOwner.name} (${entity.relationOwner.cardinality})`;

    lines.push(`  ${sourceNodeId}["${mermaidString(entity.relationOwner.source)}"]`);
    lines.push(`  ${targetNodeId}["${mermaidString(entity.relationOwner.target)}"]`);
    lines.push(`  ${sourceNodeId} -->|"${mermaidString(label)}"| ${entityNodeId}`);
    lines.push(`  ${entityNodeId} --> ${targetNodeId}`);
  }

  if (entity.relations.length === 0) {
    if (!entity.relationOwner) {
      lines.push(`  noRelations["No reflected relations"]`);
      lines.push(`  ${entityNodeId} -.-> noRelations`);
    }
  } else {
    for (const relation of entity.relations) {
      const targetNodeId = mermaidId('entity', relation.target);
      const label = `${relation.name} (${relation.kind})`;

      lines.push(`  ${targetNodeId}["${mermaidString(relation.target)}"]`);
      lines.push(`  ${entityNodeId} -->|"${mermaidString(label)}"| ${targetNodeId}`);
    }
  }

  const operationTotal = entity.graphOperationCount + entity.domainOperationCount;
  const operationNodeId = mermaidId('ops', entity.name);
  const taskNodeId = mermaidId('tasks', entity.name);

  lines.push(`  ${operationNodeId}["${operationTotal} operations"]`);
  lines.push(`  ${taskNodeId}["${entity.taskCount} tasks"]`);
  lines.push(`  ${entityNodeId} -.-> ${operationNodeId}`);
  lines.push(`  ${entityNodeId} -.-> ${taskNodeId}`);

  return lines.join('\n');
};

const summaryByEntityName = (summary: ExplorerGraphSummaryLike | undefined) =>
  new Map((summary?.entities ?? []).map(entity => [entity.name, entity]));

export const listUniqueExplorerEntities = (entities: readonly unknown[]) =>
  uniqueBy(entities, entity => getEntityShape(entity).name);

export const describeExplorerEntity = (
  entity: unknown,
  summary?: ExplorerGraphEntitySummaryLike,
): ExplorerEntityDescriptor => {
  const shape = getEntityShape(entity);

  return {
    name: shape.name ?? 'Unknown',
    fieldCount: Object.keys(shape.fields ?? {}).length,
    relationCount: Object.keys(shape.relations ?? {}).length,
    graphOperationCount: summary?.graphOperationNames?.length ?? 0,
    domainOperationCount: summary?.domainOperationNames?.length ?? 0,
    durableOperationCount: summary?.durableOperationNames?.length ?? 0,
    taskCount: summary?.taskNames?.length ?? 0,
    exposure: shape.graph?.exposure ?? summary?.graphExposure,
    relationOwner: getEntityRelationOwner(shape),
    display: describeExplorerEntityDisplay(shape),
  };
};

export const describeExplorerEntities = (input: {
  entities: readonly unknown[];
  graphSummary?: ExplorerGraphSummaryLike;
}): ExplorerEntityDescriptor[] => {
  const summaries = summaryByEntityName(input.graphSummary);

  return listUniqueExplorerEntities(input.entities).map(entity =>
    describeExplorerEntity(entity, summaries.get(getEntityShape(entity).name ?? '')),
  );
};

export const getExplorerEntityDetail = (
  input: {
    entities: readonly unknown[];
    graphSummary?: ExplorerGraphSummaryLike;
  },
  entityName: string,
): ExplorerEntityDetail | null => {
  const summaries = summaryByEntityName(input.graphSummary);
  const entity = listUniqueExplorerEntities(input.entities).find(
    candidate => getEntityShape(candidate).name === entityName,
  );

  if (!entity) {
    return null;
  }

  const shape = getEntityShape(entity);
  const entityDetail = {
    ...describeExplorerEntity(entity, summaries.get(shape.name ?? '')),
    fields: Object.entries(shape.fields ?? {}).map(([name, field]) => {
      const fieldShape = field as ExplorerEntityFieldLike;

      return {
        name,
        type: fieldShape.fieldType ?? 'unknown',
        nullable: Boolean(fieldShape.nullable),
        enumValues: fieldShape.enumValues ? [...fieldShape.enumValues] : undefined,
      };
    }),
    relations: Object.entries(shape.relations ?? {}).map(([name, relation]) => ({
      name,
      kind: relation.relationKind ?? 'relation',
      target: relation.target?.name ?? 'Unknown',
    })),
    diagram: '',
  };

  return {
    ...entityDetail,
    diagram: buildEntityDiagram(entityDetail),
  };
};

const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const getIngressRoutesByOperationId = (routes: readonly ExplorerHttpIngressLike[] = []) => {
  const routesByOperationId = new Map<
    string,
    NonNullable<ExplorerOperationDescriptor['ingressRoutes']>
  >();

  for (const route of routes) {
    if (
      route.kind !== 'http' ||
      !route.operationId ||
      !route.route ||
      !route.method ||
      !httpMethods.has(route.method)
    ) {
      continue;
    }

    const nextRoute = {
      kind: 'http',
      method: route.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      route: route.route,
      provider: route.provider,
      channel: route.channel,
    } as const;
    const currentRoutes = routesByOperationId.get(route.operationId) ?? [];

    if (
      !currentRoutes.some(
        candidate =>
          candidate.kind === nextRoute.kind &&
          candidate.method === nextRoute.method &&
          candidate.route === nextRoute.route &&
          candidate.provider === nextRoute.provider &&
          candidate.channel === nextRoute.channel,
      )
    ) {
      currentRoutes.push(nextRoute);
    }

    routesByOperationId.set(route.operationId, currentRoutes);
  }

  return routesByOperationId;
};

const describeGraphOperation = (
  operation: ExplorerOperationLike,
  ingressRoutesByOperationId: Map<
    string,
    NonNullable<ExplorerOperationDescriptor['ingressRoutes']>
  >,
): ExplorerOperationDescriptor => ({
  id: operation.id,
  entityName: operation.entityName,
  name: operation.name,
  kind: 'graph',
  description: operation.description,
  authority: operation.authority,
  exposure: operation.exposure,
  ingressRoutes: ingressRoutesByOperationId.get(operation.id),
  inputSchema: operation.input ? describeRuntimeSchema(operation.input) : undeclaredInputSchema(),
  inputRefs: describeOperationInputRefs(operation),
  resultSchema: operation.output
    ? describeRuntimeSchema(operation.output, { io: 'output' })
    : undeclaredResultSchema(),
});

const describeDomainOperation = (
  operation: ExplorerOperationLike,
  ingressRoutesByOperationId: Map<
    string,
    NonNullable<ExplorerOperationDescriptor['ingressRoutes']>
  >,
): ExplorerOperationDescriptor => ({
  id: operation.id,
  entityName: operation.entityName,
  name: operation.name,
  kind: operation.durable ? 'durable' : 'domain',
  description: operation.description,
  authority: operation.authority,
  exposure: operation.exposure,
  hasBridgeQuery: Boolean(operation.bridge?.query?.length),
  bridgeQueryCount: operation.bridge?.query?.length ?? 0,
  bridgeInvalidationCount: operation.bridge?.invalidate?.length ?? 0,
  durable: operation.durable?.runtime
    ? {
        taskId: operation.durable.taskId ?? operation.id,
        runtime: operation.durable.runtime,
        hasSubject: Boolean(operation.durable.subject),
        idempotencyPolicy: operation.durable.idempotency?.policy,
        runRefSchema: describeRuntimeSchema(TaskRunRefSchema, { io: 'output' }),
        progressSchema: operation.durable.progress
          ? describeRuntimeSchema(operation.durable.progress, { io: 'output' })
          : undeclaredResultSchema(),
        finalOutputSchema: operation.durable.finalOutput
          ? describeRuntimeSchema(operation.durable.finalOutput, { io: 'output' })
          : undeclaredResultSchema(),
      }
    : undefined,
  ingressRoutes: ingressRoutesByOperationId.get(operation.id),
  inputSchema: describeRuntimeSchema(operation.input),
  inputRefs: describeOperationInputRefs(operation),
  resultSchema: operation.output
    ? describeRuntimeSchema(operation.output, { io: 'output' })
    : undeclaredResultSchema(),
});

const listTaskSteps = (steps: ExplorerTaskDefinitionLike['steps'] = {}) =>
  Array.isArray(steps) ? steps : Object.values(steps);

const describeTask = (
  task: ExplorerTaskLike,
  taskDefinition: ExplorerTaskDefinitionLike | undefined,
): ExplorerTaskDescriptor => ({
  id: task.id,
  entityName: task.entityName,
  name: task.name,
  inputSchema: describeRuntimeSchema(taskDefinition?.input),
  progressSchema: taskDefinition?.progress
    ? describeRuntimeSchema(taskDefinition.progress, { io: 'output' })
    : undeclaredResultSchema(),
  resultSchema: taskDefinition?.output
    ? describeRuntimeSchema(taskDefinition.output, { io: 'output' })
    : undeclaredResultSchema(),
  steps: listTaskSteps(taskDefinition?.steps).map(step => ({
    id: step.id,
    inputSchema: step.input ? describeRuntimeSchema(step.input) : undeclaredInputSchema(),
    resultSchema: undeclaredResultSchema(),
  })),
});

export const buildExplorerSnapshot = (input: BuildExplorerSnapshotInput): ExplorerSnapshot => {
  const entities = describeExplorerEntities({
    entities: input.entities,
    graphSummary: input.graphSummary,
  });
  const ingressRoutesByOperationId = getIngressRoutesByOperationId(input.httpIngress);
  const operations = uniqueBy(
    [
      ...(input.graphOperations ?? []).map(operation =>
        describeGraphOperation(operation, ingressRoutesByOperationId),
      ),
      ...(input.domainOperations ?? []).map(operation =>
        describeDomainOperation(operation, ingressRoutesByOperationId),
      ),
    ],
    operation => operation.id,
  ).sort((left, right) => left.id.localeCompare(right.id));
  const tasks = (input.tasks ?? []).map(task =>
    describeTask(task, input.getTaskDefinition?.(task.id)),
  );
  const events = [...(input.events ?? [])];

  return {
    metrics: [
      { label: 'Entity kinds', value: entities.length },
      { label: 'Operations', value: operations.length },
      { label: 'Tasks', value: tasks.length },
      { label: 'Event kinds', value: events.length },
    ],
    entities,
    operations,
    tasks,
    events,
    recentTaskRuns: [...(input.recentTaskRuns ?? [])],
  };
};
