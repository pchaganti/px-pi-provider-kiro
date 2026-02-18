// Feature 8: Kiro Stream Event Parsing

export type KiroStreamEvent =
  | { type: "content"; data: string }
  | { type: "toolUse"; data: { name: string; toolUseId: string; input: string; stop?: boolean } }
  | { type: "toolUseInput"; data: { input: string } }
  | { type: "toolUseStop"; data: { stop: boolean } }
  | { type: "contextUsage"; data: { contextUsagePercentage: number } };

export function findJsonEnd(text: string, start: number): number {
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
        if (braceCount === 0) return i;
      }
    }
  }
  return -1;
}

export function parseKiroEvent(parsed: Record<string, unknown>): KiroStreamEvent | null {
  if (parsed.content !== undefined) return { type: "content", data: parsed.content as string };
  if (parsed.name && parsed.toolUseId) {
    const input = typeof parsed.input === "string" ? parsed.input : parsed.input ? JSON.stringify(parsed.input) : "";
    return {
      type: "toolUse",
      data: {
        name: parsed.name as string,
        toolUseId: parsed.toolUseId as string,
        input,
        stop: parsed.stop as boolean | undefined,
      },
    };
  }
  if (parsed.input !== undefined && !parsed.name) {
    return {
      type: "toolUseInput",
      data: { input: typeof parsed.input === "string" ? parsed.input : JSON.stringify(parsed.input) },
    };
  }
  if (parsed.stop !== undefined && parsed.contextUsagePercentage === undefined)
    return { type: "toolUseStop", data: { stop: parsed.stop as boolean } };
  if (parsed.contextUsagePercentage !== undefined)
    return { type: "contextUsage", data: { contextUsagePercentage: parsed.contextUsagePercentage as number } };
  return null;
}

export function parseKiroEvents(buffer: string): { events: KiroStreamEvent[]; remaining: string } {
  const events: KiroStreamEvent[] = [];
  let remaining = buffer;
  let searchStart = 0;
  const patterns = ['{"content":', '{"name":', '{"input":', '{"stop":', '{"contextUsagePercentage":'];
  let incompleteJson = false;
  while (true) {
    const candidates = patterns.map((p) => remaining.indexOf(p, searchStart)).filter((pos) => pos >= 0);
    if (candidates.length === 0) break;
    const jsonStart = Math.min(...candidates);
    const jsonEnd = findJsonEnd(remaining, jsonStart);
    if (jsonEnd < 0) {
      remaining = remaining.substring(jsonStart);
      incompleteJson = true;
      break;
    }
    try {
      const parsed = JSON.parse(remaining.substring(jsonStart, jsonEnd + 1));
      const event = parseKiroEvent(parsed);
      if (event) events.push(event);
    } catch {
      /* skip */
    }
    searchStart = jsonEnd + 1;
    if (searchStart >= remaining.length) {
      remaining = "";
      break;
    }
  }
  if (!incompleteJson && searchStart > 0 && remaining.length > 0) remaining = remaining.substring(searchStart);
  return { events, remaining };
}
