import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { log } from '../util/log.ts';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function generatePkce(): PkcePair {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomState(): string {
  return base64url(randomBytes(16));
}

export interface LoopbackResult {
  code: string;
  state?: string;
}

export async function awaitLoopbackRedirect(opts: {
  port: number;
  callbackPath?: string;
  expectedState?: string;
  timeoutMs?: number;
}): Promise<LoopbackResult> {
  const callbackPath = opts.callbackPath ?? '/callback';
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${opts.port}`);
      if (url.pathname !== callbackPath) {
        res.writeHead(404).end('not found');
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') ?? undefined;
      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(
          `<html><body><h2>Auth failed</h2><p>${escapeHtml(error)}</p></body></html>`,
        );
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (!code) {
        res.writeHead(400).end('missing code');
        return;
      }
      if (opts.expectedState && state !== opts.expectedState) {
        res.writeHead(400).end('state mismatch');
        server.close();
        reject(new Error('OAuth state mismatch'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(
        `<html><body><h2>Authentication complete</h2><p>You can close this tab.</p></body></html>`,
      );
      server.close();
      resolve({ code, state });
    });
    server.on('error', reject);
    server.listen(opts.port, '127.0.0.1');
    if (opts.timeoutMs) {
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timed out'));
      }, opts.timeoutMs);
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    log.warn(`Could not open browser. Visit: ${url}`);
  }
}

export function parseRedirectUri(uri: string): { port: number; path: string } {
  const u = new URL(uri);
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
    throw new Error(`Redirect URI must point at 127.0.0.1 (got ${u.hostname})`);
  }
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  return { port, path: u.pathname || '/callback' };
}
