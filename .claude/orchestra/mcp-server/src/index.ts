#!/usr/bin/env node
/**
 * Orchestra MCP Server
 *
 * Provides tools for multi-agent coordination:
 * - check_queries: Check for pending tasks
 * - send_query: Send a task to another agent
 * - update_status: Update agent status
 * - list_agents: List all agents and their status
 * - mark_complete: Mark current task as complete
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

// Get session directory from environment
const SESSION_DIR = process.env.ORCH_SESSION_DIR || '';
const AGENT_NUM = parseInt(process.env.ORCH_AGENT_NUM || '0', 10);

interface AgentState {
  agentId: number;
  agentName: string;
  status: 'pending' | 'running' | 'idle' | 'blocked' | 'complete' | 'stopped';
  lastActive: string | null;
  currentTask: string | null;
  restarts: number;
}

interface QueryMessage {
  from: string;
  to: string;
  timestamp: string;
  priority: 'low' | 'normal' | 'high';
  message: string;
}

// Helper to read JSON file
function readJson<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// Helper to write JSON file
function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Helper to read markdown query file
function readQuery(filePath: string): QueryMessage | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) return null;

    const frontmatter = frontmatterMatch[1];
    const message = frontmatterMatch[2].trim();

    const from = frontmatter.match(/from:\s*(.+)/)?.[1] || 'unknown';
    const to = frontmatter.match(/to:\s*(.+)/)?.[1] || 'unknown';
    const timestamp = frontmatter.match(/timestamp:\s*(.+)/)?.[1] || new Date().toISOString();
    const priority = (frontmatter.match(/priority:\s*(.+)/)?.[1] || 'normal') as QueryMessage['priority'];

    return { from, to, timestamp, priority, message };
  } catch {
    return null;
  }
}

// Create the MCP server
const server = new Server(
  {
    name: 'orchestra',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'check_queries',
        description: 'Check for pending task queries from the orchestrator or other agents',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'send_query',
        description: 'Send a task or message to another agent',
        inputSchema: {
          type: 'object',
          properties: {
            to_agent: {
              type: 'string',
              description: 'Agent name or number to send to (e.g., "PLAT" or "2")',
            },
            message: {
              type: 'string',
              description: 'The task or message to send',
            },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high'],
              description: 'Message priority (default: normal)',
            },
          },
          required: ['to_agent', 'message'],
        },
      },
      {
        name: 'update_status',
        description: 'Update your agent status',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['running', 'idle', 'blocked', 'complete'],
              description: 'New status',
            },
            current_task: {
              type: 'string',
              description: 'Description of current task (optional)',
            },
          },
          required: ['status'],
        },
      },
      {
        name: 'list_agents',
        description: 'List all agents and their current status',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'mark_complete',
        description: 'Mark your current task as complete with a summary',
        inputSchema: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'Summary of what was completed',
            },
          },
          required: ['summary'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!SESSION_DIR) {
    return {
      content: [{ type: 'text', text: 'Error: ORCH_SESSION_DIR not set' }],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'check_queries': {
        const queryFile = path.join(SESSION_DIR, `agent-${AGENT_NUM}-query.md`);

        if (!fs.existsSync(queryFile)) {
          return {
            content: [{ type: 'text', text: 'No pending queries.' }],
          };
        }

        const query = readQuery(queryFile);
        if (!query) {
          return {
            content: [{ type: 'text', text: 'No pending queries.' }],
          };
        }

        // Clear the query file after reading
        fs.unlinkSync(queryFile);

        return {
          content: [
            {
              type: 'text',
              text: `Query from ${query.from} (${query.priority} priority):\n\n${query.message}`,
            },
          ],
        };
      }

      case 'send_query': {
        const toAgent = args?.to_agent as string;
        const message = args?.message as string;
        const priority = (args?.priority as string) || 'normal';

        // Find agent number
        let agentNum: number;
        if (/^\d+$/.test(toAgent)) {
          agentNum = parseInt(toAgent, 10);
        } else {
          // Look up by name in config
          const configPath = path.join(SESSION_DIR, 'config.json');
          const config = readJson<{ agents: Array<{ id: number; name: string }> }>(configPath);
          const agent = config?.agents.find((a) => a.name.toUpperCase() === toAgent.toUpperCase());
          if (!agent) {
            return {
              content: [{ type: 'text', text: `Agent not found: ${toAgent}` }],
              isError: true,
            };
          }
          agentNum = agent.id;
        }

        const queryFile = path.join(SESSION_DIR, `agent-${agentNum}-query.md`);
        const queryContent = `---
from: agent-${AGENT_NUM}
to: agent-${agentNum}
timestamp: ${new Date().toISOString()}
priority: ${priority}
---

${message}
`;

        fs.writeFileSync(queryFile, queryContent);

        return {
          content: [{ type: 'text', text: `Query sent to agent ${agentNum}` }],
        };
      }

      case 'update_status': {
        const status = args?.status as AgentState['status'];
        const currentTask = args?.current_task as string | undefined;

        const stateFile = path.join(SESSION_DIR, `agent-${AGENT_NUM}-state.json`);
        const state = readJson<AgentState>(stateFile) || {
          agentId: AGENT_NUM,
          agentName: `Agent-${AGENT_NUM}`,
          status: 'pending',
          lastActive: null,
          currentTask: null,
          restarts: 0,
        };

        state.status = status;
        state.lastActive = new Date().toISOString();
        if (currentTask !== undefined) {
          state.currentTask = currentTask;
        }

        writeJson(stateFile, state);

        return {
          content: [{ type: 'text', text: `Status updated to: ${status}` }],
        };
      }

      case 'list_agents': {
        const agents: string[] = [];

        // Read all agent state files
        const files = fs.readdirSync(SESSION_DIR);
        for (const file of files) {
          if (file.match(/^agent-\d+-state\.json$/)) {
            const state = readJson<AgentState>(path.join(SESSION_DIR, file));
            if (state) {
              const icon =
                {
                  pending: '[.]',
                  running: '[*]',
                  idle: '[ ]',
                  blocked: '[X]',
                  complete: '[+]',
                  stopped: '[-]',
                }[state.status] || '[?]';

              agents.push(
                `${icon} Agent ${state.agentId}: ${state.agentName} - ${state.status}${state.currentTask ? ` (${state.currentTask})` : ''}`,
              );
            }
          }
        }

        return {
          content: [{ type: 'text', text: agents.length > 0 ? agents.join('\n') : 'No agents found.' }],
        };
      }

      case 'mark_complete': {
        const summary = args?.summary as string;

        const stateFile = path.join(SESSION_DIR, `agent-${AGENT_NUM}-state.json`);
        const state = readJson<AgentState>(stateFile);

        if (state) {
          state.status = 'complete';
          state.lastActive = new Date().toISOString();
          state.currentTask = summary;
          writeJson(stateFile, state);
        }

        // Write response file
        const responseFile = path.join(SESSION_DIR, `agent-${AGENT_NUM}-response.md`);
        fs.writeFileSync(
          responseFile,
          `---
from: agent-${AGENT_NUM}
timestamp: ${new Date().toISOString()}
status: complete
---

${summary}
`,
        );

        return {
          content: [{ type: 'text', text: `Marked as complete: ${summary}` }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Orchestra MCP server running');
}

main().catch(console.error);
