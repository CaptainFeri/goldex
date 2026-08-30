import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WebChannelService } from './channels/web-channel.service';
import { YouTubeChannelService } from './channels/youtube-channel.service';
import { GitHubChannelService } from './channels/github-channel.service';
import { ExaChannelService } from './channels/exa-channel.service';
import { DoctorService } from './reach/doctor.service';

async function bootstrapMcp() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const webChannel = app.get(WebChannelService);
  const ytChannel = app.get(YouTubeChannelService);
  const ghChannel = app.get(GitHubChannelService);
  const exaChannel = app.get(ExaChannelService);
  const doctor = app.get(DoctorService);

  const server = new McpServer({ name: 'agent-reach', version: '1.0.0' });

  server.tool(
    'read_webpage',
    'Reads and extracts text from any webpage using Jina Reader',
    { url: z.string().url() },
    async ({ url }) => {
      const res = await webChannel.run({ url });
      return { content: [{ type: 'text', text: res.result }] };
    }
  );

  server.tool(
    'search_youtube',
    'Searches YouTube and returns top results',
    { query: z.string() },
    async ({ query }) => {
      const res = await ytChannel.run({ query });
      return { content: [{ type: 'text', text: res.result }] };
    }
  );

  server.tool(
    'github_repo_info',
    'Get GitHub repo issues or readme',
    { repo: z.string(), action: z.enum(['issues', 'readme']) },
    async ({ repo, action }) => {
      const res = await ghChannel.run({ repo, action });
      return { content: [{ type: 'text', text: res.result }] };
    }
  );

  server.tool(
    'search_web_exa',
    'AI-powered semantic web search via Exa',
    { query: z.string() },
    async ({ query }) => {
      const res = await exaChannel.run({ query });
      return { content: [{ type: 'text', text: res.result }] };
    }
  );

  server.tool(
    'agent_reach_doctor',
    'Checks the health of all internet access channels',
    {},
    async () => {
      const status = await doctor.checkAll();
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🔌 Agent Reach MCP Server running on stdio');
}

bootstrapMcp().catch(console.error);