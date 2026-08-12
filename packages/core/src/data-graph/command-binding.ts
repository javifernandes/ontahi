import type { Effect } from 'effect';

import { GraphCommand, type GraphCommandSpec } from './command.js';
import type { AnyEntityDefinition } from './definitions.js';

export type GraphCommandExecutor<TError = never, TOptions = undefined> = {
  run<TResult = void>(
    command: GraphCommandSpec<any, any, TResult>,
    options?: TOptions,
  ): Effect.Effect<TResult, TError>;
};

export type ExecutableGraphCommand<TResult = void, TError = never, TOptions = undefined> = {
  run: (options?: TOptions) => Effect.Effect<TResult, TError>;
  pipe: <TValue>(
    fn: (executable: ExecutableGraphCommand<TResult, TError, TOptions>) => TValue,
  ) => TValue;
};

export type BoundGraphCommand<
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
  TPayload = unknown,
  TResult = void,
  TError = never,
  TOptions = undefined,
> = GraphCommand<TEntity, TPayload, TResult> & {
  named: (name: string) => BoundGraphCommand<TEntity, TPayload, TResult, TError, TOptions>;
  exec: () => ExecutableGraphCommand<TResult, TError, TOptions>;
  run: (options?: TOptions) => Effect.Effect<TResult, TError>;
};

export const createExecutableGraphCommand = <TResult = void, TError = never, TOptions = undefined>(
  command: GraphCommandSpec<any, any, TResult>,
  executor: GraphCommandExecutor<TError, TOptions>,
): ExecutableGraphCommand<TResult, TError, TOptions> => {
  const executable: ExecutableGraphCommand<TResult, TError, TOptions> = {
    run: (options?: TOptions) => executor.run(command, options),
    pipe: fn => fn(executable),
  };

  return executable;
};

export const bindGraphCommand = <
  TEntity extends AnyEntityDefinition,
  TPayload = unknown,
  TResult = void,
  TError = never,
  TOptions = undefined,
>(
  command: GraphCommand<TEntity, TPayload, TResult>,
  executor: GraphCommandExecutor<TError, TOptions>,
): BoundGraphCommand<TEntity, TPayload, TResult, TError, TOptions> => {
  const executable = createExecutableGraphCommand<TResult, TError, TOptions>(
    command.build(),
    executor,
  );

  return Object.assign(command, {
    named: (name: string) =>
      createBoundGraphCommand<TEntity, TPayload, TResult, TError, TOptions>(
        {
          ...command.build(),
          name,
        },
        executor,
      ),
    exec: () => executable,
    run: (options?: TOptions) => executable.run(options),
  });
};

export const createBoundGraphCommand = <
  TEntity extends AnyEntityDefinition,
  TPayload = unknown,
  TResult = void,
  TError = never,
  TOptions = undefined,
>(
  command: GraphCommandSpec<TEntity, TPayload, TResult>,
  executor: GraphCommandExecutor<TError, TOptions>,
): BoundGraphCommand<TEntity, TPayload, TResult, TError, TOptions> =>
  bindGraphCommand(new GraphCommand(command), executor);
