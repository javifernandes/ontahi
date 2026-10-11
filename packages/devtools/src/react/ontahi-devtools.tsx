'use client';

import type { GraphClientCache } from '@ontahi/core/data-graph';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import { useOntahiClientContext } from '@ontahi/react/graph';
import { useEffect, useMemo, useState } from 'react';

import type { OntahiDiagnostics } from '../diagnostics.js';
import { createEntityHistory } from '../entity-history.js';
import { getRuntimeTransportDiagnostics } from '../instrument-runtime-transport.js';

import type {
  OntahiDevtoolsConsoleConfiguration,
  OntahiDevtoolsConsoleOptions,
} from './console-panel.js';
import { DevtoolsPanel } from './devtools-panel.js';
import { styles } from './devtools-styles.js';
import { OntahiMark } from './ontahi-mark.js';
import { defaultDevtoolsPanelHeight } from './panel-resizer.js';

export type OntahiDevtoolsProps = {
  readonly clientCache?: GraphClientCache;
  readonly console?: OntahiDevtoolsConsoleConfiguration | false;
  readonly diagnostics?: OntahiDiagnostics;
  readonly initiallyOpen?: boolean;
  readonly runtimeTransport?: RuntimeTransport<any>;
};

export const OntahiDevtools = ({
  console,
  clientCache,
  diagnostics,
  initiallyOpen = false,
  runtimeTransport,
}: OntahiDevtoolsProps) => {
  const clientContext = useOntahiClientContext();
  const resolvedRuntimeTransport = runtimeTransport ?? clientContext?.runtimeTransport;
  const resolvedClientCache = clientCache ?? clientContext?.clientCache;
  const resolvedConsole = useMemo<OntahiDevtoolsConsoleOptions | undefined>(() => {
    if (console === false) return undefined;
    const entities = console?.entities ?? clientContext?.application?.entities;
    if (!entities) return undefined;
    return {
      ...console,
      entities,
      identity: console?.identity ?? clientContext?.identity,
    };
  }, [clientContext?.application?.entities, clientContext?.identity, console]);
  const resolvedDiagnostics =
    diagnostics ??
    (resolvedRuntimeTransport
      ? getRuntimeTransportDiagnostics(resolvedRuntimeTransport)
      : undefined);
  const history = useMemo(
    () => (resolvedClientCache ? createEntityHistory(resolvedClientCache) : undefined),
    [resolvedClientCache],
  );
  useEffect(() => () => history?.dispose(), [history]);
  const [open, setOpen] = useState(initiallyOpen);
  const [height, setHeight] = useState(defaultDevtoolsPanelHeight);
  if (!resolvedDiagnostics) return null;
  return open ? (
    <DevtoolsPanel
      history={history}
      clientCache={resolvedClientCache}
      consoleOptions={resolvedConsole}
      diagnostics={resolvedDiagnostics}
      runtimeTransport={resolvedRuntimeTransport}
      height={height}
      resize={setHeight}
      close={() => setOpen(false)}
    />
  ) : (
    <button
      type='button'
      style={styles.launcher}
      onClick={() => setOpen(true)}
      aria-label='Open Ontahí Devtools'
      title='Open Ontahí Devtools'
    >
      <OntahiMark />
    </button>
  );
};
