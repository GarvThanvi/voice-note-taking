import { signInternalToken } from "../lib/internalJwt.js";

export interface ApiResponse {
  ok: boolean;
  status: number;
  data: any;
}

export interface NoteFlowApi {
  get(path: string): Promise<ApiResponse>;
  post(path: string, body: unknown): Promise<ApiResponse>;
  put(path: string, body: unknown): Promise<ApiResponse>;
  del(path: string): Promise<ApiResponse>;
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

// Resolved per request so a test can pin PORT before the first call.
const baseUrl = (): string =>
  `http://127.0.0.1:${process.env.PORT ?? 8080}/internal`;

export function createApi(userId: number): NoteFlowApi {
  const call = async (
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse> => {
    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        // Minted per call: internal tokens live for five minutes.
        Authorization: `Bearer ${signInternalToken(userId)}`,
        "X-NoteFlow-Internal": process.env.MCP_INTERNAL_SECRET ?? "",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const data = await response.json().catch(() => null);

    return { ok: response.ok, status: response.status, data };
  };

  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    put: (path, body) => call("PUT", path, body),
    del: (path) => call("DELETE", path),
  };
}
