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

  it('remounts the video element when the node changes (FR-009)', () => {
    const node = makeNode({ id: 'v1', name: 'a.mp4', mimeType: 'video/mp4' });
    const other = makeNode({ id: 'v2', name: 'b.mp4', mimeType: 'video/mp4' });
    const { container, rerender } = render(<VideoPlayer node={node} onClose={() => {}} />);
    const first = container.querySelector('video');
    rerender(<VideoPlayer node={other} onClose={() => {}} />);
    const second = container.querySelector('video');
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute('src', '/api/files/v2/content');
  });
});

describe('carousel navigation (003-drag-drop-carousel-nav)', () => {
  it('PhotoViewer: shows next/previous per hasPrev/hasNext and wires clicks + arrow keys', () => {
    const node = makeNode({ id: 'p1', name: 'a.jpg', mimeType: 'image/jpeg' });
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <PhotoViewer node={node} onClose={() => {}} onPrev={onPrev} onNext={onNext} hasPrev={false} hasNext={true} />,
    );
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrev).not.toHaveBeenCalled();

    rerender(
      <PhotoViewer node={node} onClose={() => {}} onPrev={onPrev} onNext={onNext} hasPrev={true} hasNext={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrev).toHaveBeenCalledTimes(2);
  });

  it('VideoPlayer: hides both controls when neither hasPrev nor hasNext', () => {
    const node = makeNode({ id: 'v1', name: 'a.mp4', mimeType: 'video/mp4' });
    render(<VideoPlayer node={node} onClose={() => {}} hasPrev={false} hasNext={false} />);
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
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
