'use client';

import { Editor } from '@monaco-editor/react';

import { cx } from '../internal/cx.js';

import { useExplorerTheme, type ExplorerThemePreference } from './theme.js';

export type ExplorerJsonEditorProps = {
  label: string;
  value: string;
  height?: string;
  language?: 'json' | 'typescript';
  readOnly?: boolean;
  className?: string;
  showHeader?: boolean;
  path?: string;
  theme?: ExplorerThemePreference;
  onChange?: (value: string) => void;
};

export function ExplorerJsonEditor({
  label,
  value,
  height = '260px',
  language = 'json',
  readOnly = false,
  className,
  showHeader = true,
  path,
  theme,
  onChange,
}: ExplorerJsonEditorProps) {
  const explorerTheme = useExplorerTheme(theme);

  return (
    <div className={cx('overflow-hidden rounded-md border bg-background', className)}>
      {showHeader ? (
        <div className='flex min-h-9 items-center justify-between border-b bg-muted/35 px-3'>
          <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            {label}
          </span>
          <span className='text-xs text-muted-foreground'>
            {language === 'json' ? 'JSON' : 'Expression'}
          </span>
        </div>
      ) : null}
      <Editor
        height={height}
        defaultLanguage={language}
        language={language}
        path={path}
        value={value}
        theme={explorerTheme.monacoTheme}
        onChange={(nextValue: string | undefined) => onChange?.(nextValue ?? '')}
        options={{
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          folding: true,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 12,
          formatOnPaste: true,
          formatOnType: true,
          glyphMargin: false,
          lineDecorationsWidth: 8,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: { top: 12, bottom: 12 },
          readOnly,
          renderLineHighlight: readOnly ? 'none' : 'line',
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'on',
        }}
      />
    </div>
  );
}
