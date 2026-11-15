import { describe, expect, it } from "vitest";
import { formatLastUsed, mcpEndpointFrom, scopeSummary } from "./tokenDisplay";

describe("formatLastUsed", () => {
  it("handles a never-used token and human ranges", () => {
    expect(formatLastUsed(null)).toBe("Never used");
    const now = new Date("2026-11-15T12:00:00Z");
    expect(formatLastUsed("2026-11-15T11:55:00Z", now)).toBe("Used 5 minutes ago");
    expect(formatLastUsed("2026-11-12T12:00:00Z", now)).toBe("Used 3 days ago");
  });

  it("uses singular units and a just-now bucket", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(formatLastUsed("2026-11-15T11:59:30Z", now)).toBe("Used just now");
    expect(formatLastUsed("2026-11-15T11:59:00Z", now)).toBe("Used 1 minute ago");
    expect(formatLastUsed("2026-11-15T11:00:00Z", now)).toBe("Used 1 hour ago");
    expect(formatLastUsed("2026-11-14T12:00:00Z", now)).toBe("Used 1 day ago");
  });

  it("falls back to a date for old usage and tolerates junk", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(formatLastUsed("2026-08-01T12:00:00Z", now)).toMatch(/^Used on /);
    expect(formatLastUsed("not a date", now)).toBe("Never used");
  });
});

describe("scopeSummary", () => {
  it("explains write access", () => {
    expect(scopeSummary(["notes:read"])).toBe("Read only");
    expect(scopeSummary(["notes:read", "notes:write"])).toBe("Read and write");
  });
});

describe("mcpEndpointFrom", () => {
  it("swaps the /api suffix for /mcp", () => {
    expect(mcpEndpointFrom("http://localhost:8080/api")).toBe("http://localhost:8080/mcp");
    expect(mcpEndpointFrom("https://api.noteflow.dev/api/")).toBe("https://api.noteflow.dev/mcp");
    expect(mcpEndpointFrom("https://api.noteflow.dev")).toBe("https://api.noteflow.dev/mcp");
  });
});
