import { createArchitectureAppFacade, type RegisteredArchitecture } from './app-facade.js';
import type { ArchitectureDefinition, ArchitectureLayerDefaults } from './architecture-types.js';
import { combineConcerns } from './concerns.js';
import { getServerRuntimeConfig } from './config.js';
import type { Effectors } from './effect-intents/types.js';
import { combineRequirements } from './requirements.js';

const EMPTY_ARCHITECTURE: ArchitectureDefinition<unknown> = {};

let registeredArchitecture: ArchitectureDefinition<unknown> | undefined;
let architectureLoadPromise: Promise<ArchitectureDefinition<unknown>> | undefined;

type ArchitectureEvent<TDefinition> =
  TDefinition extends ArchitectureDefinition<infer TEvent> ? TEvent : unknown;

export const architecture = <TDefinition extends ArchitectureDefinition<any>>(
  definition: TDefinition,
): RegisteredArchitecture<ArchitectureEvent<TDefinition>, TDefinition> => {
  const registered = Object.assign(definition, {
    app: createArchitectureAppFacade<ArchitectureEvent<TDefinition>, TDefinition>(definition),
  });

  registeredArchitecture = registered as ArchitectureDefinition<unknown>;
  architectureLoadPromise = Promise.resolve(registered as ArchitectureDefinition<unknown>);
  return registered;
};

export const getArchitecture = async <TEvent = unknown>(): Promise<
  ArchitectureDefinition<TEvent>
> => {
  if (registeredArchitecture) {
    return registeredArchitecture as ArchitectureDefinition<TEvent>;
  }

  if (!architectureLoadPromise) {
    const loadArchitecture =
      getServerRuntimeConfig<TEvent>().loadArchitecture ??
      (async () => EMPTY_ARCHITECTURE as ArchitectureDefinition<TEvent>);
    architectureLoadPromise = loadArchitecture()
      .then(definition => definition ?? EMPTY_ARCHITECTURE)
      .catch(cause => {
        const error = new Error('Failed to load configured architecture module');
        (error as Error & { cause?: unknown }).cause = cause;
        throw error;
      }) as Promise<ArchitectureDefinition<unknown>>;
  }

  return architectureLoadPromise as Promise<ArchitectureDefinition<TEvent>>;
};

const matchesLayerPrefix = (scopePrefix: string, candidatePrefix: string) =>
  scopePrefix === candidatePrefix || scopePrefix.startsWith(`${candidatePrefix}.`);

export const resolveArchitectureLayerDefaults = async (
  prefix: string,
): Promise<ArchitectureLayerDefaults> => {
  const architectureDefinition = await getArchitecture();
  const layers = architectureDefinition.layers;

  if (!layers) {
    return {};
  }

  const matchingDefaults = Object.entries(layers)
    .filter(([candidatePrefix]) => matchesLayerPrefix(prefix, candidatePrefix))
    .sort(([leftPrefix], [rightPrefix]) => leftPrefix.length - rightPrefix.length)
    .map(([, defaults]) => defaults);

  return matchingDefaults.reduce<ArchitectureLayerDefaults>(
    (resolved, defaults) => ({
      requires: combineRequirements(resolved.requires, defaults.requires),
      concerns: combineConcerns(resolved.concerns, defaults.concerns),
    }),
    {},
  );
};

export const getArchitectureEffectors = async <TEvent = unknown>(): Promise<Effectors<TEvent>> =>
  ((await getArchitecture<TEvent>()).effectors ?? {}) as Effectors<TEvent>;
