# Agent Reach - NestJS Implementation

A NestJS implementation of the [Agent Reach](https://github.com/Panniantong/Agent-Reach) capability layer.

## Quick Start

```bash
npm install
npm run start:dev
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /reach/doctor` | Health check all channels |
| `GET /reach/web?url=` | Read webpage via Jina |
| `GET /reach/youtube?query=` | Search YouTube |
| `GET /reach/twitter?search=` | Search Twitter |
| `GET /reach/github?repo=&action=` | GitHub info |
| `GET /reach/search?query=` | Exa web search |
| `GET /reach/rss?url=` | Parse RSS feed |

## MCP Server

```bash
npm run start:mcp
```

Configure in Claude Desktop `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "agent-reach": {
      "command": "node",
      "args": ["/path/to/dist/mcp-server.js"]
    }
  }
}
```

## Docker

```bash
docker build -t agent-reach .
docker run -p 3000:3000 agent-reach
```