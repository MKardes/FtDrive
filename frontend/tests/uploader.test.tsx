import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Uploader } from '../src/components/Uploader';
import { useUploader } from '../src/features/upload/hooks';
import { api, ApiError } from '../src/api/client';
import { makeNode } from './factories';

// `Uploader` is a presentational component (003-drag-drop-carousel-nav): the
// upload queue now lives in the parent (`Browse`) so button and drag-and-drop
// uploads share one list. This harness plays that parent role for the tests.
function UploaderHarness({ parentId = 'root' }: { parentId?: string }) {
  const uploader = useUploader(parentId);
  return <Uploader {...uploader} />;
}

function renderUploader(parentId = 'root') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UploaderHarness parentId={parentId} />
    </QueryClientProvider>,
  );
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Choose files to upload') as HTMLInputElement;
}

describe('Uploader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uploads multiple files and shows each as done', async () => {
    vi.spyOn(api.files, 'upload').mockImplementation(async (_parentId, file, onProgress) => {
      onProgress?.(0.5);
      onProgress?.(1);
      return makeNode({ name: file.name });
    });

    renderUploader();
    await userEvent.upload(fileInput(), [
      new File(['a'], 'one.txt', { type: 'text/plain' }),
      new File(['b'], 'two.txt', { type: 'text/plain' }),
    ]);

    expect(await screen.findByText('one.txt')).toBeInTheDocument();
    expect(screen.getByText('two.txt')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Done')).toHaveLength(2));
    expect(api.files.upload).toHaveBeenCalledTimes(2);
  });

  it('surfaces an error and offers retry', async () => {
    const spy = vi
      .spyOn(api.files, 'upload')
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'boom'))
      .mockResolvedValueOnce(makeNode({ name: 'flaky.txt' }));

    renderUploader();
    await userEvent.upload(fileInput(), new File(['x'], 'flaky.txt', { type: 'text/plain' }));

    expect(await screen.findByText('Upload failed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reports a 413 as a too-large error', async () => {
    vi.spyOn(api.files, 'upload').mockRejectedValue(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'too big'));

    renderUploader();
    await userEvent.upload(fileInput(), new File(['x'], 'huge.bin', { type: 'application/octet-stream' }));

    expect(await screen.findByText('File is too large.')).toBeInTheDocument();
  });

  it('shows a "kept both" notice when the stored name differs', async () => {
    vi.spyOn(api.files, 'upload').mockResolvedValue(makeNode({ name: 'dup (2).txt' }));

    renderUploader();
    await userEvent.upload(fileInput(), new File(['x'], 'dup.txt', { type: 'text/plain' }));

    expect(await screen.findByText(/was kept as/)).toBeInTheDocument();
    expect(screen.getByText(/dup \(2\)\.txt/)).toBeInTheDocument();
  });
});
