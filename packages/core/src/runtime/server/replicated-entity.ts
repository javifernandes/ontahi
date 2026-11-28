import { Effect } from 'effect';

import {
  createEntityIdentityRef,
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type EntityMutationCommand,
  type EntityMutationCommandExecutionRuntime,
} from '../../data-graph/index.js';
import { diffEntityPublication } from '../../model/replication/entity-publication-diff.js';

import { getRequiredDataGraphRuntime, hasDataGraphTransactionScope } from './data-graph.js';

type ReplicaRow = { readonly id: string };

export type ReplicatedEntityDeclaration<TInput, TRow extends ReplicaRow> =
  | { readonly source: (input: TInput) => readonly TRow[] }
  | {
      readonly from: () => readonly { readonly name: string }[];
      readonly derive: (input: TInput) => readonly TRow[];
    };

type DerivedReplicaDependencies = {
  readonly from: () => readonly { readonly name: string }[];
};

/** Projects the host's observed revisions onto the inputs declared by a derived Entity. */
export const readReplicatedEntityDependencies = <T>(
  entity: { readonly name: string; readonly replicated: DerivedReplicaDependencies },
  observed: ReadonlyMap<string, T>,
): readonly (readonly [string, T])[] =>
  entity.replicated.from().map(({ name }) => {
    if (!observed.has(name)) {
      throw new Error(`Missing observed dependency ${name} for replicated Entity ${entity.name}.`);
    }
    return [name, observed.get(name)!] as const;
  });

/** Prepare inside the guarded publication transaction, after reading current rows. */
export const prepareReplicatedEntityPublication = <TInput, TRow extends ReplicaRow>(
  entity: AnyEntityDefinition & { readonly replicated?: ReplicatedEntityDeclaration<TInput, TRow> },
  input: {
    readonly observed: TInput;
    readonly current: readonly NoInfer<TRow>[];
    readonly equals: (current: NoInfer<TRow>, candidate: NoInfer<TRow>) => boolean;
    readonly scopeOf: (current: NoInfer<TRow>) => string;
    readonly completeScopes: ReadonlyMap<string, (current: NoInfer<TRow>) => boolean>;
  },
) => {
  const declaration = entity.replicated;
  if (!declaration) throw new Error(`Entity ${entity.name} has no replication declaration.`);
  const candidate =
    'source' in declaration
      ? declaration.source(input.observed)
      : declaration.derive(input.observed);
  const storedFields = Object.entries(entity.fields).filter(
    ([, field]) => !isDerivedFieldDefinition(field) && !field.generatedBy,
  );
  const normalize = (row: TRow, current?: TRow): TRow => {
    const normalized = { ...row };
    for (const [name, field] of storedFields) {
      const key = name as keyof TRow;
      if (row[key] !== undefined) continue;
      if (field.nullable) {
        Object.assign(normalized, { [name]: null });
      } else if (current?.[key] !== undefined) {
        throw new Error(
          `Replicated Entity ${entity.name} cannot clear non-nullable field ${name}.`,
        );
      }
    }
    return normalized;
  };
  const previous = new Map(input.current.map(row => [row.id, row]));
  const normalizedCandidate = candidate.map(row => normalize(row, previous.get(row.id)));
  const diff = diffEntityPublication({
    ...input,
    candidate: normalizedCandidate,
    equals: (current, next) => input.equals(normalize(current), next),
  });
  const target = (row: TRow) => {
    const ref = createEntityIdentityRef(entity, row);
    if (!ref) throw new Error(`Replicated Entity ${entity.name} requires an identity locator.`);
    return ref;
  };
  const execute = (commands: readonly EntityMutationCommand[]) =>
    Effect.suspend(() => {
      if (!hasDataGraphTransactionScope()) {
        throw new Error('Replicated Entity publication requires an active Data Graph transaction.');
      }
      const runtime =
        getRequiredDataGraphRuntime<Partial<EntityMutationCommandExecutionRuntime<unknown>>>();
      if (!runtime.runEntityMutationCommand) {
        throw new Error('The active Data Graph runtime does not support Entity Mutation Commands.');
      }
      const run = runtime.runEntityMutationCommand.bind(runtime);
      return Effect.forEach(commands, command => run(command), { discard: true });
    });
  return {
    entityName: entity.name,
    dependencies:
      'from' in declaration ? declaration.from().map(dependency => dependency.name) : [],
    diff,
    remove: execute(
      diff.removes.map(id => ({
        kind: 'entity-mutation-command',
        entityName: entity.name,
        action: 'delete',
        target: target(previous.get(id)!),
      })),
    ),
    put: execute(
      diff.puts.map(row => {
        const current = previous.get(row.id);
        const base = { kind: 'entity-mutation-command' as const, entityName: entity.name };
        if (!current) return { ...base, action: 'create', values: { ...row } };
        const values = Object.fromEntries(
          Object.entries(row).filter(
            ([key, value]) => !Object.is(current[key as keyof TRow], value),
          ),
        );
        return { ...base, action: 'update', target: target(current), values };
      }),
    ),
  };
};

/** Orders publications by their declared dependencies within this publication group. */
export const orderReplicatedEntityPublications = <
  TPublication extends { readonly entityName: string; readonly dependencies: readonly string[] },
>(
  publications: readonly TPublication[],
): TPublication[] => {
  const pending = new Map<string, TPublication>();
  for (const publication of publications) {
    if (pending.has(publication.entityName)) {
      throw new Error(`Duplicate publication for Entity ${publication.entityName}.`);
    }
    pending.set(publication.entityName, publication);
  }

  const ordered: TPublication[] = [];
  const visiting = new Set<string>();
  const visit = (name: string): void => {
    const publication = pending.get(name);
    if (!publication) return;
    if (visiting.has(name)) {
      throw new Error(
        `Cyclic replicated Entity publications: ${[...visiting, name].join(' -> ')}.`,
      );
    }
    visiting.add(name);
    for (const dependency of publication.dependencies) visit(dependency);
    visiting.delete(name);
    pending.delete(name);
    ordered.push(publication);
  };
  for (const publication of publications) visit(publication.entityName);
  return ordered;
};
