export const explorerEntityBrowserTabs = ['structure', 'operations', 'data'] as const;
export const explorerOperationDetailTabs = ['execute', 'schema', 'ingress', 'metadata'] as const;
export const explorerOperationBrowserTabs = explorerOperationDetailTabs;
export const explorerTaskBrowserTabs = ['structure', 'runs'] as const;

export type ExplorerEntityBrowserTab = (typeof explorerEntityBrowserTabs)[number];
export type ExplorerOperationDetailTab = (typeof explorerOperationDetailTabs)[number];
export type ExplorerOperationBrowserTab = ExplorerOperationDetailTab;
export type ExplorerTaskBrowserTab = (typeof explorerTaskBrowserTabs)[number];

export type ExplorerTabHrefOptions<TTab extends string> = {
  tab?: TTab;
};

export type ExplorerEntityHrefOptions = ExplorerTabHrefOptions<ExplorerEntityBrowserTab> & {
  ref?: Record<string, unknown>;
};

export type ExplorerRoutes = {
  overview: string;
  entities: string;
  operations: string;
  tasks: string;
  events: string;
  entity: (entityName: string, options?: ExplorerEntityHrefOptions) => string;
  operation: (
    operationId: string,
    options?: ExplorerTabHrefOptions<ExplorerOperationBrowserTab>,
  ) => string;
  task: (taskId: string, options?: ExplorerTabHrefOptions<ExplorerTaskBrowserTab>) => string;
  event: (eventType: string) => string;
};

export const normalizeExplorerBasePath = (basePath: string) => {
  const trimmed = basePath.trim();

  if (!trimmed || trimmed === '/') {
    return '';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
};

const joinExplorerPath = (basePath: string, collection: string, id: string) =>
  `${basePath}/${collection}/${encodeURIComponent(id)}`;

const getExplorerCollectionPath = (basePath: string, collection: string) =>
  `${basePath}/${collection}`;

const withExplorerTab = <TTab extends string>(
  href: string,
  options?: ExplorerTabHrefOptions<TTab>,
) => (options?.tab ? `${href}?tab=${encodeURIComponent(options.tab)}` : href);

const withExplorerEntityOptions = (href: string, options?: ExplorerEntityHrefOptions) => {
  const search = new URLSearchParams();
  if (options?.tab) search.set('tab', options.tab);
  if (options?.ref) search.set('ref', JSON.stringify(options.ref));
  const query = search.toString();

  return query ? `${href}?${query}` : href;
};

export const createExplorerRoutes = (basePath = ''): ExplorerRoutes => {
  const normalizedBasePath = normalizeExplorerBasePath(basePath);

  return {
    overview: normalizedBasePath || '/',
    entities: getExplorerCollectionPath(normalizedBasePath, 'entities'),
    operations: getExplorerCollectionPath(normalizedBasePath, 'operations'),
    tasks: getExplorerCollectionPath(normalizedBasePath, 'tasks'),
    events: getExplorerCollectionPath(normalizedBasePath, 'events'),
    entity: (entityName, options) =>
      withExplorerEntityOptions(
        joinExplorerPath(normalizedBasePath, 'entities', entityName),
        options,
      ),
    operation: (operationId, options) =>
      withExplorerTab(joinExplorerPath(normalizedBasePath, 'operations', operationId), options),
    task: (taskId, options) =>
      withExplorerTab(joinExplorerPath(normalizedBasePath, 'tasks', taskId), options),
    event: eventType => joinExplorerPath(normalizedBasePath, 'events', eventType),
  };
};

const isOneOf = <TValue extends string>(
  values: readonly TValue[],
  value: string | undefined,
): value is TValue => values.some(candidate => candidate === value);

export const isExplorerEntityBrowserTab = (
  value: string | undefined,
): value is ExplorerEntityBrowserTab => isOneOf(explorerEntityBrowserTabs, value);

export const isExplorerOperationBrowserTab = (
  value: string | undefined,
): value is ExplorerOperationBrowserTab => isOneOf(explorerOperationBrowserTabs, value);

export const isExplorerTaskBrowserTab = (
  value: string | undefined,
): value is ExplorerTaskBrowserTab => isOneOf(explorerTaskBrowserTabs, value);

export const parseExplorerEntityBrowserTab = (
  value: string | undefined,
  options: { canShowData?: boolean } = {},
): ExplorerEntityBrowserTab => {
  if (isExplorerEntityBrowserTab(value) && (value !== 'data' || options.canShowData !== false)) {
    return value;
  }

  return options.canShowData === true ? 'data' : 'structure';
};

export const parseExplorerOperationBrowserTab = (
  value: string | undefined,
  options: { hasExecutePanel?: boolean } = {},
): ExplorerOperationBrowserTab => {
  if (
    isExplorerOperationBrowserTab(value) &&
    (value !== 'execute' || options.hasExecutePanel !== false)
  ) {
    return value;
  }

  return options.hasExecutePanel === false ? 'schema' : 'execute';
};

export const parseExplorerTaskBrowserTab = (value: string | undefined): ExplorerTaskBrowserTab =>
  isExplorerTaskBrowserTab(value) ? value : 'structure';

export const getExplorerTabFromSearch = (search: string) =>
  new URLSearchParams(search).get('tab') ?? undefined;
