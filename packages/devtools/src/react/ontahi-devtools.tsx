'use client';

import type { GraphClientCache } from '@ontahi/core/data-graph';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import { useState } from 'react';

import type { OntahiDiagnostics } from '../diagnostics.js';

import type { OntahiDevtoolsConsoleOptions } from './console-panel.js';
import { DevtoolsPanel } from './devtools-panel.js';
import { styles } from './devtools-styles.js';
import { OntahiMark } from './ontahi-mark.js';
import { defaultDevtoolsPanelHeight } from './panel-resizer.js';

export type OntahiDevtoolsProps = {
  readonly clientCache?: GraphClientCache;
  readonly console?: OntahiDevtoolsConsoleOptions;
  readonly diagnostics: OntahiDiagnostics;
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
  const [open, setOpen] = useState(initiallyOpen);
  const [height, setHeight] = useState(defaultDevtoolsPanelHeight);
  return open ? (
    <DevtoolsPanel
      clientCache={clientCache}
      consoleOptions={console}
      diagnostics={diagnostics}
      runtimeTransport={runtimeTransport}
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
