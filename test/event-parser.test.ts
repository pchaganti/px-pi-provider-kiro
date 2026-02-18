import { describe, expect, it } from "vitest";
import { findJsonEnd, parseKiroEvent, parseKiroEvents } from "../src/event-parser.js";

describe("Feature 8: Stream Event Parsing", () => {
  describe("findJsonEnd", () => {
    it("finds end of simple object", () => {
      expect(findJsonEnd('{"content":"hello"}rest', 0)).toBe(18);
    });

    it("handles nested braces", () => {
      expect(findJsonEnd('{"input":{"cmd":"ls"}}rest', 0)).toBe(21);
    });

    it("handles escaped quotes", () => {
      expect(findJsonEnd('{"content":"say \\"hi\\""}rest', 0)).toBe(23);
    });

    it("returns -1 for incomplete JSON", () => {
      expect(findJsonEnd('{"content":"hel', 0)).toBe(-1);
    });

    it("respects start offset", () => {
      expect(findJsonEnd('garbage{"content":"hi"}', 7)).toBe(22);
    });
  });

  describe("parseKiroEvent", () => {
    it("parses content event", () => {
      expect(parseKiroEvent({ content: "Hello " })).toEqual({ type: "content", data: "Hello " });
    });

    it("parses toolUse event", () => {
      const e = parseKiroEvent({ name: "bash", toolUseId: "tc1", input: '{"cmd":"ls"}' });
      expect(e?.type).toBe("toolUse");
      expect(e?.type === "toolUse" && e.data.name).toBe("bash");
    });

    it("parses toolUse with stop", () => {
      const e = parseKiroEvent({ name: "bash", toolUseId: "tc1", input: "", stop: true });
      expect(e?.type === "toolUse" && e.data.stop).toBe(true);
    });

    it("parses toolUseInput", () => {
      expect(parseKiroEvent({ input: '"ls"}' })).toEqual({ type: "toolUseInput", data: { input: '"ls"}' } });
    });

    it("parses toolUseStop", () => {
      expect(parseKiroEvent({ stop: true })).toEqual({ type: "toolUseStop", data: { stop: true } });
    });

    it("parses contextUsage", () => {
      expect(parseKiroEvent({ contextUsagePercentage: 42.5 })).toEqual({
        type: "contextUsage",
        data: { contextUsagePercentage: 42.5 },
      });
    });

    it("returns null for unrecognized shape", () => {
      expect(parseKiroEvent({ unknown: true })).toBeNull();
    });
  });

  describe("parseKiroEvents", () => {
    it("parses single event", () => {
      const { events, remaining } = parseKiroEvents('{"content":"hello"}');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: "content", data: "hello" });
      expect(remaining).toBe("");
    });

    it("parses multiple events in one chunk", () => {
      const { events } = parseKiroEvents('{"content":"a"}{"content":"b"}{"content":"c"}');
      expect(events).toHaveLength(3);
    });

    it("returns remaining for incomplete JSON", () => {
      const { events, remaining } = parseKiroEvents('{"content":"done"}{"content":"incomp');
      expect(events).toHaveLength(1);
      expect(remaining).toContain("incomp");
    });

    it("handles mixed event types", () => {
      const buf = '{"content":"hi"}{"name":"bash","toolUseId":"t1","input":"{}"}{"contextUsagePercentage":50}';
      const { events } = parseKiroEvents(buf);
      expect(events.map((e) => e.type)).toEqual(["content", "toolUse", "contextUsage"]);
    });

    it("skips garbage between events", () => {
      const { events } = parseKiroEvents('garbage{"content":"hi"}more');
      expect(events).toHaveLength(1);
    });

    it("returns empty for empty buffer", () => {
      const { events } = parseKiroEvents("");
      expect(events).toHaveLength(0);
    });
  });
});
