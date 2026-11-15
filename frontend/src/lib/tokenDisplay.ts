const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

export const formatLastUsed = (
  iso: string | null,
  now: Date = new Date()
): string => {
  if (!iso) return "Never used";

  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Never used";

  const elapsed = Math.max(0, now.getTime() - then.getTime());

  if (elapsed < MINUTE) return "Used just now";
  if (elapsed < HOUR) return `Used ${plural(Math.floor(elapsed / MINUTE), "minute")} ago`;
  if (elapsed < DAY) return `Used ${plural(Math.floor(elapsed / HOUR), "hour")} ago`;
  if (elapsed < 30 * DAY) return `Used ${plural(Math.floor(elapsed / DAY), "day")} ago`;

  return `Used on ${then.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
};

export const scopeSummary = (scopes: string[]): string =>
  scopes.includes("notes:write") ? "Read and write" : "Read only";

// The API base is configured as ".../api"; the MCP endpoint sits beside it at
// the backend root.
export const mcpEndpointFrom = (apiBaseUrl: string): string => {
  const trimmed = apiBaseUrl.trim().replace(/\/+$/, "");
  const root = trimmed.replace(/\/api$/, "");
  return `${root}/mcp`;
};
