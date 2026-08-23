import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplorerJsonEditor, ExplorerThemeProvider } from './index.js';

type MockEditorProps = {
  value: string;
  language?: string;
  path?: string;
  theme?: string;
  options?: {
    readOnly?: boolean;
  };
  onChange?: (value?: string) => void;
};

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, language, path, theme, options, onChange }: MockEditorProps) => (
    <textarea
      aria-label={path ?? 'Explorer editor'}
      data-language={language}
      data-theme={theme}
      readOnly={options?.readOnly}
      value={value}
      onChange={event => onChange?.(event.target.value)}
    />
  ),
}));

afterEach(cleanup);

describe('ExplorerJsonEditor', () => {
  it('renders Monaco with the Explorer theme provider', () => {
    render(
      <ExplorerThemeProvider theme='dark'>
        <ExplorerJsonEditor label='Input' value='{"ok":true}' path='explorer://input.json' />
      </ExplorerThemeProvider>,
    );

    const editor = screen.getByLabelText('explorer://input.json');
    expect(screen.getByText('Input')).toBeTruthy();
    expect(screen.getByText('JSON')).toBeTruthy();
    expect(editor.getAttribute('data-theme')).toBe('vs-dark');
    expect(editor.getAttribute('data-language')).toBe('json');
  });

  it('allows a local theme override and propagates changes', () => {
    const handleChange = vi.fn();

    render(
      <ExplorerThemeProvider theme='dark'>
        <ExplorerJsonEditor
          label='Draft'
          value='{}'
          path='explorer://draft.json'
          theme='light'
          onChange={handleChange}
        />
      </ExplorerThemeProvider>,
    );

    const editor = screen.getByLabelText('explorer://draft.json');
    expect(editor.getAttribute('data-theme')).toBe('vs');

    fireEvent.change(editor, { target: { value: '{"next":true}' } });

    expect(handleChange).toHaveBeenCalledWith('{"next":true}');
  });
});
