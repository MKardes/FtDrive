import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
