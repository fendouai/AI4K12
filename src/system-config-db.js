import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isPersistenceEnabled = process.env.NODE_ENV !== "test";

let sqlite;

function getSqlite() {
  if (!isPersistenceEnabled) return null;
  if (sqlite) return sqlite;

  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.CONFIG_DB_PATH || path.join(dataDir, "ai4k12.db");
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  return sqlite;
}

export function initSystemConfigDb() {
  const db = getSqlite();
  if (!db) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_keys (
      provider_key TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      base_url TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_policies (
      teacher_email TEXT NOT NULL,
      class_name TEXT NOT NULL,
      chat_provider_key TEXT,
      image_provider_key TEXT,
      chat_models_json TEXT NOT NULL DEFAULT '[]',
      image_models_json TEXT NOT NULL DEFAULT '[]',
      keyword_whitelist_json TEXT NOT NULL DEFAULT '[]',
      keyword_blacklist_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (teacher_email, class_name)
    );
  `);

  const cols = db.prepare("PRAGMA table_info(class_policies)").all();
  if (!cols.some((c) => c.name === "image_provider_key")) {
    db.exec("ALTER TABLE class_policies ADD COLUMN image_provider_key TEXT");
  }
}

export function loadPersistedSystemConfig() {
  const db = getSqlite();
  if (!db) return { publicBaseUrl: null, publicDomain: null, publicIp: null, providerKeys: {}, classPolicies: [] };

  const settingRows = db.prepare("SELECT key, value FROM system_settings").all();
  const settingsMap = Object.fromEntries(settingRows.map((x) => [x.key, x.value]));
  const providerRows = db.prepare("SELECT provider_key, api_key, base_url, updated_at FROM provider_keys").all();
  const classPolicyRows = db.prepare(`
    SELECT
      teacher_email,
      class_name,
      chat_provider_key,
      image_provider_key,
      chat_models_json,
      image_models_json,
      keyword_whitelist_json,
      keyword_blacklist_json
    FROM class_policies
  `).all();

  const providerKeys = {};
  for (const item of providerRows) {
    providerKeys[item.provider_key] = {
      apiKey: item.api_key,
      baseUrl: item.base_url || undefined,
      updatedAt: item.updated_at,
    };
  }

  return {
    publicBaseUrl: settingsMap.public_base_url || null,
    publicDomain: settingsMap.public_domain || null,
    publicIp: settingsMap.public_ip || null,
    providerKeys,
    classPolicies: classPolicyRows.map((x) => ({
      teacherEmail: x.teacher_email,
      className: x.class_name,
      chatProviderKey: x.chat_provider_key || null,
      imageProviderKey: x.image_provider_key || null,
      chatModels: safeParseJsonArray(x.chat_models_json),
      imageModels: safeParseJsonArray(x.image_models_json),
      keywordWhitelist: safeParseJsonArray(x.keyword_whitelist_json),
      keywordBlacklist: safeParseJsonArray(x.keyword_blacklist_json),
    })),
  };
}

export function savePublicBaseUrl(publicBaseUrl) {
  saveSystemSetting("public_base_url", publicBaseUrl);
}

export function savePublicDomain(publicDomain) {
  saveSystemSetting("public_domain", publicDomain);
}

export function savePublicIp(publicIp) {
  saveSystemSetting("public_ip", publicIp);
}

function saveSystemSetting(key, value) {
  const db = getSqlite();
  if (!db) return;

  if (!value) {
    db.prepare("DELETE FROM system_settings WHERE key = ?").run(key);
    return;
  }

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run({
    key,
    value,
    updatedAt: new Date().toISOString(),
  });
}

export function upsertProviderKeyPersistent(providerKey, { apiKey, baseUrl }) {
  const db = getSqlite();
  if (!db) return;

  db.prepare(`
    INSERT INTO provider_keys (provider_key, api_key, base_url, updated_at)
    VALUES (@providerKey, @apiKey, @baseUrl, @updatedAt)
    ON CONFLICT(provider_key) DO UPDATE SET
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      updated_at = excluded.updated_at
  `).run({
    providerKey,
    apiKey,
    baseUrl: baseUrl || null,
    updatedAt: new Date().toISOString(),
  });
}

export function upsertClassPolicyPersistent({
  teacherEmail,
  className,
  chatProviderKey,
  imageProviderKey,
  chatModels = [],
  imageModels = [],
  keywordWhitelist = [],
  keywordBlacklist = [],
}) {
  const db = getSqlite();
  if (!db) return;

  db.prepare(`
    INSERT INTO class_policies (
      teacher_email,
      class_name,
      chat_provider_key,
      image_provider_key,
      chat_models_json,
      image_models_json,
      keyword_whitelist_json,
      keyword_blacklist_json,
      updated_at
    )
    VALUES (
      @teacherEmail,
      @className,
      @chatProviderKey,
      @imageProviderKey,
      @chatModelsJson,
      @imageModelsJson,
      @keywordWhitelistJson,
      @keywordBlacklistJson,
      @updatedAt
    )
    ON CONFLICT(teacher_email, class_name) DO UPDATE SET
      chat_provider_key = excluded.chat_provider_key,
      image_provider_key = excluded.image_provider_key,
      chat_models_json = excluded.chat_models_json,
      image_models_json = excluded.image_models_json,
      keyword_whitelist_json = excluded.keyword_whitelist_json,
      keyword_blacklist_json = excluded.keyword_blacklist_json,
      updated_at = excluded.updated_at
  `).run({
    teacherEmail,
    className,
    chatProviderKey: chatProviderKey || null,
    imageProviderKey: imageProviderKey ?? null,
    chatModelsJson: JSON.stringify(chatModels || []),
    imageModelsJson: JSON.stringify(imageModels || []),
    keywordWhitelistJson: JSON.stringify(keywordWhitelist || []),
    keywordBlacklistJson: JSON.stringify(keywordBlacklist || []),
    updatedAt: new Date().toISOString(),
  });
}

function safeParseJsonArray(value) {
  try {
    const arr = JSON.parse(value || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
