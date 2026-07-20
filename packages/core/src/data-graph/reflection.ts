import type { OperationInvocationResult } from '../runtime/contracts.js';

export type ReflectedOperationDescriptor<TInput = unknown, TData = unknown> = {
  id: string;
  entityName: string;
  name: string;
  authority?: string;
  exposure?: string;
  _input?: TInput;
  _data?: TData;
};

export type ReflectedOperationInvocation<TInput = unknown> = {
  operationId: string;
  input: TInput;
  operation?: ReflectedOperationDescriptor<TInput, unknown>;
};

export type ReflectedOperationInvoker = {
  invokeOperation: <TInput = unknown, TData = unknown>(
    invocation: ReflectedOperationInvocation<TInput>,
  ) => Promise<OperationInvocationResult<TData>>;
};

export type ReflectedEntityDataFilterOperator = 'contains' | 'equals' | 'isNull';

export type ReflectedEntityDataFilter = {
  field: string;
  operator: ReflectedEntityDataFilterOperator;
  value?: string;
};

export type ReflectedEntityDataSort = {
  field: string;
  direction: 'asc' | 'desc';
};

export type ReflectedEntityDataQuery = {
  entityName: string;
  search?: string;
  filters?: ReflectedEntityDataFilter[];
  sort?: ReflectedEntityDataSort;
  page?: number;
  pageSize?: number;
};

export type ReflectedEntityDataColumn = {
  field: string;
  type: string;
  nullable: boolean;
};

export type ReflectedEntityDataOmittedColumn = {
  field: string;
  column: string;
  reason: string;
};

export type ReflectedEntityDisplayDescriptor = {
  primary?: string;
  secondary?: string[];
  search?: string[];
};

export type ReflectedEntityDataResult = {
  entityName: string;
  columns: ReflectedEntityDataColumn[];
  display?: ReflectedEntityDisplayDescriptor;
  omittedColumns?: ReflectedEntityDataOmittedColumn[];
  rows: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ReflectedEntityDataReader = {
  readEntityData: (query: ReflectedEntityDataQuery) => Promise<ReflectedEntityDataResult>;
};

type EntityDisplayLike = {
  displayMetadata?: {
    primary?: unknown;
    secondary?: unknown;
    search?: unknown;
  };
};

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value] : undefined;

export const describeReflectedEntityDisplay = (
  entity: unknown,
): ReflectedEntityDisplayDescriptor | undefined => {
  const display = (entity as EntityDisplayLike | undefined)?.displayMetadata;

  if (!display) {
    return undefined;
  }

  const descriptor: ReflectedEntityDisplayDescriptor = {};

  if (typeof display.primary === 'string') {
    descriptor.primary = display.primary;
  }

  const secondary = stringArray(display.secondary);
  if (secondary && secondary.length > 0) {
    descriptor.secondary = secondary;
  }

  const search = stringArray(display.search);
  if (search && search.length > 0) {
    descriptor.search = search;
  }

  return Object.keys(descriptor).length > 0 ? descriptor : undefined;
};
