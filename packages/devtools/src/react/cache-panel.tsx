import type { AnyEntityDefinition, GraphClientCache } from '@ontahi/core/data-graph';
import { useContext, useMemo, useState, useSyncExternalStore } from 'react';

import { cloneDiagnosticValue } from '../diagnostics.js';
import type { EntityHistory } from '../entity-history.js';

import { AuthoringDialectContext } from './authoring-dialect.js';
import {
  cachedEntityLabel,
  createCacheStore,
  entityReferenceLinks,
  outputEntityKeys,
} from './cache-model.js';
import { presentCacheOutput } from './cache-output-presentation.js';
import { styles } from './devtools-styles.js';
import { EntityHistoryPanel } from './entity-history-panel.js';
import { JsonView } from './json-view.js';

const ConnectedCachePanel = ({
  cache,
  entities,
}: {
  readonly cache: GraphClientCache;
  readonly entities?: readonly AnyEntityDefinition[];
}) => {
  const dialect = useContext(AuthoringDialectContext);
  const store = useMemo(() => createCacheStore(cache), [cache]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [kind, setKind] = useState<'entities' | 'outputs'>('entities');
  const [section, setSection] = useState<'data' | 'references' | 'aliases'>('data');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string>();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [trail, setTrail] = useState<
    {
      kind: typeof kind;
      key?: string;
      section: typeof section;
      filter: string;
    }[]
  >([]);
  const outputLinks = useMemo(
    () =>
      new Map(
        snapshot.outputs.map(output => [output.keyHash, outputEntityKeys(output.value, snapshot)]),
      ),
    [snapshot],
  );
  const entries =
    kind === 'entities'
      ? snapshot.records.map(record => ({
          key: record.key,
          title: cachedEntityLabel(record.value) ?? record.key,
          detail: cachedEntityLabel(record.value) ? record.key : undefined,
          scope: undefined,
          record,
        }))
      : snapshot.outputs.map(record => ({
          key: record.keyHash,
          ...presentCacheOutput(record, dialect),
          record,
        }));
  const search = filter.trim().toLowerCase();
  const filtered = entries.filter(entry =>
    `${entry.title} ${entry.detail ?? ''} ${entry.scope ?? ''} ${entry.key} ${'aliases' in entry.record ? JSON.stringify(entry.record.aliases) : ''}`
      .toLowerCase()
      .includes(search),
  );
  const active = filtered.find(entry => entry.key === selected) ?? filtered[0];
  const related = active
    ? kind === 'entities'
      ? snapshot.outputs
          .filter(output => outputLinks.get(output.keyHash)?.has(active.key))
          .map(output => ({
            key: output.keyHash,
            ...presentCacheOutput(output, dialect),
            value: output.key,
          }))
      : snapshot.records
          .filter(record => outputLinks.get(active.key)?.has(record.key))
          .map(record => ({
            key: record.key,
            title: record.key,
            detail: undefined,
            scope: undefined,
            value: record.ref,
          }))
    : [];
  const groups = new Map<string, typeof filtered>();
  for (const entry of filtered) {
    const name = 'aliases' in entry.record ? entry.record.ref.entityName : '';
    const group = groups.get(name);
    if (group) group.push(entry);
    else groups.set(name, [entry]);
  }
  const activeEntityName =
    active && 'aliases' in active.record ? active.record.ref.entityName : undefined;
  const relationships =
    active && 'aliases' in active.record
      ? entityReferenceLinks(
          active.record.value,
          snapshot,
          entities?.find(entity => entity.name === activeEntityName),
        )
      : [];
  const navigate = (nextKind: typeof kind, key?: string) => {
    if (active) setTrail(previous => [...previous, { kind, key: active.key, section, filter }]);
    const target = snapshot.records.find(record => record.key === key);
    if (target)
      setCollapsed(previous => {
        const next = new Set(previous);
        next.delete(target.ref.entityName);
        return next;
      });
    setSection('data');
    setKind(nextKind);
    setSelected(key);
    setFilter('');
  };
  const renderEntry = (entry: (typeof entries)[number]) => (
    <li key={entry.key}>
      <button
        type='button'
        aria-pressed={active?.key === entry.key}
        onClick={() => navigate(kind, entry.key)}
        style={{
          ...styles.row,
          gridTemplateColumns: 'minmax(0, 1fr)',
          ...(active?.key === entry.key ? styles.selectedRow : {}),
        }}
      >
        <span style={styles.rowTitle} title={entry.title}>
          {entry.title}
        </span>
        {entry.detail ? (
          <span style={styles.rowMeta} title={entry.detail}>
            {entry.detail}
          </span>
        ) : null}
        {entry.scope ? (
          <span style={{ ...styles.family, overflowWrap: 'anywhere' }}>{entry.scope}</span>
        ) : null}
        {!('aliases' in entry.record) ? (
          <span style={styles.rowMeta}>
            {outputLinks.get(entry.key)?.size ?? 0} entity references
          </span>
        ) : null}
      </button>
    </li>
  );
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
          {[...groups]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, groupEntries]) => (
              <li key={name}>
                {kind === 'entities' ? (
                  <details open={Boolean(search) || !collapsed.has(name)}>
                    <summary
                      style={{
                        ...styles.rowMeta,
                        cursor: 'pointer',
                        padding: '12px 8px',
                        color: '#c7ddd1',
                        fontWeight: 800,
                        listStyle: 'none',
                      }}
                      onClick={event => {
                        event.preventDefault();
                        if (search) return;
                        setCollapsed(previous => {
                          const next = new Set(previous);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        });
                      }}
                    >
                      <span aria-hidden='true' style={{ marginRight: 7 }}>
                        {search || !collapsed.has(name) ? '▾' : '▸'}
                      </span>
                      {name} <span style={styles.count}>{groupEntries.length}</span>
                    </summary>
                    <ul
                      style={{ ...styles.list, padding: '0 0 0 10px' }}
                      aria-label={`${name} instances`}
                    >
                      {groupEntries.map(renderEntry)}
                    </ul>
                  </details>
                ) : (
                  <ul style={{ ...styles.list, padding: 0 }}>{groupEntries.map(renderEntry)}</ul>
                )}
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
            {trail.length ? (
              <button
                type='button'
                style={styles.subtleButton}
                onClick={() => {
                  const previous = trail[trail.length - 1];
                  setTrail(items => items.slice(0, -1));
                  setKind(previous.kind);
                  setSelected(previous.key);
                  setSection(previous.section);
                  setFilter(previous.filter);
                }}
              >
                ← Back
              </button>
            ) : null}
            <div style={{ ...styles.detailHeadingGroup, flex: 1 }}>
              <h3 style={styles.detailTitle} title={active.title}>
                {active.title}
              </h3>
              {active.detail ? (
                <span style={styles.rowTitle} title={active.detail}>
                  {active.detail}
                </span>
              ) : null}
              {active.scope ? <span style={styles.family}>{active.scope}</span> : null}
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
                {!('aliases' in active.record) ? (
                  <details>
                    <summary style={{ cursor: 'pointer' }}>Cache key / JSON</summary>
                    <JsonView value={cloneDiagnosticValue(active.record.key)} label='Cache key' />
                  </details>
                ) : null}
                {kind === 'entities' ? (
                  <>
                    <h4>Relationships</h4>
                    {relationships.length ? (
                      <ul
                        style={{ ...styles.list, padding: 0, display: 'grid', gap: 6 }}
                        aria-label='Entity relationships'
                      >
                        {relationships.map(link => {
                          const target = snapshot.records.find(record => record.key === link.key);
                          return (
                            <li key={link.path}>
                              <button
                                type='button'
                                style={{
                                  ...styles.row,
                                  gridTemplateColumns: 'minmax(0, 1fr)',
                                  border: '1px solid #293d32',
                                  background: '#101c15',
                                  ...(!target ? styles.disabledButton : {}),
                                }}
                                disabled={!target}
                                onClick={() => navigate('entities', link.key)}
                              >
                                <span style={styles.rowTitle}>
                                  {link.path} →{' '}
                                  {target
                                    ? (cachedEntityLabel(target.value) ?? target.ref.entityName)
                                    : link.key}
                                </span>
                                <span style={styles.rowMeta}>
                                  {target ? link.key : 'Not in cache'}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p style={styles.rowMeta}>No cached entity references in present fields.</p>
                    )}
                  </>
                ) : null}
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
                          <span style={styles.rowTitle}>{entry.title}</span>
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
                          {entry.detail ? (
                            <p style={{ margin: '0 0 8px' }}>{entry.detail}</p>
                          ) : null}
                          {entry.scope ? <p style={styles.family}>{entry.scope}</p> : null}
                          <details>
                            <summary style={{ cursor: 'pointer' }}>
                              {kind === 'entities' ? 'Cache key / JSON' : 'Reference / JSON'}
                            </summary>
                            <JsonView
                              value={cloneDiagnosticValue(entry.value)}
                              label={
                                kind === 'entities'
                                  ? `Output ${index + 1} key`
                                  : `${entry.title} reference`
                              }
                            />
                          </details>
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

export const CachePanel = ({
  clientCache,
  history,
  entities,
}: {
  readonly clientCache?: GraphClientCache;
  readonly entities?: readonly AnyEntityDefinition[];
  readonly history?: EntityHistory;
}) => {
  const [view, setView] = useState<'live' | 'history'>('live');
  return (
    <div
      style={{
        display: 'grid',
        minHeight: 0,
        gridTemplateRows: history ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
      }}
    >
      {history ? (
        <nav
          aria-label='Cache time views'
          style={{ ...styles.views, padding: '6px 12px', borderBottom: '1px solid #213229' }}
        >
          <button
            type='button'
            style={{ ...styles.view, ...(view === 'live' ? styles.activeView : {}) }}
            aria-pressed={view === 'live'}
            onClick={() => setView('live')}
          >
            Live state
          </button>
          <button
            type='button'
            style={{ ...styles.view, ...(view === 'history' ? styles.activeView : {}) }}
            aria-pressed={view === 'history'}
            onClick={() => setView('history')}
          >
            History
          </button>
        </nav>
      ) : null}
      {view === 'history' && history ? (
        <EntityHistoryPanel history={history} />
      ) : clientCache ? (
        <ConnectedCachePanel entities={entities} cache={clientCache} />
      ) : (
        <div style={styles.empty}>
          No client cache connected. Pass the application’s clientCache to OntahiDevtools to inspect
          local runtime state.
        </div>
      )}
    </div>
  );
};
