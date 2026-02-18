import type { Api, AssistantMessageEvent, Context, Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { streamKiro } from "../src/stream.js";

function makeModel(overrides?: Partial<Model<Api>>): Model<Api> {
  return {
    id: "claude-sonnet-4-5",
    name: "Sonnet",
    api: "kiro-api",
    provider: "kiro",
    baseUrl: "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 65536,
    ...overrides,
  };
}

function makeContext(userMsg = "Hello"): Context {
  return {
    systemPrompt: "You are helpful",
    messages: [{ role: "user", content: userMsg, timestamp: Date.now() }],
    tools: [],
  };
}

async function collect(stream: ReturnType<typeof streamKiro>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = [];
  for await (const e of stream) {
    events.push(e);
    if (e.type === "done" || e.type === "error") {
      return events;
    }
  }
  return events;
}

describe("Feature 9: Streaming Integration", () => {
  it("emits error when no credentials provided", async () => {
    const stream = streamKiro(makeModel(), makeContext(), {});
    const events = await collect(stream);
    const error = events.find((e) => e.type === "error");
    expect(error).toBeDefined();
    expect(error?.type === "error" && error.error.errorMessage).toContain("/login kiro");
  });

  it("emits error with reason 'aborted' when signal is aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const stream = streamKiro(makeModel(), makeContext(), { signal: ac.signal });
    const events = await collect(stream);
    const error = events.find((e) => e.type === "error");
    expect(error).toBeDefined();
    expect(error?.type === "error" && error.error.stopReason).toBe("aborted");
  });

  it("makes POST to correct endpoint with auth header", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('{"content":"Hi"}{"contextUsagePercentage":10}'),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    const stream = streamKiro(makeModel(), makeContext(), { apiKey: "test-token" });
    const events = await collect(stream);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("generateAssistantResponse");
    expect(opts.headers.Authorization).toBe("Bearer test-token");

    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    const msg = done?.type === "done" ? done.message : undefined;
    expect(msg?.content.some((b) => b.type === "text" && b.text.includes("Hi"))).toBe(true);

    // contextUsagePercentage=10 with contextWindow=200000 → input should be 20000
    expect(msg?.usage.input).toBe(20000);
    expect(msg?.usage.totalTokens).toBeGreaterThan(20000);

    vi.unstubAllGlobals();
  });

  it("sets stopReason to toolUse when tool calls are present", async () => {
    const toolPayload = '{"name":"bash","toolUseId":"tc1","input":"{\\"cmd\\":\\"ls\\"}","stop":true}';
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(`${toolPayload}{"contextUsagePercentage":20}`),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    const stream = streamKiro(makeModel(), makeContext(), { apiKey: "tok" });
    const events = await collect(stream);
    const done = events.find((e) => e.type === "done");
    expect(done?.type === "done" && done.reason).toBe("toolUse");

    vi.unstubAllGlobals();
  });

  it("retries on 413 with reduced history", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 413,
        statusText: "Too Large",
        text: () => Promise.resolve("CONTENT_LENGTH_EXCEEDS_THRESHOLD"),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('{"content":"ok"}{"contextUsagePercentage":5}'),
              })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });
    vi.stubGlobal("fetch", mockFetch);

    const stream = streamKiro(makeModel(), makeContext(), { apiKey: "tok" });
    const events = await collect(stream);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(events.find((e) => e.type === "done")).toBeDefined();

    vi.unstubAllGlobals();
  });
});
