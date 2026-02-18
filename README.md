# pi-provider-kiro

A [pi](https://github.com/nicholasgasior/pi-coding-agent) provider extension that connects pi to the **Kiro API** (AWS CodeWhisperer/Q), giving you access to 17 models through a single provider.

## Models

| Family | Models | Context | Reasoning |
|--------|--------|---------|-----------|
| Claude Opus 4.6 | opus-4-6, opus-4-6-1m | 200K / 1M | ✓ |
| Claude Sonnet 4.6 | sonnet-4-6, sonnet-4-6-1m | 200K / 1M | ✓ |
| Claude Opus 4.5 | opus-4-5 | 200K | ✓ |
| Claude Sonnet 4.5 | sonnet-4-5, sonnet-4-5-1m | 200K / 1M | ✓ |
| Claude Sonnet 4 | sonnet-4 | 200K | ✓ |
| Claude Haiku 4.5 | haiku-4-5 | 200K | ✗ |
| DeepSeek 3.2 | deepseek-3-2 | 128K | ✓ |
| Kimi K2.5 | kimi-k2-5 | 200K | ✓ |
| MiniMax M2.1 | minimax-m2-1 | 128K | ✗ |
| GLM 4.7 | glm-4-7, glm-4-7-flash | 128K | ✓ / ✗ |
| Qwen3 Coder | qwen3-coder-next, qwen3-coder-480b | 128K | ✓ |
| AGI Nova | agi-nova-beta-1m | 1M | ✓ |

All models are free to use through Kiro.

## Setup

1. Install [kiro-cli](https://kiro.dev) or have an AWS Builder ID
2. Clone this repo into your pi extensions directory:

```bash
git clone <repo-url> pi-provider-kiro
cd pi-provider-kiro
npm install
npm run build
```

3. The extension auto-registers via `package.json` → `pi.extensions`:

```json
{
  "pi": {
    "extensions": ["./dist/index.js"]
  }
}
```

4. Log in:

```
/login kiro
```

This opens a browser for AWS Builder ID authentication. If you have kiro-cli installed and already logged in, credentials are picked up automatically.

## Usage

Once logged in, select any Kiro model in pi:

```
/model claude-sonnet-4-6
```

Reasoning is automatically enabled for supported models. Use `/reasoning` to adjust the thinking budget.

## Development

```bash
npm run build       # Compile TypeScript
npm run check       # Type check (no emit)
npm test            # Run all 108 tests
npm run test:watch  # Watch mode
```

## Architecture

The extension is organized as one feature per file:

```
src/
├── index.ts            # Extension registration
├── models.ts           # 17 model definitions + ID resolution
├── oauth.ts            # AWS Builder ID OAuth flow
├── kiro-cli.ts         # kiro-cli credential fallback
├── transform.ts        # Message format conversion
├── history.ts          # Conversation history management
├── thinking-parser.ts  # Streaming <thinking> tag parser
├── event-parser.ts     # Kiro stream event parser
└── stream.ts           # Main streaming orchestrator
```

See [AGENTS.md](AGENTS.md) for detailed development guidance and [.agents/summary/](/.agents/summary/index.md) for full architecture documentation.

## License

Private — not published to npm.
