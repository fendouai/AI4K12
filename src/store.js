import { randomUUID } from "node:crypto";

export const db = {
  grades: [],
  teachers: [],
  classes: [],
  students: [],
  sessions: [],
  usageLogs: [],
  safetyEvents: [],
  systemProviderKeys: {}, // { [providerKey]: { apiKey, baseUrl, updatedAt } }
};

export function nowIso() {
  return new Date().toISOString();
}

export function genId() {
  return randomUUID();
}

export function randomCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function classDailyUsage(classId) {
  const today = new Date().toISOString().slice(0, 10);
  const logs = db.usageLogs.filter((x) => x.classId === classId && x.createdAt.startsWith(today));
  return {
    requests: logs.length,
    tokens: logs.reduce((sum, x) => sum + x.promptTokens + x.completionTokens, 0),
    images: logs.reduce((sum, x) => sum + x.imageCount, 0),
  };
}

export function studentDailyUsage(studentId) {
  const today = new Date().toISOString().slice(0, 10);
  const logs = db.usageLogs.filter((x) => x.studentId === studentId && x.createdAt.startsWith(today));
  return {
    requests: logs.length,
    tokens: logs.reduce((sum, x) => sum + x.promptTokens + x.completionTokens, 0),
    images: logs.reduce((sum, x) => sum + x.imageCount, 0),
  };
}

