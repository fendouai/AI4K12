import os from "node:os";

function detectLanIPv4() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const item of list || []) {
      if (item.family === "IPv4" && !item.internal) {
        return item.address;
      }
    }
  }
  return "127.0.0.1";
}

export const config = {
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-prod",
  accessTokenTtlSeconds: 60 * 60 * 2,
  loginMaxAttempts: 5,
  lockMinutes: 15,
  defaultJoinCodeHours: 24,
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3000),
  defaultLanIp: detectLanIPv4(),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
  publicDomain: process.env.PUBLIC_DOMAIN || null,
  publicIp: process.env.PUBLIC_IP || null,
};

export function resolvePublicBaseUrl(customBaseUrl, settings = {}) {
  const domain = String(settings.publicDomain || config.publicDomain || "").trim();
  if (domain) {
    const normalized = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    return normalized.replace(/\/+$/, "");
  }
  const ip = String(settings.publicIp || config.publicIp || "").trim();
  if (ip) return `http://${ip}:${config.port}`;
  const v = String(customBaseUrl || "").trim();
  if (v) return v.replace(/\/+$/, "");
  if (config.publicBaseUrl) return String(config.publicBaseUrl).replace(/\/+$/, "");
  return `http://${config.defaultLanIp}:${config.port}`;
}

