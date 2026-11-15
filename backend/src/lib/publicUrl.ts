// The public origin of this backend, used in OAuth metadata documents and the
// 401 challenge. Read lazily so tests can pin PORT after the module loads.
export function mcpPublicUrl(): string {
  const configured = process.env.MCP_PUBLIC_URL?.trim();

  if (configured) return configured.replace(/\/+$/, "");

  return `http://localhost:${process.env.PORT ?? 8080}`;
}
