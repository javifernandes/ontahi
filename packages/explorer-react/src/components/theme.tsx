'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ExplorerThemePreference = 'light' | 'dark' | 'system';
export type ExplorerResolvedTheme = 'light' | 'dark';
export type ExplorerMonacoTheme = 'vs' | 'vs-dark';

export type ExplorerThemeState = {
  theme: ExplorerThemePreference;
  resolvedTheme: ExplorerResolvedTheme;
  monacoTheme: ExplorerMonacoTheme;
};

type ExplorerThemeContextValue = {
  theme: ExplorerThemePreference;
};

export type ExplorerThemeProviderProps = {
  children: ReactNode;
  theme?: ExplorerThemePreference;
};

const ExplorerThemeContext = createContext<ExplorerThemeContextValue | null>(null);

const getPrefersDark = () =>
  typeof globalThis.matchMedia === 'function' &&
  globalThis.matchMedia('(prefers-color-scheme: dark)').matches;

export const resolveExplorerTheme = (
  theme: ExplorerThemePreference,
  prefersDark = getPrefersDark(),
): ExplorerResolvedTheme => {
  if (theme === 'system') {
    return prefersDark ? 'dark' : 'light';
  }

  return theme;
};

const getMonacoTheme = (theme: ExplorerResolvedTheme): ExplorerMonacoTheme =>
  theme === 'dark' ? 'vs-dark' : 'vs';

export function ExplorerThemeProvider({ children, theme = 'system' }: ExplorerThemeProviderProps) {
  const value = useMemo(() => ({ theme }), [theme]);

  return <ExplorerThemeContext.Provider value={value}>{children}</ExplorerThemeContext.Provider>;
}

export function useExplorerTheme(themeOverride?: ExplorerThemePreference): ExplorerThemeState {
  const context = useContext(ExplorerThemeContext);
  const theme = themeOverride ?? context?.theme ?? 'system';
  const [resolvedTheme, setResolvedTheme] = useState<ExplorerResolvedTheme>(() =>
    resolveExplorerTheme(theme),
  );

  useEffect(() => {
    if (theme !== 'system') {
      setResolvedTheme(theme);
      return;
    }

    if (typeof globalThis.matchMedia !== 'function') {
      setResolvedTheme('light');
      return;
    }

    const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const updateResolvedTheme = () => {
      setResolvedTheme(resolveExplorerTheme('system', mediaQuery.matches));
    };

    updateResolvedTheme();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateResolvedTheme);
      return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
    }

    mediaQuery.addListener(updateResolvedTheme);
    return () => mediaQuery.removeListener(updateResolvedTheme);
  }, [theme]);

  return useMemo(
    () => ({
      theme,
      resolvedTheme,
      monacoTheme: getMonacoTheme(resolvedTheme),
    }),
    [resolvedTheme, theme],
  );
}
