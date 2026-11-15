import api from "./axiosInstance";

export type McpScope = "notes:read" | "notes:write";

export interface ApiToken {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ConnectedApp {
  clientId: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
}

interface CreateTokenInput {
  name: string;
  scopes: McpScope[];
}

export const getTokens = async (): Promise<ApiToken[]> => {
  const response = await api.get("/mcp/tokens");
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return Array.isArray(data.tokens) ? data.tokens : [];
};

export const createToken = async (
  input: CreateTokenInput
): Promise<{ token: string; apiToken: ApiToken }> => {
  const response = await api.post("/mcp/tokens", input);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return {
    token: data.token,
    apiToken: { ...data.apiToken, lastUsedAt: null },
  };
};

export const revokeToken = async (id: number): Promise<void> => {
  const response = await api.delete(`/mcp/tokens/${id}`);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
};

export const getApps = async (): Promise<ConnectedApp[]> => {
  const response = await api.get("/mcp/apps");
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return Array.isArray(data.apps) ? data.apps : [];
};

export const revokeApp = async (clientId: string): Promise<void> => {
  const response = await api.delete(`/mcp/apps/${encodeURIComponent(clientId)}`);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
};
