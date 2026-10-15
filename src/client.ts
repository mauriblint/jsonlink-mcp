// Minimal client for the public JsonLink API (https://jsonlink.io/docs).
// Auth, credits and rate limits are all handled by the API itself.

export const VERSION = '0.1.0';

const DEFAULT_BASE_URL = 'https://jsonlink.io';
const TIMEOUT_MS = 120_000;

export class JsonLinkError extends Error {}

// Turns API errors into messages an AI agent (and its user) can act on.
const explain = (status: number, error: string, data: Record<string, unknown>): string => {
  if (error === 'Credits quota exceeded') {
    return typeof data.message === 'string'
      ? data.message
      : 'Your JsonLink credits for this period are used up. Upgrade at https://jsonlink.io/pricing';
  }
  if (error === 'Too many request') return 'JsonLink rate limit reached. Wait a minute and try again.';
  if (error === 'Missing API Key.' || error === 'Invalid API Key') {
    return `${error.replace(/\.$/, '')}. Check your API key at https://jsonlink.io/dashboard (free accounts: https://jsonlink.io/signup).`;
  }
  if (error === 'UNABLE_TO_LOAD_PAGE' || error.startsWith('Unable to fetch content')) {
    return 'The page could not be loaded: the site may be down, not exist, or block automated access. No credits were used.';
  }
  if (error === 'REQUEST_TIMEOUT') return 'The site did not respond in time. No credits were used.';
  return `JsonLink error${status >= 400 ? ` (HTTP ${status})` : ''}: ${error}`;
};

export class JsonLinkClient {
  private baseUrl: string;

  constructor(
    private apiKey: string,
    baseUrl = process.env.JSONLINK_API_URL || DEFAULT_BASE_URL,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async get(endpoint: string, params: Record<string, string | number | boolean | undefined>) {
    const query = new URLSearchParams({ api_key: this.apiKey });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    return this.request(`${this.baseUrl}/api/${endpoint}?${query}`, { method: 'GET' });
  }

  async post(endpoint: string, body: Record<string, unknown>) {
    return this.request(`${this.baseUrl}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, api_key: this.apiKey }),
    });
  }

  /** Downloads a file the API returned (screenshots). */
  async download(url: string) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new JsonLinkError(`Could not download ${url} (HTTP ${res.status}).`);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      mimeType: res.headers.get('content-type')?.split(';')[0] || 'image/jpeg',
    };
  }

  private async request(url: string, init: RequestInit): Promise<Record<string, any>> {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          'User-Agent': `jsonlink-mcp/${VERSION}`,
          // Lets JsonLink count usage coming from MCP clients.
          'X-Client': `jsonlink-mcp/${VERSION}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new JsonLinkError(timedOut ? 'JsonLink took too long to respond.' : `Could not reach JsonLink: ${String(err)}`);
    }

    const data = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!data) throw new JsonLinkError(`JsonLink returned an invalid response (HTTP ${res.status}).`);

    // Extraction errors come back as { error } even with HTTP 200.
    if (data.error || data.success === false || !res.ok) {
      throw new JsonLinkError(explain(res.status, String(data.error || 'Request failed'), data));
    }
    return data;
  }
}
