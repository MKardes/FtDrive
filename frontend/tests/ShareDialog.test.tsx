import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShareDialog } from '../src/components/ShareDialog';
import { api } from '../src/api/client';
import type { ShareWithNode } from '../src/api/types';
import { makeNode } from './factories';

function makeShare(overrides: Partial<ShareWithNode> = {}): ShareWithNode {
  return {
    id: 'share-1',
    nodeId: 'node-1',
    kind: 'link',
    token: 'tok123',
    createdAt: 0,
    expiresAt: null,
    node: { id: 'node-1', name: 'doc.txt', type: 'file' },
    ...overrides,
  };
}

function renderDialog(node = makeNode({ id: 'node-1', name: 'doc.txt' })) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ShareDialog node={node} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ShareDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a link share and then shows the copyable URL', async () => {
    const shares: ShareWithNode[] = [];
    vi.spyOn(api.shares, 'forNode').mockImplementation(async () => ({ items: [...shares] }));
    vi.spyOn(api.users, 'directory').mockResolvedValue([]);
    const create = vi.spyOn(api.shares, 'create').mockImplementation(async () => {
      shares.push(makeShare());
      return { items: [...shares] };
    });

    renderDialog();
    const createBtn = await screen.findByRole('button', { name: 'Create link' });
    await userEvent.click(createBtn);

    expect(create).toHaveBeenCalledWith({ nodeId: 'node-1', kind: 'link' });
    const input = (await screen.findByLabelText('Share link')) as HTMLInputElement;
    expect(input.value).toContain('/s/tok123');
    // The existing link is surfaced, not duplicated.
    expect(screen.queryByRole('button', { name: 'Create link' })).toBeNull();
  });

  it('copies the existing link to the clipboard', async () => {
    vi.spyOn(api.shares, 'forNode').mockResolvedValue({ items: [makeShare()] });
    vi.spyOn(api.users, 'directory').mockResolvedValue([]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderDialog();
    const copyBtn = await screen.findByRole('button', { name: 'Copy' });
    await userEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/s/tok123'));
    await screen.findByRole('button', { name: 'Copied!' });
  });

  it('revokes the link share', async () => {
    let items = [makeShare()];
    vi.spyOn(api.shares, 'forNode').mockImplementation(async () => ({ items: [...items] }));
    vi.spyOn(api.users, 'directory').mockResolvedValue([]);
    const revoke = vi.spyOn(api.shares, 'revoke').mockImplementation(async () => {
      items = [];
    });

    renderDialog();
    const revokeBtn = await screen.findByRole('button', { name: 'Revoke link' });
    await userEvent.click(revokeBtn);

    expect(revoke).toHaveBeenCalledWith('share-1');
    await screen.findByRole('button', { name: 'Create link' });
  });

  it('lists current recipients by email with Remove, and shares by typed email', async () => {
    const bobGrant = makeShare({
      id: 'share-bob',
      kind: 'user',
      token: undefined,
      recipient: { id: 'u-bob', username: 'bob', email: 'bob@family.com' },
    });
    vi.spyOn(api.shares, 'forNode').mockResolvedValue({ items: [bobGrant] });
    vi.spyOn(api.users, 'directory').mockResolvedValue([
      { id: 'u-bob', username: 'bob', email: 'bob@family.com' },
      { id: 'u-carol', username: 'carol', email: 'carol@family.com' },
      { id: 'u-dave', username: 'dave', email: null },
    ]);
    const create = vi.spyOn(api.shares, 'create').mockResolvedValue({ items: [] });

    renderDialog();

    // Bob already has access: addressed by email, removable, absent from suggestions.
    await screen.findByText('bob@family.com');
    expect(screen.getByRole('button', { name: 'Remove bob@family.com' })).toBeInTheDocument();

    // Typing an email filters the suggestions to matching accounts only.
    const input = await screen.findByLabelText('Add people by email');
    await userEvent.type(input, 'carol@');
    const option = await screen.findByRole('option', { name: /carol@family\.com/ });
    expect(screen.queryByRole('option', { name: /dave/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /bob@family\.com/ })).toBeNull();

    // Picking turns it into a chip; Share grants by the resolved account id.
    await userEvent.click(option);
    await userEvent.click(screen.getByRole('button', { name: 'Share with 1' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ nodeId: 'node-1', kind: 'user', recipientIds: ['u-carol'] }),
    );
  });

  it('suggests no one until at least 3 characters are typed', async () => {
    vi.spyOn(api.shares, 'forNode').mockResolvedValue({ items: [] });
    vi.spyOn(api.users, 'directory').mockResolvedValue([
      { id: 'u-carol', username: 'carol', email: 'carol@family.com' },
      { id: 'u-dave', username: 'dave', email: null },
    ]);

    renderDialog();
    const input = await screen.findByLabelText('Add people by email');
    expect(screen.queryByRole('option')).toBeNull();

    // 2 characters: still nothing — no suggestions, no "no match" notice either.
    await userEvent.type(input, 'ca');
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByText(/No user with that email/)).toBeNull();

    // 3rd character crosses the threshold.
    await userEvent.type(input, 'r');
    await screen.findByRole('option', { name: /carol@family\.com/ });

    await userEvent.clear(input);
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('says so when a typed email matches no local account', async () => {
    vi.spyOn(api.shares, 'forNode').mockResolvedValue({ items: [] });
    vi.spyOn(api.users, 'directory').mockResolvedValue([
      { id: 'u-carol', username: 'carol', email: 'carol@family.com' },
    ]);

    renderDialog();
    const input = await screen.findByLabelText('Add people by email');
    await userEvent.type(input, 'stranger@elsewhere.com');

    await screen.findByText(/No user with that email on this drive/);
    expect(screen.queryByRole('option')).toBeNull();
  });
});
