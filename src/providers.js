import { db } from "./store.js";
import { upsertProviderKeyPersistent } from "./system-config-db.js";

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
    defaults: { baseUrl: "https://api.moonshot.ai" },
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
    defaults: { baseUrl: "https://api.deepseek.com" },
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
  upsertProviderKeyPersistent(providerKey, { apiKey, baseUrl });
}

export function getProviderCatalogKey(providerKey) {
  return providerCatalog[providerKey];
}

/** Text-to-image via OpenAI-compatible POST /v1/images/generations. SiliconFlow uses image_size + batch_size. */
export async function callProviderTextToImage(providerKey, { apiKey, baseUrl, model, prompt, size, n = 1 }) {
  const catalog = providerCatalog[providerKey];
  const normalizedBase = String(baseUrl || catalog?.defaults?.baseUrl || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalizedBase)) {
    throw new Error("PROVIDER_BASE_URL_INVALID");
  }
  const url = `${normalizedBase}/v1/images/generations`;
  const isSiliconflow = providerKey === "siliconflow";
  /** @type {Record<string, unknown>} */
  const body = isSiliconflow
    ? {
        model,
        prompt,
        image_size: size || "1024x1024",
        batch_size: Math.min(4, Math.max(1, n)),
      }
    : {
        model,
        prompt,
        size: size || "1024x1024",
        n: Math.min(4, Math.max(1, n)),
      };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || json?.message || `UPSTREAM_HTTP_${res.status}`);
  }
  const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json?.images) ? json.images : [];
  const first = arr[0];
  const imageUrl = first?.url || first?.image_url || (typeof first === "string" ? first : null);
  const b64 = first?.b64_json;
  if (!imageUrl && !b64) {
    throw new Error("UPSTREAM_IMAGE_EMPTY");
  }
  return { imageUrl: imageUrl || null, b64: b64 || null, raw: json };
}
