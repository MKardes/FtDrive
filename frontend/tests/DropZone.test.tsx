import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropZone } from '../src/components/DropZone';

function makeFile(name = 'a.jpg') {
  return new File(['x'], name, { type: 'image/jpeg' });
}

describe('DropZone', () => {
  it('calls onFiles with the dropped files', () => {
    const onFiles = vi.fn();
    render(
      <DropZone onFiles={onFiles}>
        <div>content</div>
      </DropZone>,
    );
    const file = makeFile();
    fireEvent.drop(screen.getByText('content'), {
      dataTransfer: { files: [file], types: ['Files'] },
    });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(Array.from(onFiles.mock.calls[0]![0] as FileList)).toEqual([file]);
  });

  it('shows a hover cue on dragenter and clears it on dragleave', () => {
    const { container } = render(
      <DropZone onFiles={vi.fn()}>
        <div>content</div>
      </DropZone>,
    );
    const zone = container.firstChild as HTMLElement;
    expect(zone.className).not.toMatch(/dropzone--active/);

    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(zone.className).toMatch(/dropzone--active/);

    fireEvent.dragLeave(zone, { dataTransfer: { types: ['Files'] } });
    expect(zone.className).not.toMatch(/dropzone--active/);
  });

  it('clears the hover cue on drop', () => {
    const { container } = render(
      <DropZone onFiles={vi.fn()}>
        <div>content</div>
      </DropZone>,
    );
    const zone = container.firstChild as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(zone.className).toMatch(/dropzone--active/);
    fireEvent.drop(zone, { dataTransfer: { files: [makeFile()], types: ['Files'] } });
    expect(zone.className).not.toMatch(/dropzone--active/);
  });

  it('ignores a drag that carries no files', () => {
    const onFiles = vi.fn();
    const { container } = render(
      <DropZone onFiles={onFiles}>
        <div>content</div>
      </DropZone>,
    );
    const zone = container.firstChild as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'] } });
    expect(zone.className).not.toMatch(/dropzone--active/);
    fireEvent.drop(zone, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const onFiles = vi.fn();
    const { container } = render(
      <DropZone onFiles={onFiles} disabled>
        <div>content</div>
      </DropZone>,
    );
    const zone = container.firstChild as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(zone.className).not.toMatch(/dropzone--active/);
    fireEvent.drop(zone, { dataTransfer: { files: [makeFile()], types: ['Files'] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
