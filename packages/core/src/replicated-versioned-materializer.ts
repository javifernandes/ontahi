import {
  createReplicatedVersionedModelKernel,
  type AcceptedFrontier,
  type MaterializerVersion,
  type ReplicatedVersionedModelKernel,
  type ReplicatedVersionedModelResult,
  type ReplicatedVersionedModelSnapshot,
  type SourceFrontier,
} from './replicated-versioned-model.js';
import { cloneJson, type JsonValue } from './value/json.js';

export type MaterializerDependency = {
  input: string;
  outputs: readonly string[];
};

export type MaterializerAffectedSet =
  | { status: 'known'; outputs: readonly string[] }
  | { status: 'unknown'; reason: string };

export type MaterializerContext<TState extends JsonValue = JsonValue> = {
  mode: 'rebuild' | 'incremental';
  sourceFrontier: SourceFrontier;
  previous: ReplicatedVersionedModelSnapshot<TState> | null;
  affectedOutputs: readonly string[] | null;
};

export type MaterializerOutput<
  TState extends JsonValue = JsonValue,
  TArtifact extends JsonValue = JsonValue,
  TChange extends JsonValue = JsonValue,
> = {
  acceptedFrontier: AcceptedFrontier;
  state: TState;
  artifacts: readonly TArtifact[];
  changes: readonly TChange[];
  dependencies: readonly MaterializerDependency[];
  diagnostics: readonly JsonValue[];
};

export type Materializer<
  TInput,
  TDelta,
  TState extends JsonValue = JsonValue,
  TArtifact extends JsonValue = JsonValue,
  TChange extends JsonValue = JsonValue,
> = {
  readonly id: string;
  readonly version: MaterializerVersion;
  affectedBy(
    delta: TDelta,
    dependencies: readonly MaterializerDependency[],
  ): MaterializerAffectedSet;
  derive(
    input: TInput,
    context: MaterializerContext<TState>,
  ): Promise<MaterializerOutput<TState, TArtifact, TChange>>;
};

export type MaterializerRequest<TInput, TDelta> =
  | {
      mode: 'rebuild';
      input: TInput;
      sourceFrontier: SourceFrontier;
    }
  | {
      mode: 'incremental';
      input: TInput;
      delta: TDelta;
      baseSourceFrontier: SourceFrontier;
      sourceFrontier: SourceFrontier;
    };

export type MaterializerExecution<
  TState extends JsonValue = JsonValue,
  TArtifact extends JsonValue = JsonValue,
  TChange extends JsonValue = JsonValue,
> = {
  result: ReplicatedVersionedModelResult<TState>;
  output: MaterializerOutput<TState, TArtifact, TChange> | null;
};

export type ReplicatedVersionedMaterializerRunner<
  TInput,
  TDelta,
  TState extends JsonValue = JsonValue,
  TArtifact extends JsonValue = JsonValue,
  TChange extends JsonValue = JsonValue,
> = {
  run(
    request: MaterializerRequest<TInput, TDelta>,
  ): Promise<MaterializerExecution<TState, TArtifact, TChange>>;
  current(): ReplicatedVersionedModelSnapshot<TState> | null;
  dependencies(): readonly MaterializerDependency[];
};

const cloneDependencies = (
  dependencies: readonly MaterializerDependency[],
): readonly MaterializerDependency[] =>
  dependencies.map(dependency => ({
    input: dependency.input,
    outputs: [...dependency.outputs],
  }));

export const createReplicatedVersionedMaterializerRunner = <
  TInput,
  TDelta,
  TState extends JsonValue,
  TArtifact extends JsonValue = JsonValue,
  TChange extends JsonValue = JsonValue,
>(
  materializer: Materializer<TInput, TDelta, TState, TArtifact, TChange>,
): ReplicatedVersionedMaterializerRunner<TInput, TDelta, TState, TArtifact, TChange> => {
  const id = materializer.id;
  const version = materializer.version;
  const kernel: ReplicatedVersionedModelKernel<TState> = createReplicatedVersionedModelKernel({
    derivationId: id,
  });
  let dependencies: readonly MaterializerDependency[] = [];

  const run = async (
    request: MaterializerRequest<TInput, TDelta>,
  ): Promise<MaterializerExecution<TState, TArtifact, TChange>> => {
    const affected =
      request.mode === 'incremental'
        ? materializer.affectedBy(request.delta, cloneDependencies(dependencies))
        : ({ status: 'known', outputs: [] } as const);

    if (affected.status === 'unknown') {
      return {
        result: kernel.apply({ outcome: 'rebuild-required', reason: 'unknown-dependency' }),
        output: null,
      };
    }

    try {
      const output = await materializer.derive(request.input, {
        mode: request.mode,
        sourceFrontier: request.sourceFrontier,
        previous: kernel.current(),
        affectedOutputs: request.mode === 'incremental' ? [...affected.outputs] : null,
      });
      const result = kernel.apply(
        request.mode === 'incremental'
          ? {
              outcome: 'completed',
              mode: 'incremental',
              materializerVersion: version,
              baseSourceFrontier: request.baseSourceFrontier,
              sourceFrontier: request.sourceFrontier,
              acceptedFrontier: output.acceptedFrontier,
              state: output.state,
            }
          : {
              outcome: 'completed',
              mode: 'rebuild',
              materializerVersion: version,
              sourceFrontier: request.sourceFrontier,
              acceptedFrontier: output.acceptedFrontier,
              state: output.state,
            },
      );

      if (result.status === 'accepted') dependencies = cloneDependencies(output.dependencies);

      return { result, output: cloneJson(output) };
    } catch (failure) {
      return {
        result: kernel.apply({
          outcome: 'failed',
          mode: request.mode,
          materializerVersion: version,
          ...(request.mode === 'incremental'
            ? { baseSourceFrontier: request.baseSourceFrontier }
            : {}),
          sourceFrontier: request.sourceFrontier,
          failure,
        }),
        output: null,
      };
    }
  };

  return {
    run,
    current: kernel.current,
    dependencies: () => cloneDependencies(dependencies),
  };
};
