import {
  field,
  graphSchema,
  reflectSchemaRelations,
  value,
  type AnyEntityDefinition,
  type ReflectedSchemaRelation,
} from '@ontahi/core/data-graph';

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

const TaskRunSubjectSchema = value('TaskRunSubject', {
  type: field.string(),
  id: field.string(),
});

const TaskRunRefSchema = value('TaskRunRef', {
  taskId: field.string(),
  runId: field.string(),
  status: field.enum(['queued', 'running', 'completed', 'failed', 'cancelled'] as const),
  subject: graphSchema.optional(TaskRunSubjectSchema),
});

export type ExplorerEntityLike = {
  kind?: string;
  name?: string;
  entityName?: string;
  fields?: Record<string, unknown>;
  refLocators?: Record<string, { fields?: readonly string[] }>;
  identityLocatorName?: string;
  displayMetadata?: {
    primary?: unknown;
    secondary?: unknown;
    search?: unknown;
  };
  relations?: Record<
    string,
    {
      relationKind?: string;
      sourceField?: string;
      targetField?: string;
      nullable?: boolean;
      target?: {
        name?: string;
        refLocators?: Record<string, { fields?: readonly string[] }>;
        identityLocatorName?: string;
        displayMetadata?: ExplorerEntityLike['displayMetadata'];
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
  target?: ExplorerEntityLike;
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
  execution?: {
    atomicity?: 'required';
  };
  input?: unknown;
  output?: unknown;
  bridge?: {
    query?: readonly unknown[];
    invalidate?: readonly (readonly unknown[])[];
  };
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
  output?: unknown;
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

const getEntityIdentity = (entity: ExplorerEntityLike | undefined) => {
  const name = entity?.identityLocatorName;
  const fields = name ? entity?.refLocators?.[name]?.fields : undefined;

  return name && fields ? { name, fields: [...fields] } : undefined;
};

const getEntityRole = (shape: ExplorerEntityLike): ExplorerEntityDetail['entityRole'] =>
  shape.kind === 'graph-relation' && shape.relation?.source && shape.relation.target
    ? {
        kind: 'association',
        participants: [shape.relation.source, shape.relation.target],
      }
    : { kind: 'unknown' };

const describeRelation = (
  source: ExplorerEntityLike,
  name: string,
  relation: NonNullable<ExplorerEntityLike['relations']>[string],
): ExplorerEntityDetail['relations'][number] => {
  const kind =
    relation.relationKind === 'belongsTo' ||
    relation.relationKind === 'hasMany' ||
    relation.relationKind === 'manyToMany'
      ? relation.relationKind
      : 'relation';
  const direction = kind === 'hasMany' ? 'inverse' : 'forward';
  const cardinality = kind === 'belongsTo' ? 'one' : 'many';
  const nullable = kind === 'belongsTo' ? Boolean(relation.nullable) : false;
  const structuralVerbs =
    kind === 'belongsTo'
      ? nullable
        ? ['assign', 'clear']
        : ['assign']
      : kind === 'hasMany' || kind === 'manyToMany'
        ? ['add', 'remove']
        : [];
  const canonicalIdentity =
    kind === 'belongsTo' && relation.sourceField
      ? {
          sourceEntityName: source.name ?? 'Unknown',
          fieldName: relation.sourceField,
          targetEntityName: relation.target?.name ?? 'Unknown',
        }
      : kind === 'hasMany' && relation.targetField
        ? {
            sourceEntityName: relation.target?.name ?? 'Unknown',
            fieldName: relation.targetField,
            targetEntityName: source.name ?? 'Unknown',
          }
        : kind === 'manyToMany'
          ? {
              sourceEntityName: source.name ?? 'Unknown',
              relationName: name,
              targetEntityName: relation.target?.name ?? 'Unknown',
              cardinality: 'many-to-many' as const,
            }
          : undefined;

  return {
    name,
    kind,
    target: relation.target?.name ?? 'Unknown',
    targetIdentity: getEntityIdentity(relation.target),
    targetDisplay: describeExplorerEntityDisplay(relation.target),
    direction,
    cardinality,
    nullable,
    required: kind === 'belongsTo' && !nullable,
    structuralVerbs:
      structuralVerbs as ExplorerEntityDetail['relations'][number]['structuralVerbs'],
    ...(canonicalIdentity ? { canonicalIdentity } : {}),
  };
};

const describeReflectedRelation = (
  entities: readonly unknown[],
  relation: ReflectedSchemaRelation,
): ExplorerEntityDetail['relations'][number] => {
  const target = entities
    .map(getEntityShape)
    .find(candidate => candidate.name === relation.targetEntityName);
  const declaredSource = entities
    .map(getEntityShape)
    .find(candidate => candidate.name === relation.declaredOnEntityName);
  const declaredRelation = declaredSource?.relations?.[relation.declaredRelationName];
  const canonicalIdentity =
    declaredSource && declaredRelation
      ? describeRelation(declaredSource, relation.declaredRelationName, declaredRelation)
          .canonicalIdentity
      : undefined;

  return {
    name: relation.name,
    provenance: relation.provenance,
    declaredOnEntityName: relation.declaredOnEntityName,
    declaredRelationName: relation.declaredRelationName,
    kind: relation.kind,
    target: relation.targetEntityName,
    targetIdentity: getEntityIdentity(target),
    targetDisplay: describeExplorerEntityDisplay(target),
    direction: relation.direction,
    cardinality: relation.cardinality,
    nullable: relation.nullable,
    required: relation.required,
    structuralVerbs: relation.structuralVerbs,
    ...(canonicalIdentity ? { canonicalIdentity } : {}),
  };
};

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

const describeSchemaRefLocators = (
  path: string,
  target: ExplorerEntityLike,
  operation: ExplorerOperationLike,
) => {
  return Object.entries(target.refLocators ?? {}).flatMap(([name, locator]) => {
    const sourceFields = locator.fields ?? [];
    if (sourceFields.length === 0) {
      return [];
    }

    const locatorPath = describeInputRefLocatorPath(operation, path, name);

    return [
      {
        name,
        fields: [path],
        sourceFields: [...sourceFields],
        ...(locatorPath ? { path: locatorPath } : {}),
      },
    ];
  });
};

type ExplorerSchemaLike = {
  kind?: string;
  fields?: Record<string, unknown>;
  fieldType?: string;
  optional?: boolean;
  item?: unknown;
  target?: ExplorerEntityLike;
};

const unwrapSchemaRef = (
  schema: unknown,
): { optional: boolean; target: ExplorerEntityLike } | undefined => {
  let current = schema as ExplorerSchemaLike | undefined;
  let optional = false;

  while (current?.kind === 'schema.optional' || current?.kind === 'schema.nullable') {
    optional ||= current.kind === 'schema.optional';
    current = current.item as ExplorerSchemaLike | undefined;
  }

  if (current?.kind !== 'field' || current.fieldType !== 'reference' || !current.target?.name) {
    return undefined;
  }

  return {
    optional: optional || current.optional === true,
    target: current.target,
  };
};

const describeOperationInputRefs = (
  operation: ExplorerOperationLike,
): ExplorerOperationDescriptor['inputRefs'] => {
  const input = operation.input as ExplorerSchemaLike | undefined;
  const fields =
    input?.kind === 'schema.object' || input?.kind === 'value' ? (input.fields ?? {}) : {};
  const descriptors = Object.entries(fields).flatMap(([path, schema]) => {
    const inputRef = unwrapSchemaRef(schema);
    if (!inputRef?.target.name) {
      return [];
    }

    return [
      {
        path,
        entityName: inputRef.target.name,
        receiver: false,
        optional: inputRef.optional,
        locators: describeSchemaRefLocators(path, inputRef.target, operation),
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
  reflectedRelationCount?: number,
): ExplorerEntityDescriptor => {
  const shape = getEntityShape(entity);

  return {
    name: shape.name ?? 'Unknown',
    fieldCount: Object.keys(shape.fields ?? {}).length,
    relationCount: reflectedRelationCount ?? Object.keys(shape.relations ?? {}).length,
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
  const relations = reflectSchemaRelations(input.entities as readonly AnyEntityDefinition[]);

  return listUniqueExplorerEntities(input.entities).map(entity =>
    describeExplorerEntity(
      entity,
      summaries.get(getEntityShape(entity).name ?? ''),
      relations.filter(relation => relation.subjectEntityName === getEntityShape(entity).name)
        .length,
    ),
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
  const reflectedRelations = reflectSchemaRelations(
    input.entities as readonly AnyEntityDefinition[],
  ).filter(relation => relation.subjectEntityName === shape.name);
  const entityDetail = {
    ...describeExplorerEntity(entity, summaries.get(shape.name ?? ''), reflectedRelations.length),
    identity: getEntityIdentity(shape),
    entityRole: getEntityRole(shape),
    fields: Object.entries(shape.fields ?? {}).map(([name, field]) => {
      const fieldShape = field as ExplorerEntityFieldLike;
      const referenceTarget = fieldShape.fieldType === 'reference' ? fieldShape.target : undefined;

      return {
        name,
        type: fieldShape.fieldType ?? 'unknown',
        nullable: Boolean(fieldShape.nullable),
        enumValues: fieldShape.enumValues ? [...fieldShape.enumValues] : undefined,
        ...(referenceTarget?.name
          ? {
              reference: {
                entityName: referenceTarget.name,
                identity: getEntityIdentity(referenceTarget),
                display: describeExplorerEntityDisplay(referenceTarget),
              },
            }
          : {}),
      };
    }),
    relations: reflectedRelations.map(relation =>
      describeReflectedRelation(input.entities, relation),
    ),
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
  execution:
    operation.execution?.atomicity === 'required'
      ? { atomicity: operation.execution.atomicity }
      : undefined,
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
    resultSchema: step.output
      ? describeRuntimeSchema(step.output, { io: 'output' })
      : undeclaredResultSchema(),
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
