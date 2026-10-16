# JsonLink MCP Server

Give your AI agent the web. The [JsonLink](https://jsonlink.io) MCP server lets Claude, Cursor, VS Code and any MCP client read web pages as Markdown, get link metadata, take screenshots and list the links and images on any URL.

- **Reads JavaScript-heavy pages** — pages are loaded in a real browser when needed.
- **Gets past blocks** — requests are retried through a proxy when a site blocks them.
- **Failed requests are free** — timeouts and pages that can't load cost no credits.

## Tools

| Tool | What it does | Credits |
| --- | --- | --- |
| `url_to_markdown` | Main content of a page as clean Markdown, for reading articles, docs and blog posts | 1 |
| `extract_metadata` | Title, description, preview images, favicon and site name of a URL | 1 |
| `screenshot` | Screenshot of a page (desktop, mobile, tablet, full page or one element), returned as an image. Ads, trackers, chat widgets and cookie banners hidden; optional dark mode | 2 |
| `extract_links` | Every link on a page with anchor text, follow/nofollow and internal/external | 1 |
| `extract_images` | Every image on a page with format, dimensions and file size | 1 |

## Get an API key

[Create a free account](https://jsonlink.io/signup) — the free plan includes **100 credits every month**, no credit card. Copy your key from the [dashboard](https://jsonlink.io/dashboard).

## Setup

Replace `YOUR_API_KEY` with your JsonLink key.

### Claude Code

```bash
claude mcp add jsonlink -e JSONLINK_API_KEY=YOUR_API_KEY -- npx -y jsonlink-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "jsonlink": {
      "command": "npx",
      "args": ["-y", "jsonlink-mcp"],
      "env": { "JSONLINK_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

### Cursor

Add this to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "jsonlink": {
      "command": "npx",
      "args": ["-y", "jsonlink-mcp"],
      "env": { "JSONLINK_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

### VS Code

Add this to `.vscode/mcp.json`:

```json
{
  "servers": {
    "jsonlink": {
      "command": "npx",
      "args": ["-y", "jsonlink-mcp"],
      "env": { "JSONLINK_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

### Windsurf and other clients

Any client that runs stdio MCP servers works the same way: command `npx`, arguments `-y jsonlink-mcp`, environment variable `JSONLINK_API_KEY`.

## Example prompts

- "Read https://example.com/blog/post and summarize it in five bullet points."
- "Take a mobile screenshot of my landing page and tell me what looks broken."
- "Screenshot just the pricing section of stripe.com in dark mode."
- "Get the title and description of these 10 links and make a table."
- "List the external links on this page that are nofollow."

## Configuration

| Variable | Description |
| --- | --- |
| `JSONLINK_API_KEY` | Your JsonLink API key (required). |
| `JSONLINK_API_URL` | API base URL. Defaults to `https://jsonlink.io`. |

## Pricing

Every tool call uses credits from your JsonLink plan: 1 credit per page, 2 per screenshot. Plans start at $15/month for 50,000 credits — see [pricing](https://jsonlink.io/pricing). Credits and rate limits are the same as the [REST API](https://jsonlink.io/docs).

## Development

```bash
npm install
npm run build
JSONLINK_API_KEY=YOUR_API_KEY node dist/index.js
```

Run it as a remote (Streamable HTTP) server with `node dist/index.js --http --port 3100`; clients send their key as `Authorization: Bearer YOUR_API_KEY`.

## License

MIT
