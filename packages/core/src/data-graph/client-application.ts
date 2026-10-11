import type { AnyEntityDefinition } from './definitions.js';

export type ClientApplicationOperation = {
  readonly id: string;
  readonly entityName: string;
  readonly name: string;
  readonly description?: string;
  readonly input?: unknown;
  readonly durable?: unknown;
};

export type ClientApplicationEntity = {
  readonly entityName: string;
  readonly definition: AnyEntityDefinition;
  readonly domain: Readonly<Record<string, ClientApplicationOperation>>;
};

export type ClientApplication<
  TEntities extends readonly ClientApplicationEntity[] = readonly ClientApplicationEntity[],
> = {
  readonly entities: TEntities;
};

export const defineClientApplication = <const TEntities extends readonly ClientApplicationEntity[]>(
  application: ClientApplication<TEntities>,
): ClientApplication<TEntities> => application;
