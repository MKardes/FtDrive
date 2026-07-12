import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileGrid } from '../src/components/FileGrid';
import { makeNode } from './factories';

describe('FileGrid', () => {
  it('renders each node name', () => {
    const nodes = [
      makeNode({ name: 'Photos', type: 'folder', size: null, mimeType: null }),
      makeNode({ name: 'cat.png', mimeType: 'image/png' }),
    ];
    render(<FileGrid nodes={nodes} onOpen={() => {}} />);
    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('cat.png')).toBeInTheDocument();
  });

  it('calls onOpen with the clicked node', async () => {
    const onOpen = vi.fn();
    const node = makeNode({ name: 'clickme.png', mimeType: 'image/png' });
    render(<FileGrid nodes={[node]} onOpen={onOpen} />);
    await userEvent.click(screen.getByTitle('clickme.png'));
    expect(onOpen).toHaveBeenCalledWith(node);
  });

  it('shows "Folder" for folders and a size for files', () => {
    const nodes = [
      makeNode({ name: 'Docs', type: 'folder', size: null, mimeType: null }),
      makeNode({ name: 'big.bin', size: 2048, mimeType: 'application/octet-stream' }),
    ];
    render(<FileGrid nodes={nodes} onOpen={() => {}} />);
    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('Enter and Space on the card call onOpen like a click (005: card is a div[role=button] now)', () => {
    const onOpen = vi.fn();
    const node = makeNode({ name: 'kbd.txt' });
    render(<FileGrid nodes={[node]} onOpen={onOpen} />);
    const card = screen.getByTitle('kbd.txt');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(node);
    onOpen.mockClear();
    fireEvent.keyDown(card, { key: ' ' });
    expect(onOpen).toHaveBeenCalledWith(node);
  });
});

describe('FileGrid — details menu (005-actions-menu-bulk-select, US1)', () => {
  function setup() {
    const onOpen = vi.fn();
    const onRename = vi.fn();
    const node = makeNode({ id: 'n1', name: 'a.txt', mimeType: 'text/plain' });
    render(
      <FileGrid
        nodes={[node]}
        onOpen={onOpen}
        renderMenuActions={(n) => (
          <button type="button" onClick={() => onRename(n)}>
            Rename
          </button>
        )}
        renderQuickAction={() => (
          <a href="#" onClick={(e) => e.preventDefault()}>
            Download
          </a>
        )}
      />,
    );
    return { onOpen, onRename, node };
  }

  it('shows exactly one details trigger and one quick action, no always-visible Rename button', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Details for a.txt' })).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  it('opening the details trigger reveals the menu actions', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Details for a.txt' }));
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('choosing a menu action invokes the same callback a dedicated button would', async () => {
    const { onRename, node } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Details for a.txt' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledWith(node);
  });

  it('clicking outside the open menu closes it without invoking onOpen', async () => {
    const { onOpen } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Details for a.txt' }));
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('pressing Escape closes an open menu', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Details for a.txt' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  it('opening a second card menu closes the first (only one open at a time)', async () => {
    const nodeA = makeNode({ id: 'a', name: 'a.txt' });
    const nodeB = makeNode({ id: 'b', name: 'b.txt' });
    render(
      <FileGrid
        nodes={[nodeA, nodeB]}
        onOpen={() => {}}
        renderMenuActions={(n) => <button type="button">Rename {n.name}</button>}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Details for a.txt' }));
    expect(screen.getByRole('button', { name: 'Rename a.txt' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Details for b.txt' }));
    expect(screen.queryByRole('button', { name: 'Rename a.txt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename b.txt' })).toBeInTheDocument();
  });

  it('clicking the details trigger does not also call onOpen', async () => {
    const { onOpen } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Details for a.txt' }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('FileGrid — select mode (005-actions-menu-bulk-select, US2)', () => {
  it('renders a checkbox reflecting selectedIds when selectMode is true', () => {
    const node = makeNode({ id: 'n1', name: 'a.txt' });
    render(
      <FileGrid
        nodes={[node]}
        onOpen={() => {}}
        selectMode
        selectedIds={new Set(['n1'])}
        onToggleSelect={() => {}}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Select a.txt' })).toBeChecked();
  });

  it('clicking a card in select mode toggles selection instead of opening it', async () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    const node = makeNode({ id: 'n1', name: 'a.txt' });
    render(
      <FileGrid nodes={[node]} onOpen={onOpen} selectMode selectedIds={new Set()} onToggleSelect={onToggleSelect} />,
    );
    await userEvent.click(screen.getByTitle('a.txt'));
    expect(onToggleSelect).toHaveBeenCalledWith('n1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('Enter/Space on a card in select mode toggles selection instead of opening it', () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    const node = makeNode({ id: 'n1', name: 'a.txt' });
    render(
      <FileGrid nodes={[node]} onOpen={onOpen} selectMode selectedIds={new Set()} onToggleSelect={onToggleSelect} />,
    );
    fireEvent.keyDown(screen.getByTitle('a.txt'), { key: 'Enter' });
    expect(onToggleSelect).toHaveBeenCalledWith('n1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('hides the details trigger and quick action while select mode is on', () => {
    const node = makeNode({ id: 'n1', name: 'a.txt', mimeType: 'text/plain' });
    render(
      <FileGrid
        nodes={[node]}
        onOpen={() => {}}
        renderMenuActions={() => <button type="button">Rename</button>}
        renderQuickAction={() => <span>Download</span>}
        selectMode
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Details for a.txt' })).not.toBeInTheDocument();
    expect(screen.queryByText('Download')).not.toBeInTheDocument();
  });

  it('clicking the checkbox toggles selection exactly once (no double-toggle via bubbling)', async () => {
    const onToggleSelect = vi.fn();
    const node = makeNode({ id: 'n1', name: 'a.txt' });
    render(
      <FileGrid nodes={[node]} onOpen={() => {}} selectMode selectedIds={new Set()} onToggleSelect={onToggleSelect} />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select a.txt' }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });
});
