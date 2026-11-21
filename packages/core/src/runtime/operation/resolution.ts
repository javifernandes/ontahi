import type {
  DomainOperationDeclarationMetadata,
  DomainOperationDefaults,
  DomainOperationInvocation,
  DomainOperationDeclarations,
  GraphOperationDeclarations,
  ResolveDomainOperations,
  ResolveGraphOperations,
} from '../../data-graph/operations.js';
import { getGraphOutputDescriptor } from '../../data-graph/output/index.js';
import { isGraphSchemaDefinition } from '../../data-graph/schema-descriptor.js';
import type { DomainOperationBridgeMetadata } from '../../model/operation/client-metadata.js';
import type { DomainOperationReceiverDescriptor } from '../../model/operation/definition.js';
import { assertValidDomainOperationExecution } from '../../model/operation/execution-policy.js';
import { isRecord } from '../../value/object.js';

type ResolvedDomainOperation = {
  id: string;
  entityName: string;
  name: string;
  authority: 'server';
  exposure: 'bridge' | 'server-only';
};

export const resolveOperationId = (entityName: string, operationName: string) =>
  `${entityName}.${operationName}`;

export const assertRegisteredDomainOperationReceivers = (
  operations: ReadonlyArray<{
    id: string;
    receiver?: DomainOperationReceiverDescriptor;
  }>,
  registeredEntityNames: ReadonlySet<string>,
) => {
  for (const operation of operations) {
    const receiver = operation.receiver;
    if (receiver?.source !== 'declaration') continue;
    if (!registeredEntityNames.has(receiver.entityName)) {
      throw new Error(
        `Domain operation "${operation.id}" receiver Entity "${receiver.entityName}" is not registered.`,
      );
    }
  }
};

export const resolveGraphOperations = <
  TEntityName extends string,
  TOperations extends GraphOperationDeclarations,
>(
  entityName: TEntityName,
  operations: TOperations,
): ResolveGraphOperations<TEntityName, TOperations> =>
  Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => {
      const operationId = resolveOperationId(entityName, name);

      if (operation.input !== undefined && !isGraphSchemaDefinition(operation.input)) {
        throw new Error(`Graph operation "${operationId}" input must be an Ontahi schema.`);
      }

      if (operation.output !== undefined && !isGraphSchemaDefinition(operation.output)) {
        throw new Error(`Graph operation "${operationId}" output must be an Ontahi schema.`);
      }

      return [
        name,
        {
          ...operation,
          entityName,
          name,
          id: operationId,
        },
      ];
    }),
  ) as ResolveGraphOperations<TEntityName, TOperations>;

const operationInputFields = (schema: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(schema)) return undefined;
  if (schema.kind === 'schema.named') return operationInputFields(schema.item);
  return (schema.kind === 'value' || schema.kind === 'schema.object') && isRecord(schema.fields)
    ? schema.fields
    : undefined;
};

const operationReceiverRef = (
  operationId: string,
  input: unknown,
  path: string,
): Extract<DomainOperationReceiverDescriptor, { kind: 'input' }> | undefined => {
  const fields = operationInputFields(input);
  const field = fields?.[path];
  const invalid = (message: string) => {
    throw new Error(`Domain operation "${operationId}" receiver ${message}.`);
  };

  if (!field) return invalid(`path "${path}" is not a top-level input field`);
  if (!isRecord(field)) return invalid(`path "${path}" is not an Entity Ref participant`);
  if (
    field.kind === 'schema.optional' ||
    field.kind === 'schema.nullable' ||
    (field.kind === 'field' && (field.optional === true || field.nullable === true))
  ) {
    return invalid(`path "${path}" must be required and non-nullable`);
  }
  if (
    field.kind !== 'field' ||
    field.fieldType !== 'reference' ||
    (field.referenceRequirement !== 'portable' && field.referenceRequirement !== 'existing') ||
    !isRecord(field.target) ||
    typeof field.target.name !== 'string'
  ) {
    return invalid(`path "${path}" is not a portable or existing Entity Ref participant`);
  }

  return {
    kind: 'input',
    path,
    entityName: field.target.name,
    participant: 'ref',
    requirement: field.referenceRequirement,
    source: 'declaration',
  };
};

const resolveOperationReceiver = (
  operationId: string,
  operation: DomainOperationDeclarationMetadata<any, any, any>,
): DomainOperationReceiverDescriptor | undefined => {
  const declaration = operation.receiver;
  if (!declaration) return undefined;

  if ('source' in declaration) {
    if (declaration.kind === 'entity-type') return declaration;
    const resolved = operationReceiverRef(operationId, operation.input, declaration.path);
    if (
      !resolved ||
      resolved.entityName !== declaration.entityName ||
      resolved.requirement !== declaration.requirement ||
      resolved.participant !== declaration.participant
    ) {
      throw new Error(
        `Domain operation "${operationId}" receiver descriptor does not match its input schema.`,
      );
    }
    return declaration;
  }

  if (declaration.kind === 'entity-type') {
    if (
      !isRecord(declaration.entity) ||
      declaration.entity.kind !== 'entity' ||
      typeof declaration.entity.name !== 'string'
    ) {
      throw new Error(
        `Domain operation "${operationId}" entity-type receiver must reference an Entity definition.`,
      );
    }
    return {
      kind: 'entity-type',
      entityName: declaration.entity.name,
      source: 'declaration',
    };
  }

  return operationReceiverRef(operationId, operation.input, declaration.path);
};

export const resolveDomainOperations = <
  TEntityName extends string,
  TOperations extends DomainOperationDeclarations,
>(
  entityName: TEntityName,
  operations: TOperations,
  defaults?: DomainOperationDefaults,
): ResolveDomainOperations<TEntityName, TOperations> =>
  Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => {
      const operationId = resolveOperationId(entityName, name);
      const receiver = resolveOperationReceiver(operationId, operation);

      if (operation.input !== undefined && !isGraphSchemaDefinition(operation.input)) {
        throw new Error(`Domain operation "${operationId}" input must be an Ontahi schema.`);
      }

      if (operation.output !== undefined && !isGraphSchemaDefinition(operation.output)) {
        throw new Error(`Domain operation "${operationId}" output must be an Ontahi schema.`);
      }

      assertValidDomainOperationExecution(operationId, operation.execution);
      if (operation.durable && operation.execution?.retry) {
        throw new Error(
          `Durable domain operation "${operationId}" cannot declare immediate execution.retry semantics.`,
        );
      }

      const authority = operation.authority ?? defaults?.authority ?? 'server';
      const exposure = operation.exposure ?? defaults?.exposure ?? 'server-only';
      const operationLayer =
        'layer' in operation && typeof operation.layer === 'string'
          ? operation.layer
          : (defaults?.layer ?? entityName);

      const bridge =
        operation.bridge ??
        defaults?.bridge ??
        (exposure === 'bridge' ? ({} satisfies DomainOperationBridgeMetadata<unknown>) : undefined);
      const durable = operation.durable
        ? {
            ...defaults?.durable,
            ...operation.durable,
            ...(operation.durable.finalOutput === undefined && operation.output !== undefined
              ? { finalOutput: operation.output }
              : {}),
          }
        : undefined;

      if (durable && !durable.runtime) {
        throw new Error(
          `Durable domain operation "${operationId}" must declare durable.runtime or inherit it from domainOperationDefaults.durable.runtime.`,
        );
      }

      let resolvedOperation: ResolvedDomainOperation &
        ((input: unknown) => DomainOperationInvocation<unknown>);
      const invoke = (input: unknown): DomainOperationInvocation<unknown> => ({
        kind: 'domain-operation-invocation' as const,
        operation: resolvedOperation,
        operationId: resolvedOperation.id,
        input,
      });
      resolvedOperation = invoke as typeof resolvedOperation;
      Object.assign(resolvedOperation, operation, {
        authority,
        exposure,
        layer: operationLayer,
        graphOutput: operation.graphOutput ?? getGraphOutputDescriptor(operation.output),
        ...(bridge ? { bridge } : {}),
        ...(durable ? { durable } : {}),
        ...(receiver ? { receiver } : {}),
        entityName,
        id: operationId,
      });
      Object.defineProperty(resolvedOperation, 'name', {
        value: name,
        enumerable: true,
        configurable: true,
      });

      return [name, resolvedOperation];
    }),
  ) as unknown as ResolveDomainOperations<TEntityName, TOperations>;
