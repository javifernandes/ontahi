import type { GraphClientCache } from '@ontahi/core/data-graph';
import { useMemo, useState, useSyncExternalStore } from 'react';

import { cloneDiagnosticValue } from '../diagnostics.js';

import { createCacheStore, outputEntityKeys } from './cache-model.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';

const ConnectedCachePanel = ({ cache }: { readonly cache: GraphClientCache }) => {
  const store = useMemo(() => createCacheStore(cache), [cache]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [kind, setKind] = useState<'entities' | 'outputs'>('entities');
  const [section, setSection] = useState<'data' | 'references' | 'aliases'>('data');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string>();
  const outputLinks = useMemo(
    () =>
      new Map(
        snapshot.outputs.map(output => [output.keyHash, outputEntityKeys(output.value, snapshot)]),
      ),
    [snapshot],
  );
  const entries =
    kind === 'entities'
      ? snapshot.records.map(record => ({ key: record.key, title: record.key, record }))
      : snapshot.outputs.map(record => ({ key: record.keyHash, title: record.keyHash, record }));
  const search = filter.trim().toLowerCase();
  const filtered = entries.filter(entry =>
    `${entry.title} ${'aliases' in entry.record ? JSON.stringify(entry.record.aliases) : ''}`
      .toLowerCase()
      .includes(search),
  );
  const active = filtered.find(entry => entry.key === selected) ?? filtered[0];
  const related = active
    ? kind === 'entities'
      ? snapshot.outputs
          .filter(output => outputLinks.get(output.keyHash)?.has(active.key))
          .map(output => ({ key: output.keyHash, title: output.keyHash, value: output.key }))
      : snapshot.records
          .filter(record => outputLinks.get(active.key)?.has(record.key))
          .map(record => ({ key: record.key, title: record.key, value: record.ref }))
    : [];
  const navigate = (nextKind: typeof kind, key?: string) => {
    setSection('data');
    setKind(nextKind);
    setSelected(key);
    setFilter('');
  };
  return (
    <div style={styles.workspace}>
      <section style={styles.sidebar} aria-label='Local runtime state'>
        <div style={styles.filterBar}>
          <nav aria-label='Cache collections' style={{ ...styles.views, marginBottom: 8 }}>
            <button
              type='button'
              style={{ ...styles.view, ...(kind === 'entities' ? styles.activeView : {}) }}
              aria-pressed={kind === 'entities'}
              onClick={() => navigate('entities')}
            >
              Entities <span style={styles.count}>{snapshot.records.length}</span>
            </button>
            <button
              type='button'
              style={{ ...styles.view, ...(kind === 'outputs' ? styles.activeView : {}) }}
              aria-pressed={kind === 'outputs'}
              onClick={() => navigate('outputs')}
            >
              Outputs <span style={styles.count}>{snapshot.outputs.length}</span>
            </button>
          </nav>
          <input
            type='search'
            aria-label='Filter cache'
            placeholder='Filter entity, identity, alias, output key…'
            style={styles.filter}
            value={filter}
            onChange={event => setFilter(event.currentTarget.value)}
          />
        </div>
        <ul style={styles.list} aria-label='Cache entries'>
          {filtered.map(entry => (
            <li key={entry.key}>
              <button
                type='button'
                aria-pressed={active?.key === entry.key}
                onClick={() => {
                  setSelected(entry.key);
                  setSection('data');
                }}
                style={{
                  ...styles.row,
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  ...(active?.key === entry.key ? styles.selectedRow : {}),
                }}
              >
                <span style={styles.rowTitle} title={entry.title}>
                  {entry.title}
                </span>
                <span style={styles.rowMeta}>
                  {'aliases' in entry.record
                    ? `${entry.record.aliases.length} aliases`
                    : `${outputLinks.get(entry.key)?.size ?? 0} entity references`}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li style={styles.empty}>
              {search ? 'No matching cache entries.' : `No cached ${kind} yet.`}
            </li>
          ) : null}
        </ul>
      </section>
      {active ? (
        <section style={styles.detail} aria-label='Selected cache entry'>
          <header style={styles.detailHeader}>
            <div style={{ ...styles.detailHeadingGroup, flex: 1 }}>
              <h3 style={styles.detailTitle} title={active.title}>
                {active.title}
              </h3>
              <span style={styles.detailMeta}>
                Cached at {new Date(active.record.cachedAt).toISOString()}
              </span>
            </div>
            <nav
              aria-label='Cache detail sections'
              style={{ ...styles.views, marginLeft: 'auto', flexShrink: 0 }}
            >
              {(
                [
                  'data',
                  'references',
                  ...('aliases' in active.record ? (['aliases'] as const) : []),
                ] as const
              ).map(name => (
                <button
                  key={name}
                  type='button'
                  style={{ ...styles.view, ...(section === name ? styles.activeView : {}) }}
                  aria-pressed={section === name}
                  onClick={() => setSection(name)}
                >
                  {name === 'data' ? 'Data' : name === 'references' ? 'References' : 'Aliases'}
                </button>
              ))}
            </nav>
          </header>
          <div style={{ overflow: 'auto', padding: 16 }}>
            {section === 'data' || (section === 'aliases' && !('aliases' in active.record)) ? (
              <>
                <h4>{kind === 'entities' ? 'Present fields' : 'Normalized output'}</h4>
                <JsonView value={cloneDiagnosticValue(active.record.value)} label='Cached value' />
              </>
            ) : null}
            {section === 'references' ? (
              <>
                <h4>{kind === 'entities' ? 'Referenced by outputs' : 'Referenced entities'}</h4>
                {related.length ? (
                  <ul style={{ ...styles.list, padding: 0, display: 'grid', gap: 12 }}>
                    {related.map((entry, index) => (
                      <li
                        key={entry.key}
                        style={{ border: '1px solid #293d32', borderRadius: 9, overflow: 'hidden' }}
                      >
                        <header
                          style={{ ...styles.payloadHeader, justifyContent: 'space-between' }}
                        >
                          <span style={styles.rowTitle}>
                            {kind === 'entities' ? `Output ${index + 1}` : entry.title}
                          </span>
                          <button
                            type='button'
                            style={styles.subtleButton}
                            aria-label={
                              kind === 'entities'
                                ? `Open output ${index + 1}`
                                : `Open ${entry.title}`
                            }
                            onClick={() =>
                              navigate(kind === 'entities' ? 'outputs' : 'entities', entry.key)
                            }
                          >
                            {kind === 'entities' ? 'Open output' : 'Open entity'}
                          </button>
                        </header>
                        <div style={{ padding: 12 }}>
                          <JsonView
                            value={cloneDiagnosticValue(entry.value)}
                            label={
                              kind === 'entities'
                                ? `Output ${index + 1} key`
                                : `${entry.title} reference`
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No cached{' '}
                    {kind === 'entities'
                      ? 'outputs reference this identity'
                      : 'entities resolve these references'}
                    .
                  </p>
                )}
                <p style={{ color: '#80978b' }}>
                  These links describe cached references. Active hook observers and write history
                  are not tracked here.
                </p>
              </>
            ) : null}
            {section === 'aliases' && 'aliases' in active.record ? (
              <>
                <h4>Identity, aliases and freshness</h4>
                <JsonView
                  value={{
                    ref: active.record.ref,
                    aliases: active.record.aliases,
                    freshnessAt: active.record.freshnessAt,
                    freshnessVersion: active.record.freshnessVersion,
                    freshnessHash: active.record.freshnessHash,
                  }}
                  label='Cache metadata'
                />
              </>
            ) : null}
          </div>
        </section>
      ) : (
        <div style={styles.empty}>Select an entry to inspect local runtime state.</div>
      )}
    </div>
  );
};

export const CachePanel = ({ clientCache }: { readonly clientCache?: GraphClientCache }) =>
  clientCache ? (
    <ConnectedCachePanel cache={clientCache} />
  ) : (
    <div style={styles.empty}>
      No client cache connected. Pass the application’s clientCache to OntahiDevtools to inspect
      local runtime state.
    </div>
  );
