import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
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

  it('shows an SVG icon (no image, no emoji) for folders (007, SC-007)', () => {
    const node = makeNode({ name: 'Folder', type: 'folder', size: null, mimeType: null });
    const { container } = render(<Thumbnail node={node} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg.icon')).not.toBeNull();
    expect(container.textContent).not.toMatch(/📁/u);
  });

  it('shows an SVG icon for unsupported thumbnails', () => {
    const node = makeNode({ name: 'doc.txt', mimeType: 'text/plain', thumbStatus: 'unsupported' });
    const { container } = render(<Thumbnail node={node} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg.icon')).not.toBeNull();
  });
});
