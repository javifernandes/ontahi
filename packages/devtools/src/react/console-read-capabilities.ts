import { isRecord } from '@ontahi/core';
import { isGraphReadCapabilities, type GraphReadCapabilities } from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolExchange,
  isConfigurableRuntimeTransport,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

type Entry = { capabilities?: GraphReadCapabilities; error?: string };
type Discovery = {
  transport: RuntimeTransport<any>;
  targetsKey: string;
  route?: string;
  identityKey: string;
  entries: ReadonlyMap<string, Entry>;
};
const subscribeUnconfigured = () => () => undefined;

/** Fetch metadata only. Results are scoped to transport, route and identity, never to prior reads. */
export const useConsoleReadCapabilities = (
  transport: RuntimeTransport<any> | undefined,
  entityName: string | undefined,
  identityKey = '',
  knownEntities: readonly string[] = [],
) => {
  const routing =
    transport && isConfigurableRuntimeTransport(transport) ? transport.routing : undefined;
  const route = useSyncExternalStore(
    routing?.subscribe ?? subscribeUnconfigured,
    () => routing?.inspect().assignments['graph.read'],
    () => undefined,
  );
  const targetsKey = JSON.stringify(
    knownEntities.length ? knownEntities : entityName ? [entityName] : [],
  );
  const [discovery, setDiscovery] = useState<Discovery>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!transport) return;
    let active = true;
    const controller = new AbortController();
    const entries = new Map<string, Entry>();
    setDiscovery({ transport, targetsKey, route, identityKey, entries });
    const exchange = createRuntimeProtocolExchange({ transport });
    const publish = (name: string, entry: Entry) => {
      if (!active) return;
      entries.set(name, entry);
      setDiscovery({ transport, targetsKey, route, identityKey, entries: new Map(entries) });
    };
    for (const name of JSON.parse(targetsKey) as string[]) {
      void exchange(
        {
          family: 'graph.read',
          body: { version: 1, kind: 'graph-read-capabilities', entityName: name },
        },
        { signal: controller.signal },
      )
        .then(response => {
          if (!isRecord(response)) throw new Error('Invalid Graph Read capabilities response.');
          if (
            response.kind === 'protocol-error' &&
            isRecord(response.error) &&
            typeof response.error.message === 'string'
          )
            throw new Error(response.error.message);
          if (
            response.kind !== 'graph-read-capabilities-result' ||
            response.entityName !== name ||
            !isGraphReadCapabilities(response.capabilities)
          )
            throw new Error('This server did not return Graph Read capabilities.');
          publish(name, { capabilities: response.capabilities });
        })
        .catch((error: unknown) =>
          publish(name, {
            error: error instanceof Error ? error.message : 'Could not load ordering permissions.',
          }),
        );
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [transport, targetsKey, route, identityKey, revision]);

  const current =
    discovery?.transport === transport &&
    discovery?.targetsKey === targetsKey &&
    discovery?.route === route &&
    discovery?.identityKey === identityKey
      ? discovery
      : undefined;
  const variants = useMemo(
    () =>
      [...(current?.entries ?? [])].flatMap(([name, entry]) =>
        (entry.capabilities?.variants ?? []).filter(variant => variant.baseEntityName === name),
      ),
    [current],
  );
  const getEntry = (name: string | undefined) =>
    name
      ? current?.entries.get(
          variants.find(variant => variant.name === name)?.baseEntityName ?? name,
        )
      : undefined;
  const forEntity = (name: string | undefined) => {
    const entry = getEntry(name);
    return {
      capabilities: entry?.capabilities,
      error: entry?.error,
      loading: Boolean(transport && name && !entry),
    };
  };
  const orderableFields = useMemo(
    () => (name: string) => {
      const base = variants.find(variant => variant.name === name)?.baseEntityName ?? name;
      return current?.entries.get(base)?.capabilities?.orderBy ?? [];
    },
    [current, variants],
  );
  return {
    route,
    variants,
    ...forEntity(entityName),
    forEntity,
    orderableFields,
    refresh: () => {
      setDiscovery(undefined);
      setRevision(value => value + 1);
    },
  };
};
