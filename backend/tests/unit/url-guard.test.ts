import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { describe, expect, it, vi, afterEach } from 'vitest';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({ lookup: (...args: unknown[]) => lookupMock(...args) }));

const networkInterfacesMock = vi.fn(() => ({}));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, networkInterfaces: () => networkInterfacesMock() };
});

const { assertUrlAllowed, guardedFetch } = await import('../../src/lib/url-guard');

const ALLOW = { downloadAllowPrivateAddresses: false };

/**
 * SSRF guard unit tests (T007, gating — research.md §11). DNS resolution and
 * the host's own interface addresses are mocked so the classification logic is
 * tested deterministically without real network access.
 */
describe('url-guard', () => {
  afterEach(() => {
    lookupMock.mockReset();
    networkInterfacesMock.mockReset().mockReturnValue({});
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertUrlAllowed('ftp://example.com/file', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertUrlAllowed('file:///etc/passwd', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an unparsable URL', async () => {
    await expect(assertUrlAllowed('not a url', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a literal loopback address with no DNS lookup needed', async () => {
    await expect(assertUrlAllowed('http://127.0.0.1/admin', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects loopback resolved via DNS', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertUrlAllowed('http://loopback.example/', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects private RFC1918 addresses', async () => {
    for (const address of ['10.0.0.5', '172.16.4.4', '192.168.1.1']) {
      lookupMock.mockResolvedValue([{ address, family: 4 }]);
      await expect(assertUrlAllowed('http://private.example/', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('rejects link-local addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.1.1', family: 4 }]);
    await expect(assertUrlAllowed('http://link-local.example/', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects IPv6 loopback and unique-local addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '::1', family: 6 }]);
    await expect(assertUrlAllowed('http://v6-loopback.example/', ALLOW)).rejects.toMatchObject({ statusCode: 400 });

    lookupMock.mockResolvedValue([{ address: 'fd12:3456:789a::1', family: 6 }]);
    await expect(assertUrlAllowed('http://v6-ula.example/', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects the server's own interface address even when it looks public", async () => {
    networkInterfacesMock.mockReturnValue({
      eth0: [{ address: '93.184.216.34', family: 'IPv4' }],
    });
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertUrlAllowed('http://self.example/', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects if ANY resolved address is disallowed (multi-answer DNS)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expect(assertUrlAllowed('http://mixed.example/', ALLOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows a public http(s) URL', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const result = await assertUrlAllowed('https://public.example/video', ALLOW);
    expect(result.address).toBe('93.184.216.34');
    expect(result.url.hostname).toBe('public.example');
  });

  it('DOWNLOAD_ALLOW_PRIVATE_ADDRESSES opts out of the address checks', async () => {
    lookupMock.mockResolvedValue([{ address: '192.168.1.50', family: 4 }]);
    const result = await assertUrlAllowed('http://lan.example/', { downloadAllowPrivateAddresses: true });
    expect(result.address).toBe('192.168.1.50');
  });

  describe('guardedFetch redirects', () => {
    let servers: Server[] = [];
    afterEach(async () => {
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
      servers = [];
    });

    function listen(handler: Handler): Promise<number> {
      const server = createServer(handler);
      servers.push(server);
      return new Promise((resolvePort) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolvePort(typeof addr === 'object' && addr ? addr.port : 0);
        });
      });
    }

    it('follows a redirect hop-by-hop and returns the final response', async () => {
      const targetPort = await listen((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
      });
      const entryPort = await listen((_req, res) => {
        res.writeHead(302, { location: `http://127.0.0.1:${targetPort}/` });
        res.end();
      });

      // Loopback is only reachable here because the test opts private addresses
      // in explicitly — proves the redirect-following/pinned-connect mechanics.
      const res = await guardedFetch(`http://127.0.0.1:${entryPort}/`, { downloadAllowPrivateAddresses: true });
      expect(res.statusCode).toBe(200);
      expect(res.finalUrl).toBe(`http://127.0.0.1:${targetPort}/`);
    });

    it('rejects when the guard is enforced, whether the address is the entry or a redirect target', async () => {
      const targetPort = await listen((_req, res) => res.end('ok'));
      const entryPort = await listen((_req, res) => {
        res.writeHead(302, { location: `http://127.0.0.1:${targetPort}/` });
        res.end();
      });
      await expect(
        guardedFetch(`http://127.0.0.1:${entryPort}/`, { downloadAllowPrivateAddresses: false }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
