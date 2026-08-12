'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { ExplorerTaskRunSourceLoader } from '../contracts/index.js';

import { createExplorerRoutes, normalizeExplorerBasePath, type ExplorerRoutes } from './routes.js';
import { ExplorerThemeProvider, type ExplorerThemePreference } from './theme.js';

export type ExplorerConfig = {
  basePath: string;
  routes: ExplorerRoutes;
  loadTaskRunSource?: ExplorerTaskRunSourceLoader;
};

export type ExplorerProviderProps = {
  children: ReactNode;
  basePath?: string;
  theme?: ExplorerThemePreference;
  loadTaskRunSource?: ExplorerTaskRunSourceLoader;
};

const defaultExplorerConfig: ExplorerConfig = {
  basePath: '',
  routes: createExplorerRoutes(),
};

const ExplorerConfigContext = createContext<ExplorerConfig>(defaultExplorerConfig);

export function ExplorerProvider({
  children,
  basePath = '',
  loadTaskRunSource,
  theme = 'system',
}: ExplorerProviderProps) {
  const config = useMemo<ExplorerConfig>(() => {
    const normalizedBasePath = normalizeExplorerBasePath(basePath);

    return {
      basePath: normalizedBasePath,
      routes: createExplorerRoutes(normalizedBasePath),
      loadTaskRunSource,
    };
  }, [basePath, loadTaskRunSource]);

  return (
    <ExplorerConfigContext.Provider value={config}>
      <ExplorerThemeProvider theme={theme}>{children}</ExplorerThemeProvider>
    </ExplorerConfigContext.Provider>
  );
}

export const useExplorerConfig = () => useContext(ExplorerConfigContext);

export const useExplorerRoutes = () => useExplorerConfig().routes;
