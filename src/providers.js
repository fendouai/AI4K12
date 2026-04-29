import { db } from "./store.js";

const providerCatalog = {
  siliconflow: {
    name: "硅基流动 SiliconFlow",
    kind: "openai_compatible",
    listModels: async ({ apiKey, baseUrl }) => {
      const url = `${baseUrl}/v1/models`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
      return arr.map((m) => ({
        id: m?.id || m?.model || m?.name,
        displayName: m?.id || m?.model || m?.name,
        endpointType: "chat",
      }));
    },
    defaults: { baseUrl: "https://api.siliconflow.cn" },
  },
  zai: {
    name: "智谱 Z.AI / BigModel（GLM）",
    kind: "zhipu",
    listModels: async ({ apiKey }) => {
      const url = "https://open.bigmodel.cn/api/paas/v4/models";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
      return arr.map((m) => ({
        id: m?.id || m?.model || m?.name,
        displayName: m?.id || m?.model || m?.name,
        endpointType: "chat",
      }));
    },
  },
  moonshot: {
    name: "Moonshot / Kimi",
    kind: "openai_compatible",
    listModels: async ({ apiKey }) => {
      const url = "https://api.moonshot.ai/v1/models";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      const arr = Array.isArray(json?.data) ? json.data : [];
      return arr.map((m) => ({
        id: m?.id || m?.model || m?.name,
        displayName: m?.id || m?.model || m?.name,
        endpointType: "chat",
      }));
    },
  },
  deepseek: {
    name: "DeepSeek",
    kind: "openai_compatible",
    listModels: async ({ apiKey }) => {
      const url = "https://api.deepseek.com/models";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
      return arr.map((m) => ({
        id: m?.id || m?.model || m?.name,
        displayName: m?.id || m?.model || m?.name,
        endpointType: "chat",
      }));
    },
  },
  volcengine: {
    name: "火山引擎 VolcEngine（Doubao/Volcano Ark）",
    kind: "openai_compatible",
    defaults: { baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
    listModels: async ({ apiKey, baseUrl }) => {
      const url = `${baseUrl}/models`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
      return arr.map((m) => ({
        id: m?.id || m?.model || m?.name,
        displayName: m?.id || m?.model || m?.name,
        endpointType: "chat",
      }));
    },
  },
  dashscope: {
    name: "阿里 DashScope（Qwen）",
    kind: "static",
    listModels: async () => {
      // DashScope 目前没有可靠的“公开接口”用于拉取完整模型目录（通常需参考 Model Studio 的模型列表）。
      // 为了满足“有列表可选”的需求，这里先提供主流型号的静态目录。
      return [
        { id: "qwen-turbo", displayName: "qwen-turbo", endpointType: "chat" },
        { id: "qwen-plus", displayName: "qwen-plus", endpointType: "chat" },
        { id: "qwen-max", displayName: "qwen-max", endpointType: "chat" },
        { id: "qwen-72b", displayName: "qwen-72b", endpointType: "chat" },
        { id: "qwen2.5-coder-32b-instruct", displayName: "qwen2.5-coder-32b-instruct", endpointType: "chat" },
      ];
    },
  },
};

export function listSystemProviders() {
  return Object.entries(providerCatalog).map(([key, p]) => ({
    key,
    name: p.name,
    kind: p.kind,
  }));
}

export async function listProviderModels(providerKey) {
  const provider = providerCatalog[providerKey];
  if (!provider) throw new Error("UNKNOWN_PROVIDER");
  if (!provider.listModels) throw new Error("UNSUPPORTED_PROVIDER");

  if (provider.kind === "static") {
    return provider.listModels({});
  }

  const stored = db.systemProviderKeys[providerKey];
  if (!stored?.apiKey) throw new Error("PROVIDER_KEY_MISSING");
  const baseUrl = stored.baseUrl || provider.defaults?.baseUrl;
  return provider.listModels({ apiKey: stored.apiKey, baseUrl });
}

export function upsertProviderKey(providerKey, { apiKey, baseUrl }) {
  const provider = providerCatalog[providerKey];
  if (!provider) throw new Error("UNKNOWN_PROVIDER");
  db.systemProviderKeys[providerKey] = { apiKey, baseUrl, updatedAt: new Date().toISOString() };
}

export function getProviderCatalogKey(providerKey) {
  return providerCatalog[providerKey];
}

