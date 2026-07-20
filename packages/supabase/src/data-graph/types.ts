import type {
  AnyEntityDefinition,
  CompiledOrderBy,
  CompiledPredicate,
  GraphExecutionAuthorityOptions,
  RelationQueryBuilder,
  SelectionValue,
} from '@ontahi/core/data-graph';
import type { Effect } from 'effect';

export type SelectionShape = Record<string, SelectionValue>;
export type IncludeShape = Record<string, RelationQueryBuilder<any, any, any>>;
export type EntityRow = Record<string, unknown>;

export interface SupabaseLikeClient {
  from(table: string): any;
}

export type SupabaseGraphRuntimeOptions<TClientKind extends string = string> =
  GraphExecutionAuthorityOptions & {
    /**
     * @deprecated Prefer runtime-agnostic `authority`. `client` is adapter-specific compatibility
     * while hosts migrate away from Supabase-shaped call sites.
     */
    client?: TClientKind;
  };

export type SupabaseGraphCommandRuntimeOptions<TClientKind extends string = string> =
  SupabaseGraphRuntimeOptions<TClientKind> & {
    message?: string;
    logMessage?: string;
    telemetryName?: string;
    telemetryAttributes?: Record<string, unknown>;
  };

export type SupabaseErrorFactory<TError> = (input: {
  message: string;
  logMessage: string;
  cause: unknown;
}) => TError;

export type SupabasePredicateInput =
  | { operator: 'eq'; fieldName: string; value: unknown }
  | { operator: 'in'; fieldName: string; values: readonly unknown[] }
  | { operator: 'isNull'; fieldName: string }
  | { operator: 'lte'; fieldName: string; value: unknown }
  | { operator: 'lt'; fieldName: string; value: unknown };

export type FetchEntityRowsInput<TClient extends SupabaseLikeClient> = {
  supabase: TClient;
  entityDefinition: AnyEntityDefinition;
  predicates: ReadonlyArray<SupabasePredicateInput>;
  orderBy: ReadonlyArray<{ fieldName: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  selectShape?: SelectionShape;
  includeShape?: IncludeShape;
  tableName?: string;
  compiledWhere?: CompiledPredicate[];
  compiledOrderBy?: CompiledOrderBy[];
  message: string;
  createError: SupabaseErrorFactory<any>;
};

export type SupabaseReadDeps<
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object,
> = {
  getClient: (options?: TReadOptions) => Effect.Effect<TClient, TError>;
  createError: SupabaseErrorFactory<TError>;
};
