import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { JsonLinkClient, JsonLinkError, VERSION } from './client.js';

// Images larger than this are returned as a link only: most MCP clients
// reject very large tool results.
const MAX_INLINE_IMAGE_BYTES = 3_500_000;

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] });

const failure = (err: unknown): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: err instanceof JsonLinkError ? err.message : `Unexpected error: ${String(err)}` }],
});

// Every tool reads public web pages and changes nothing.
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const url = z.string().url().describe('Full URL of the web page, including https://');

export function createServer(apiKey: string) {
  const api = new JsonLinkClient(apiKey);
  const server = new McpServer({ name: 'jsonlink', version: VERSION });

  server.registerTool(
    'url_to_markdown',
    {
      title: 'Read a web page as Markdown',
      description:
        'Fetch a web page and return its main content as clean Markdown (no navigation, ads or footers). ' +
        'Use this to read articles, docs, blog posts or any page the user mentions. Handles JavaScript-rendered pages. 1 credit.',
      inputSchema: {
        url,
        max_chars: z
          .number()
          .int()
          .min(1000)
          .optional()
          .describe('Truncate the Markdown to this many characters. Default 50,000.'),
      },
      annotations,
    },
    async ({ url, max_chars }) => {
      try {
        const page = await api.post('markdown', { url });
        const limit = max_chars ?? 50_000;
        let markdown = String(page.markdown || '');
        const truncated = markdown.length > limit;
        if (truncated) markdown = markdown.slice(0, limit);

        const header = [
          `# ${page.title || url}`,
          `Source: ${page.url || url}`,
          page.wordCount ? `Words: ${page.wordCount}${truncated ? ` (truncated to ${limit} characters)` : ''}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        return text(`${header}\n\n---\n\n${markdown}`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'extract_metadata',
    {
      title: 'Get link metadata',
      description:
        "Get a URL's title, description, preview images, favicon and site name (Open Graph, Twitter Card and HTML meta tags). " +
        'Use it to summarize what a link is, build link previews or check SEO tags. Faster and cheaper than reading the whole page. 1 credit.',
      inputSchema: { url },
      annotations,
    },
    async ({ url }) => {
      try {
        const meta = await api.get('extract', { url });
        return text(JSON.stringify(meta, null, 2));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'screenshot',
    {
      title: 'Take a screenshot',
      description:
        'Capture a screenshot of a web page and return the image, so you can see how the page looks. ' +
        'Desktop, phone or tablet; full page or a single element. Cookie banners, ads and chat widgets are hidden. 2 credits.',
      inputSchema: {
        url,
        device: z
          .enum(['desktop', 'mobile', 'tablet'])
          .optional()
          .describe('desktop (1280×800, default), mobile (iPhone 15) or tablet (iPad).'),
        full_page: z
          .boolean()
          .optional()
          .describe('Capture the whole scrollable page instead of the first screen. Lazy-loaded content is loaded first.'),
        selector: z
          .string()
          .max(300)
          .optional()
          .describe('CSS selector of one element to capture instead of the page, e.g. "#pricing" or "header".'),
        dark_mode: z.boolean().optional().describe('Capture the dark theme (prefers-color-scheme: dark).'),
        hide_selectors: z
          .string()
          .max(2000)
          .optional()
          .describe('Comma-separated CSS selectors to hide before capturing, e.g. ".promo-bar,#newsletter".'),
        clean: z
          .boolean()
          .optional()
          .describe('Hide ads, trackers and chat widgets (default true). Set false to capture the page exactly as served.'),
        wait_for_selector: z
          .string()
          .max(300)
          .optional()
          .describe('Wait until this CSS selector appears before capturing, for single-page apps.'),
        delay: z.number().min(0).max(10).optional().describe('Seconds to wait after loading, for animations or late content.'),
      },
      annotations,
    },
    async ({ url, device, full_page, selector, dark_mode, hide_selectors, clean, wait_for_selector, delay }) => {
      try {
        const on = (value: boolean | undefined) => (value ? 'true' : undefined);
        const tidy = clean !== false;
        const viewport =
          device === 'mobile'
            ? { viewport_device: 'iphone_15', image_width: 786 }
            : device === 'tablet'
              ? { viewport_device: 'ipad' }
              : { viewport_width: 1280, viewport_height: 800 };

        const shot = await api.get('screenshot', {
          url,
          ...viewport,
          full_page: on(full_page),
          full_page_scroll: on(full_page),
          selector: selector || undefined,
          dark_mode: on(dark_mode),
          hide_selectors: hide_selectors || undefined,
          block_ads: on(tidy),
          block_trackers: on(tidy),
          block_chats: on(tidy),
          wait_for_selector: wait_for_selector || undefined,
          format: 'jpg',
          quality: full_page ? 60 : 75,
          delay,
        });

        const note = `Screenshot of ${url}: ${shot.url} (stored for 7 days; download it to keep it).`;
        const image = await api.download(shot.url);
        if (image.data.length > MAX_INLINE_IMAGE_BYTES) {
          return text(`${note}\nThe image is too large to show inline (${Math.round(image.data.length / 1024)} KB).`);
        }
        return {
          content: [
            { type: 'image', data: image.data.toString('base64'), mimeType: image.mimeType },
            { type: 'text', text: note },
          ],
        };
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'extract_links',
    {
      title: 'List the links on a page',
      description:
        'List every link on a web page with its anchor text, follow/nofollow and internal/external type. ' +
        'Use it to crawl a site, find pages to read next, or audit links. 1 credit.',
      inputSchema: {
        url,
        type: z.enum(['all', 'internal', 'external']).optional().describe('Only internal or external links. Default all.'),
        limit: z.number().int().min(1).max(1000).optional().describe('Maximum links to return. Default 200.'),
      },
      annotations,
    },
    async ({ url, type, limit }) => {
      try {
        const data = await api.get('links', { url });
        const all: Array<Record<string, string>> = Array.isArray(data.links) ? data.links : [];
        const seen = new Set<string>();
        const links = all.filter(
          (l) => (!type || type === 'all' || l.type === type) && l.url && !seen.has(l.url) && seen.add(l.url),
        );
        const max = limit ?? 200;
        const shown = links.slice(0, max).map(({ url, text, rel, type }) => ({ url, text, rel, type }));
        const summary = `${links.length} ${type && type !== 'all' ? type + ' ' : ''}links on ${url}${links.length > max ? ` (showing ${max})` : ''}.`;
        return text(`${summary}\n\n${JSON.stringify(shown, null, 2)}`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'extract_images',
    {
      title: 'List the images on a page',
      description:
        'List the images on a web page (including lazy-loaded ones) with URL, format, dimensions and file size. ' +
        'Use it to find photos, logos or product images on a page. 1 credit.',
      inputSchema: {
        url,
        min_width: z.number().int().min(0).optional().describe('Skip images narrower than this, in pixels (e.g. 200 to drop icons).'),
        limit: z.number().int().min(1).max(500).optional().describe('Maximum images to return. Default 100.'),
      },
      annotations,
    },
    async ({ url, min_width, limit }) => {
      try {
        const data = await api.get('images', { url });
        const all: Array<Record<string, any>> = Array.isArray(data.images) ? data.images : [];
        const seen = new Set<string>();
        const images = all.filter(
          (img) => img.url && !seen.has(img.url) && seen.add(img.url) && (!min_width || (img.width || 0) >= min_width),
        );
        const max = limit ?? 100;
        const shown = images
          .slice(0, max)
          .map(({ url, format, width, height, size }) => ({ url, format, width, height, size }));
        const summary = `${images.length} images on ${url}${images.length > max ? ` (showing ${max})` : ''}.`;
        return text(`${summary}\n\n${JSON.stringify(shown, null, 2)}`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  return server;
}
