import { authoringDialectPreference } from '@ontahi/language-codemirror';
import { useSyncExternalStore } from 'react';

import { transportSettingsStyles as styles } from './transport-settings-styles.js';

export const AuthoringSettings = () => {
  const dialect =
    useSyncExternalStore(
      authoringDialectPreference.subscribe,
      authoringDialectPreference.getSnapshot,
      authoringDialectPreference.getServerSnapshot,
    ) ?? 'ts';
  return (
    <section aria-label='Language preferences' style={{ ...styles.root, marginBottom: 24 }}>
      <h3 style={styles.title}>Authoring language</h3>
      <label style={{ color: '#dce8e1', display: 'flex', alignItems: 'center', gap: 12 }}>
        Preferred dialect
        <select
          value={dialect}
          style={{
            color: '#effbf4',
            background: '#13231b',
            border: '1px solid #46745c',
            borderRadius: 6,
            padding: 6,
          }}
          onChange={event =>
            authoringDialectPreference.set(
              event.target.value === 'declarative' ? 'declarative' : 'ts',
            )
          }
        >
          <option value='ts'>TS-like</option>
          <option value='declarative'>Declarative</option>
        </select>
      </label>
      <p style={{ ...styles.description, color: '#b6c8be' }}>
        Shared by Ontahí authoring editors on this browser origin. Valid Console drafts convert
        without running; invalid drafts stay untouched. The Console switch is a local override.
        Explorer predicates use the same syntax in both dialects; plain-text searches stay plain
        text.
      </p>
    </section>
  );
};
