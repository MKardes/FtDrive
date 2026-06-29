import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhotoViewer } from '../src/components/PhotoViewer';
import { VideoPlayer } from '../src/components/VideoPlayer';
import { Preview } from '../src/components/Preview';
import { makeNode } from './factories';

describe('PhotoViewer', () => {
  it('renders the photo from the content endpoint and closes on Escape', () => {
    const node = makeNode({ id: 'p1', name: 'a.jpg', mimeType: 'image/jpeg' });
    const onClose = vi.fn();
    render(<PhotoViewer node={node} onClose={onClose} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/api/files/p1/content');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('VideoPlayer', () => {
  it('renders a video element from the content endpoint', () => {
    const node = makeNode({ id: 'v1', name: 'a.mp4', mimeType: 'video/mp4' });
    const { container } = render(<VideoPlayer node={node} onClose={() => {}} />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', '/api/files/v1/content');
  });
});

describe('Preview (download fallback)', () => {
  it('offers a download link for unsupported types', () => {
    const node = makeNode({ id: 'd1', name: 'archive.zip', mimeType: 'application/zip' });
    render(<Preview node={node} onClose={() => {}} />);
    const link = screen.getByText('Download').closest('a');
    expect(link).toHaveAttribute('href', '/api/files/d1/content');
    expect(link).toHaveAttribute('download', 'archive.zip');
  });
});
