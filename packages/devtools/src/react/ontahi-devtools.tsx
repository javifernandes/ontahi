'use client';

import { useState, type ReactNode } from 'react';

import type { OntahiDiagnostics } from '../diagnostics.js';

import { DevtoolsPanel } from './devtools-panel.js';
import { styles } from './devtools-styles.js';
import { OntahiMark } from './ontahi-mark.js';

export type OntahiDevtoolsProps = {
  readonly diagnostics: OntahiDiagnostics;
  readonly initiallyOpen?: boolean;
  readonly settings?: ReactNode;
};

export const OntahiDevtools = ({
  diagnostics,
  initiallyOpen = false,
  settings,
}: OntahiDevtoolsProps) => {
  const [open, setOpen] = useState(initiallyOpen);
  return open ? (
    <DevtoolsPanel diagnostics={diagnostics} settings={settings} close={() => setOpen(false)} />
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
