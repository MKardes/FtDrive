import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Thumbnail } from '../src/components/Thumbnail';
import { makeNode } from './factories';

describe('Thumbnail', () => {
  it('requests a thumbnail image for media files', () => {
    const node = makeNode({ id: 'abc', name: 'pic.jpg', mimeType: 'image/jpeg', thumbStatus: 'ready' });
    const { container } = render(<Thumbnail node={node} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/files/abc/thumbnail');
  });

  it('shows an icon (no image) for folders', () => {
    const node = makeNode({ name: 'Folder', type: 'folder', size: null, mimeType: null });
    const { container } = render(<Thumbnail node={node} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('📁')).toBeInTheDocument();
  });

  it('shows an icon for unsupported thumbnails', () => {
    const node = makeNode({ name: 'doc.txt', mimeType: 'text/plain', thumbStatus: 'unsupported' });
    const { container } = render(<Thumbnail node={node} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
