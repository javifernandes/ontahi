import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ExplorerCollapsibleSection, ExplorerSubsectionTitle } from '../../src/components/index.js';

afterEach(cleanup);

describe('ExplorerCollapsibleSection', () => {
  it('renders a titled details section with aside and description', () => {
    render(
      <ExplorerCollapsibleSection
        title='Payload'
        defaultOpen={false}
        summaryAside={<span>optional</span>}
        description={<p>Runtime payload shape</p>}
      >
        <span>Payload body</span>
      </ExplorerCollapsibleSection>,
    );

    expect(screen.getByText('Payload')).toBeTruthy();
    expect(screen.getByText('optional')).toBeTruthy();
    expect(screen.getByText('Runtime payload shape')).toBeTruthy();
    expect(screen.getByText('Payload body')).toBeTruthy();
    expect(screen.getByText('Payload').closest('details')?.open).toBe(false);
  });

  it('allows standalone subsection titles', () => {
    render(<ExplorerSubsectionTitle>Schema</ExplorerSubsectionTitle>);

    expect(screen.getByRole('heading', { name: 'Schema' })).toBeTruthy();
  });
});
