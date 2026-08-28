import { cloneJson } from '../../value/json.js';
import type { EntityRef } from '../ref/index.js';

import { evaluateModelExpression } from './evaluator.js';
import {
  assertModelExpressionProgram,
  collectModelExpressionDependencies,
  type ModelExpressionDependency,
  type ModelExpressionProgram,
} from './program.js';

export type PortableOperationConditionRejection = {
  reason: string;
  message: string;
};

export type PortableOperationConditionDeclaration = {
  name: string;
  expression: ModelExpressionProgram;
  rejection?: PortableOperationConditionRejection;
};

export type PortableOperationCondition = {
  id: string;
  name: string;
  phase: 'pre';
  expression: ModelExpressionProgram;
  dependencies: readonly ModelExpressionDependency[];
  rejection: PortableOperationConditionRejection;
};

export type PortableOperationConditions = {
  pre: readonly PortableOperationCondition[];
};

export type PortableOperationConditionRegistryDeclaration = {
  version: 1;
  operations: Readonly<
    Record<
      string,
      {
        pre: readonly PortableOperationConditionDeclaration[];
      }
    >
  >;
};

export type PortableOperationConditionRegistry = {
  version: 1;
  operations: Readonly<Record<string, PortableOperationConditions>>;
};

type ConditionRef<TRef> =
  TRef extends EntityRef<infer TEntityName, infer TLocator>
    ? EntityRef<TEntityName, TLocator> & {
        is: (other: EntityRef<TEntityName, any>) => boolean;
      }
    : TRef;

export type OperationConditionInput<TInput> = TInput extends readonly unknown[]
  ? TInput
  : TInput extends object
    ? { [TKey in keyof TInput]: ConditionRef<TInput[TKey]> }
    : TInput;

export type OperationConditionAuthoring<TInput extends object> = (
  input: OperationConditionInput<TInput>,
) => boolean;

export type ExplicitOperationCondition = {
  kind: 'model-expression.condition';
  expression: ModelExpressionProgram;
  rejection?: PortableOperationConditionRejection;
};

export type OperationConditionContracts<TInput extends object> = {
  pre: Readonly<Record<string, OperationConditionAuthoring<TInput> | ExplicitOperationCondition>>;
};

export type ConditionEvaluation =
  | { status: 'satisfied' }
  | { status: 'rejected'; rejection: PortableOperationConditionRejection }
  | { status: 'unknown'; missing: readonly ModelExpressionDependency[] };

const conventionalRejection = (name: string): PortableOperationConditionRejection => ({
  reason: 'operation_condition_rejected',
  message: `Operation condition "${name}" was not satisfied.`,
});

export const definePortableOperationConditionRegistry = (
  declaration: PortableOperationConditionRegistryDeclaration,
): PortableOperationConditionRegistry => {
  if (declaration.version !== 1) {
    throw new TypeError(
      `Unsupported portable Operation condition registry version ${String(declaration.version)}.`,
    );
  }

  const operations = Object.fromEntries(
    Object.entries(declaration.operations).map(([operationId, contracts]) => {
      if (!operationId) {
        throw new TypeError('Portable Operation condition registry keys cannot be empty.');
      }
      const names = new Set<string>();
      const pre = contracts.pre.map(condition => {
        if (!condition.name || names.has(condition.name)) {
          throw new TypeError(
            `Portable Operation ${operationId} has an empty or duplicate precondition name.`,
          );
        }
        names.add(condition.name);
        assertModelExpressionProgram(condition.expression);
        const normalized = cloneJson({
          id: `${operationId}.pre.${condition.name}`,
          name: condition.name,
          phase: 'pre' as const,
          expression: condition.expression,
          dependencies: collectModelExpressionDependencies(condition.expression),
          rejection: condition.rejection ?? conventionalRejection(condition.name),
        });
        return normalized;
      });

      return [operationId, { pre }];
    }),
  );

  return { version: 1, operations };
};

export const evaluatePortableOperationCondition = (
  condition: PortableOperationCondition,
  input: Readonly<Record<string, unknown>>,
): ConditionEvaluation => {
  const result = evaluateModelExpression(condition.expression, { inputs: input });
  if (result.status === 'unknown') return result;
  if (typeof result.value !== 'boolean') {
    throw new TypeError(`Portable Operation condition ${condition.id} did not produce a boolean.`);
  }
  return result.value
    ? { status: 'satisfied' }
    : { status: 'rejected', rejection: condition.rejection };
};

const isExplicitOperationCondition = (value: unknown): value is ExplicitOperationCondition =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'model-expression.condition',
  );

export const resolveOperationConditionContracts = <TInput extends object>(
  operationId: string,
  contracts: OperationConditionContracts<TInput> | undefined,
  registry?: PortableOperationConditionRegistry,
): PortableOperationConditions | undefined => {
  const compiled = registry?.operations[operationId];
  if (!contracts) {
    if (compiled?.pre.length) {
      throw new TypeError(
        `Operation ${operationId} has stale compiled preconditions: ${compiled.pre
          .map(condition => condition.name)
          .join(', ')}. Run Ontahi codegen.`,
      );
    }
    return undefined;
  }
  if (!contracts.pre || typeof contracts.pre !== 'object' || Array.isArray(contracts.pre)) {
    throw new TypeError(
      `Operation ${operationId} contracts.pre must be an object of named portable conditions. Move opaque callbacks to contract(...) in concerns.`,
    );
  }

  const authored = Object.entries(contracts.pre);
  const generatedConditions = authored.map(([name, condition]) => {
    if (isExplicitOperationCondition(condition)) return undefined;
    if (typeof condition !== 'function') {
      throw new TypeError(`Operation ${operationId} precondition ${name} is not portable.`);
    }
    const generated = compiled?.pre.find(candidate => candidate.name === name);
    if (!generated) {
      throw new TypeError(
        `Operation ${operationId} precondition ${name} has no compiled Model Expression. Run Ontahi codegen or use modelExpression.condition(...) for runtime-only authoring.`,
      );
    }
    return generated;
  });
  const callbackAuthored = authored.filter(
    ([, condition]) => !isExplicitOperationCondition(condition),
  );
  const authoredNames = new Set(callbackAuthored.map(([name]) => name));
  const staleGenerated =
    compiled?.pre.filter(condition => !authoredNames.has(condition.name)) ?? [];
  if (staleGenerated.length > 0) {
    throw new TypeError(
      `Operation ${operationId} has stale compiled preconditions: ${staleGenerated
        .map(condition => condition.name)
        .join(', ')}. Run Ontahi codegen.`,
    );
  }
  if (compiled?.pre.some((condition, index) => condition.name !== callbackAuthored[index]?.[0])) {
    throw new TypeError(
      `Operation ${operationId} has stale compiled precondition order. Run Ontahi codegen.`,
    );
  }

  if (generatedConditions.every(condition => condition !== undefined)) {
    return compiled;
  }

  const resolvedDeclarations = authored.map(([name, condition]) => {
    if (isExplicitOperationCondition(condition)) {
      return { name, expression: condition.expression, rejection: condition.rejection };
    }

    if (typeof condition !== 'function') {
      throw new TypeError(`Operation ${operationId} precondition ${name} is not portable.`);
    }
    const generated = compiled?.pre.find(candidate => candidate.name === name);
    if (!generated) {
      throw new TypeError(
        `Operation ${operationId} precondition ${name} has no compiled Model Expression. Run Ontahi codegen or use modelExpression.condition(...) for runtime-only authoring.`,
      );
    }
    return {
      name,
      expression: generated.expression,
      rejection: generated.rejection,
    };
  });

  return definePortableOperationConditionRegistry({
    version: 1,
    operations: { [operationId]: { pre: resolvedDeclarations } },
  }).operations[operationId];
};
