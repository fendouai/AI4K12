import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRequired, errorResp, okResp, signToken } from "./auth.js";
import { config } from "./config.js";
import { classDailyUsage, db, genId, nowIso, randomCode, studentDailyUsage } from "./store.js";
import { getProviderCatalogKey, listProviderModels, listSystemProviders, upsertProviderKey } from "./providers.js";

const app = express();
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "..", "web")));

function ensureDefaultTeacher() {
  const email = "fendouai@gmail.com";
  const password = "wo2010WO";
  const existing = db.teachers.find((t) => t.email === email);
  if (existing) return existing;
  const teacher = {
    id: genId(),
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    fullName: "Default Teacher",
    schoolName: "AI4K12 Demo School",
    status: "active",
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.teachers.push(teacher);
  return teacher;
}

ensureDefaultTeacher();

function ensureSchoolSeed() {
  const teacherEmail = "fendouai@gmail.com";
  const teacher = db.teachers.find((t) => t.email === teacherEmail);
  if (!teacher) return;

  // If grades already exist, assume seed is present.
  const existingGradeCount = db.grades.filter((g) => g.teacherId === teacher.id).length;
  const shouldSeed = existingGradeCount === 0;
  if (!shouldSeed) return;

  const k12Grades = [
    "小学1年级",
    "小学2年级",
    "小学3年级",
    "小学4年级",
    "小学5年级",
    "小学6年级",
    "初中1年级",
    "初中2年级",
    "初中3年级",
    "高中1年级",
    "高中2年级",
    "高中3年级",
  ];

  // 1) grades
  for (const name of k12Grades) {
    if (db.grades.some((g) => g.teacherId === teacher.id && g.name === name)) continue;
    db.grades.push({ id: genId(), teacherId: teacher.id, name, createdAt: nowIso(), updatedAt: nowIso() });
  }

  // 2) classes (one per grade, seatLimit 50)
  for (const gradeName of k12Grades) {
    const className = `${gradeName}A班`;
    const existing = db.classes.find((c) => c.teacherId === teacher.id && c.className === className);
    if (existing) continue;
    db.classes.push({
      id: genId(),
      teacherId: teacher.id,
      className,
      gradeLevel: gradeName,
      seatLimit: 50,
      strictMode: false,
      examMode: false,
      dailyTokenQuota: 2000000,
      dailyImageQuota: 100,
      rpmQuota: 120,
      joinCode: randomCode(6),
      joinCodeExpiresAt: hoursLater(config.defaultJoinCodeHours),
      joinCodeMaxUses: 50,
      joinCodeUsedCount: 0,
      teacherVerificationCode: randomCode(8),
      keywordWhitelist: [],
      keywordBlacklist: [],
      allowedChatModels: ["deepseek-v3"],
      studentDefaultLimits: {
        dailyRequests: 200,
        dailyTokens: 100000,
        dailyImages: 10,
        dailyVideos: 3,
        dailyStorybooks: 5,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  // 3) one class with 50 students: 初中1年级A班
  const targetClassName = "初中1年级A班";
  const targetClass = db.classes.find((c) => c.teacherId === teacher.id && c.className === targetClassName);
  if (!targetClass) return;

  const existingStudentsCount = db.students.filter((s) => s.classId === targetClass.id).length;
  const targetCount = 50;
  const toCreate = Math.max(0, targetCount - existingStudentsCount);
  if (toCreate <= 0) return;

  for (let i = 1; i <= toCreate; i += 1) {
    const idx = existingStudentsCount + i;
    const studentNo = `S${String(idx).padStart(3, "0")}`;
    const loginCode = "wo2010WO"; // seeded demo code
    db.students.push({
      id: genId(),
      classId: targetClass.id,
      studentNo,
      displayName: `学生${studentNo}`,
      loginCodeHash: bcrypt.hashSync(loginCode, 8),
      mustResetPassword: true,
      passwordHash: null,
      status: "active",
      bannedUntil: null,
      banReason: null,
      limits: { ...targetClass.studentDefaultLimits },
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
}

// Only auto-seed outside of automated test runs.
if (process.env.NODE_ENV !== "test") {
  ensureSchoolSeed();
}

// Dev helper: reseed K12 demo data (clears grades/classes/students for the default teacher).
app.post("/api/v1/dev/seed-k12", authRequired("teacher"), (req, res) => {
  const teacher = db.teachers.find((t) => t.id === req.auth.sub);
  if (!teacher || teacher.email !== "fendouai@gmail.com") {
    return res.status(403).json(errorResp("FORBIDDEN", "Only default teacher can seed demo data", req.id));
  }
  db.grades = db.grades.filter((g) => g.teacherId !== teacher.id);
  db.classes = db.classes.filter((c) => c.teacherId !== teacher.id);
  db.students = db.students.filter((s) => {
    const cls = db.classes.find((c) => c.id === s.classId);
    return Boolean(cls);
  });
  // Recreate.
  ensureSchoolSeed();
  return res.json(okResp(req.id, { seeded: true }));
});

// -----------------------------
// System Provider Keys & Model Lists
// -----------------------------
app.get("/api/v1/system/providers", authRequired("teacher"), (req, res) => {
  return res.json(okResp(req.id, { providers: listSystemProviders() }));
});

app.put("/api/v1/system/providers/:providerKey/keys", authRequired("teacher"), async (req, res) => {
  const schema = z.object({
    apiKey: z.string().min(8),
    baseUrl: z.string().min(4).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  try {
    upsertProviderKey(req.params.providerKey, { apiKey: parsed.data.apiKey, baseUrl: parsed.data.baseUrl });
    return res.json(okResp(req.id, { updated: true, providerKey: req.params.providerKey }));
  } catch (e) {
    return res.status(400).json(errorResp("PROVIDER_KEY_SAVE_FAILED", String(e?.message || e), req.id));
  }
});

app.get("/api/v1/system/providers/:providerKey/models", authRequired("teacher"), async (req, res) => {
  try {
    const models = await listProviderModels(req.params.providerKey);
    return res.json(okResp(req.id, { providerKey: req.params.providerKey, models }));
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === "PROVIDER_KEY_MISSING") return res.status(409).json(errorResp("PROVIDER_KEY_MISSING", "Please configure provider API key first", req.id));
    return res.status(502).json(errorResp("PROVIDER_MODEL_LIST_FAILED", msg, req.id));
  }
});

app.use((req, _res, next) => {
  req.id = `req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  next();
});

function minutesLater(mins) {
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

function hoursLater(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function teacherFromAuth(req) {
  return db.teachers.find((t) => t.id === req.auth.sub);
}

function classById(classId) {
  return db.classes.find((c) => c.id === classId);
}

function normalizeKeywords(list = []) {
  return [...new Set(list.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
}

function checkKeywordPolicy(cls, text) {
  const normalizedText = String(text || "").toLowerCase();
  const blacklisted = cls.keywordBlacklist.find((k) => normalizedText.includes(k));
  if (blacklisted) {
    return { ok: false, code: "KEYWORD_BLACKLIST_BLOCKED", keyword: blacklisted };
  }
  if (cls.keywordWhitelist.length > 0) {
    const matched = cls.keywordWhitelist.some((k) => normalizedText.includes(k));
    if (!matched) {
      return { ok: false, code: "KEYWORD_WHITELIST_REQUIRED", keyword: null };
    }
  }
  return { ok: true };
}

function enforceStudentPolicy(req, res, student, cls, { promptText = "", imageCount = 0 }) {
  if (student.status === "disabled" || student.bannedUntil) {
    const isStillBanned = student.bannedUntil === "permanent" || new Date(student.bannedUntil) > new Date();
    if (isStillBanned) {
      return res.status(403).json(errorResp("STUDENT_BANNED", "Student account is banned", req.id));
    }
  }
  const kw = checkKeywordPolicy(cls, promptText);
  if (!kw.ok) {
    return res.status(403).json(errorResp(kw.code, "Prompt violates class keyword policy", req.id, { keyword: kw.keyword }));
  }
  const sUsage = studentDailyUsage(student.id);
  if (sUsage.requests >= student.limits.dailyRequests) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_STUDENT_REQUESTS", "Student daily request quota exceeded", req.id));
  }
  if (imageCount > 0 && sUsage.images + imageCount > student.limits.dailyImages) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_STUDENT_IMAGES", "Student daily image quota exceeded", req.id));
  }
  return null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai4k12-mvp" });
});

app.post("/api/v1/teacher/register", (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(1),
    schoolName: z.string().min(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id, parsed.error.format()));
  }
  const { email, password, fullName, schoolName } = parsed.data;
  if (db.teachers.some((t) => t.email === email)) {
    return res.status(409).json(errorResp("TEACHER_EXISTS", "Email already registered", req.id));
  }
  const teacher = {
    id: genId(),
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    fullName,
    schoolName: schoolName || null,
    status: "active",
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.teachers.push(teacher);
  return res.status(201).json(okResp(req.id, { teacherId: teacher.id }));
});

app.post("/api/v1/teacher/login", (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const { email, password } = parsed.data;
  const teacher = db.teachers.find((t) => t.email === email);
  if (!teacher) {
    return res.status(401).json(errorResp("AUTH_INVALID_CREDENTIALS", "Invalid email or password", req.id));
  }
  if (teacher.lockedUntil && new Date(teacher.lockedUntil) > new Date()) {
    return res.status(423).json(errorResp("AUTH_ACCOUNT_LOCKED", "Account is temporarily locked", req.id));
  }
  if (!bcrypt.compareSync(password, teacher.passwordHash)) {
    teacher.failedLoginAttempts += 1;
    if (teacher.failedLoginAttempts >= config.loginMaxAttempts) {
      teacher.lockedUntil = minutesLater(config.lockMinutes);
      teacher.failedLoginAttempts = 0;
    }
    return res.status(401).json(errorResp("AUTH_INVALID_CREDENTIALS", "Invalid email or password", req.id));
  }
  teacher.failedLoginAttempts = 0;
  teacher.lockedUntil = null;
  teacher.lastLoginAt = nowIso();
  const accessToken = signToken({ sub: teacher.id, role: "teacher" });
  const refreshToken = randomCode(24);
  db.sessions.push({ id: genId(), actorType: "teacher", actorId: teacher.id, refreshToken, createdAt: nowIso() });
  return res.json(
    okResp(req.id, {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSeconds,
      teacher: { id: teacher.id, fullName: teacher.fullName, email: teacher.email },
    }),
  );
});

app.post("/api/v1/classes", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    className: z.string().min(1),
    gradeLevel: z.string().optional(),
    seatLimit: z.number().int().min(1).max(500).default(50),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const teacher = teacherFromAuth(req);
  const classObj = {
    id: genId(),
    teacherId: teacher.id,
    className: parsed.data.className,
    gradeLevel: parsed.data.gradeLevel || null,
    seatLimit: parsed.data.seatLimit,
    strictMode: false,
    examMode: false,
    dailyTokenQuota: 2_000_000,
    dailyImageQuota: 100,
    rpmQuota: 120,
    joinCode: randomCode(6),
    joinCodeExpiresAt: hoursLater(config.defaultJoinCodeHours),
    joinCodeMaxUses: parsed.data.seatLimit,
    joinCodeUsedCount: 0,
    teacherVerificationCode: randomCode(8),
    keywordWhitelist: [],
    keywordBlacklist: [],
    allowedChatModels: ["deepseek-v3"],
    studentDefaultLimits: {
      dailyRequests: 200,
      dailyTokens: 100000,
      dailyImages: 10,
      dailyVideos: 3,
      dailyStorybooks: 5,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.classes.push(classObj);
  return res.status(201).json(
    okResp(req.id, {
      classId: classObj.id,
      joinCode: classObj.joinCode,
      joinCodeExpiresAt: classObj.joinCodeExpiresAt,
      teacherVerificationCode: classObj.teacherVerificationCode,
    }),
  );
});

app.post("/api/v1/grades", authRequired("teacher"), (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(50) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const name = parsed.data.name.trim();
  if (db.grades.some((g) => g.teacherId === req.auth.sub && g.name === name)) {
    return res.status(409).json(errorResp("GRADE_EXISTS", "Grade already exists", req.id));
  }
  const grade = { id: genId(), teacherId: req.auth.sub, name, createdAt: nowIso(), updatedAt: nowIso() };
  db.grades.push(grade);
  return res.status(201).json(okResp(req.id, { gradeId: grade.id, name: grade.name }));
});

app.get("/api/v1/grades", authRequired("teacher"), (req, res) => {
  const grades = db.grades.filter((g) => g.teacherId === req.auth.sub).map((g) => ({ gradeId: g.id, name: g.name }));
  return res.json(okResp(req.id, { grades }));
});

app.put("/api/v1/grades/:gradeId", authRequired("teacher"), (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(50) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const grade = db.grades.find((g) => g.id === req.params.gradeId && g.teacherId === req.auth.sub);
  if (!grade) return res.status(404).json(errorResp("GRADE_NOT_FOUND", "Grade not found", req.id));
  grade.name = parsed.data.name.trim();
  grade.updatedAt = nowIso();
  return res.json(okResp(req.id, { gradeId: grade.id, name: grade.name }));
});

app.delete("/api/v1/grades/:gradeId", authRequired("teacher"), (req, res) => {
  const idx = db.grades.findIndex((g) => g.id === req.params.gradeId && g.teacherId === req.auth.sub);
  if (idx < 0) return res.status(404).json(errorResp("GRADE_NOT_FOUND", "Grade not found", req.id));
  const [grade] = db.grades.splice(idx, 1);
  db.classes.forEach((c) => {
    if (c.teacherId === req.auth.sub && c.gradeLevel === grade.name) c.gradeLevel = null;
  });
  return res.json(okResp(req.id, { deleted: true, gradeId: grade.id }));
});

app.get("/api/v1/classes", authRequired("teacher"), (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
  const filtered = db.classes
    .filter((c) => c.teacherId === req.auth.sub)
    .filter((c) => !q || c.className.toLowerCase().includes(q) || String(c.gradeLevel || "").toLowerCase().includes(q));
  const total = filtered.length;
  const classes = filtered.slice((page - 1) * pageSize, page * pageSize).map((c) => ({
    classId: c.id,
    className: c.className,
    gradeLevel: c.gradeLevel,
    seatLimit: c.seatLimit,
    seatUsed: db.students.filter((s) => s.classId === c.id).length,
  }));
  return res.json(okResp(req.id, { classes, pagination: { page, pageSize, total } }));
});

app.get("/api/v1/classes/:classId", authRequired("teacher"), (req, res) => {
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const seatUsed = db.students.filter((s) => s.classId === cls.id).length;
  return res.json(
    okResp(req.id, {
      classId: cls.id,
      className: cls.className,
      gradeLevel: cls.gradeLevel,
      seatLimit: cls.seatLimit,
      seatUsed,
    }),
  );
});

app.put("/api/v1/classes/:classId", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    className: z.string().min(1).optional(),
    gradeLevel: z.string().min(1).nullable().optional(),
    seatLimit: z.number().int().min(1).max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const seatUsed = db.students.filter((s) => s.classId === cls.id).length;
  if (parsed.data.seatLimit && parsed.data.seatLimit < seatUsed) {
    return res.status(409).json(errorResp("CLASS_SEAT_LIMIT_TOO_SMALL", "Seat limit smaller than current students", req.id));
  }
  if (parsed.data.className) cls.className = parsed.data.className;
  if (Object.prototype.hasOwnProperty.call(parsed.data, "gradeLevel")) cls.gradeLevel = parsed.data.gradeLevel;
  if (parsed.data.seatLimit) cls.seatLimit = parsed.data.seatLimit;
  cls.updatedAt = nowIso();
  return res.json(okResp(req.id, { classId: cls.id, className: cls.className, gradeLevel: cls.gradeLevel, seatLimit: cls.seatLimit }));
});

app.delete("/api/v1/classes/:classId", authRequired("teacher"), (req, res) => {
  const clsIdx = db.classes.findIndex((c) => c.id === req.params.classId && c.teacherId === req.auth.sub);
  if (clsIdx < 0) return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  const classId = db.classes[clsIdx].id;
  db.classes.splice(clsIdx, 1);
  db.students = db.students.filter((s) => s.classId !== classId);
  return res.json(okResp(req.id, { deleted: true, classId }));
});

app.post("/api/v1/classes/:classId/students/batch-generate", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    count: z.number().int().min(1).max(200),
    namingRule: z.string().default("S{index}"),
    defaultPasswordResetRequired: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const classObj = classById(req.params.classId);
  if (!classObj || classObj.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const existing = db.students.filter((s) => s.classId === classObj.id).length;
  if (existing + parsed.data.count > classObj.seatLimit) {
    return res.status(409).json(errorResp("CLASS_CAPACITY_REACHED", "Seat capacity reached", req.id));
  }
  const students = [];
  for (let i = 1; i <= parsed.data.count; i += 1) {
    const idx = existing + i;
    const studentNo = `S${String(idx).padStart(3, "0")}`;
    const initialLoginCode = randomCode(8);
    const student = {
      id: genId(),
      classId: classObj.id,
      studentNo,
      displayName: parsed.data.namingRule.replace("{index}", String(idx)),
      loginCodeHash: bcrypt.hashSync(initialLoginCode, 8),
      mustResetPassword: parsed.data.defaultPasswordResetRequired,
      passwordHash: null,
      status: "active",
      bannedUntil: null,
      banReason: null,
      limits: { ...classObj.studentDefaultLimits },
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.students.push(student);
    students.push({
      studentId: student.id,
      studentNo: student.studentNo,
      displayName: student.displayName,
      initialLoginCode,
    });
  }
  return res.status(201).json(okResp(req.id, { generatedCount: students.length, students }));
});

app.post("/api/v1/classes/:classId/students/import", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    students: z
      .array(
        z.object({
          displayName: z.string().min(1),
          studentNo: z.string().min(1).optional(),
        }),
      )
      .min(1)
      .max(200),
    defaultPasswordResetRequired: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const classObj = classById(req.params.classId);
  if (!classObj || classObj.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const existingStudents = db.students.filter((s) => s.classId === classObj.id);
  if (existingStudents.length + parsed.data.students.length > classObj.seatLimit) {
    return res.status(409).json(errorResp("CLASS_CAPACITY_REACHED", "Seat capacity reached", req.id));
  }

  const existingNos = new Set(existingStudents.map((s) => s.studentNo));
  const imported = [];
  let serialBase = existingStudents.length;
  for (const item of parsed.data.students) {
    let studentNo = item.studentNo?.trim();
    if (!studentNo) {
      serialBase += 1;
      studentNo = `S${String(serialBase).padStart(3, "0")}`;
    }
    if (existingNos.has(studentNo)) {
      return res.status(409).json(errorResp("STUDENT_NO_DUPLICATED", `Student number duplicated: ${studentNo}`, req.id));
    }
    existingNos.add(studentNo);
    const initialLoginCode = randomCode(8);
    const student = {
      id: genId(),
      classId: classObj.id,
      studentNo,
      displayName: item.displayName.trim(),
      loginCodeHash: bcrypt.hashSync(initialLoginCode, 8),
      mustResetPassword: parsed.data.defaultPasswordResetRequired,
      passwordHash: null,
      status: "active",
      bannedUntil: null,
      banReason: null,
      limits: { ...classObj.studentDefaultLimits },
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.students.push(student);
    imported.push({
      studentId: student.id,
      studentNo: student.studentNo,
      displayName: student.displayName,
      initialLoginCode,
    });
  }
  return res.status(201).json(okResp(req.id, { importedCount: imported.length, students: imported }));
});

app.get("/api/v1/classes/:classId/students", authRequired("teacher"), (req, res) => {
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const q = String(req.query.q || "").trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
  const filtered = db.students
    .filter((s) => s.classId === cls.id)
    .filter((s) => !q || s.displayName.toLowerCase().includes(q) || s.studentNo.toLowerCase().includes(q));
  const total = filtered.length;
  const students = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map((s) => ({ studentId: s.id, studentNo: s.studentNo, displayName: s.displayName, status: s.status, bannedUntil: s.bannedUntil }));
  return res.json(okResp(req.id, { students, pagination: { page, pageSize, total } }));
});

app.post("/api/v1/classes/:classId/students", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    displayName: z.string().min(1),
    studentNo: z.string().min(1).optional(),
    defaultPasswordResetRequired: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const existing = db.students.filter((s) => s.classId === cls.id);
  if (existing.length >= cls.seatLimit) return res.status(409).json(errorResp("CLASS_CAPACITY_REACHED", "Seat capacity reached", req.id));
  let studentNo = parsed.data.studentNo?.trim();
  if (!studentNo) studentNo = `S${String(existing.length + 1).padStart(3, "0")}`;
  if (existing.some((s) => s.studentNo === studentNo)) {
    return res.status(409).json(errorResp("STUDENT_NO_DUPLICATED", `Student number duplicated: ${studentNo}`, req.id));
  }
  const initialLoginCode = randomCode(8);
  const student = {
    id: genId(),
    classId: cls.id,
    studentNo,
    displayName: parsed.data.displayName.trim(),
    loginCodeHash: bcrypt.hashSync(initialLoginCode, 8),
    mustResetPassword: parsed.data.defaultPasswordResetRequired,
    passwordHash: null,
    status: "active",
    bannedUntil: null,
    banReason: null,
    limits: { ...cls.studentDefaultLimits },
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.students.push(student);
  return res.status(201).json(okResp(req.id, { studentId: student.id, studentNo: student.studentNo, displayName: student.displayName, initialLoginCode }));
});

app.put("/api/v1/classes/:classId/students/:studentId", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    displayName: z.string().min(1).optional(),
    studentNo: z.string().min(1).optional(),
    status: z.enum(["active", "locked", "disabled"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  const student = db.students.find((s) => s.id === req.params.studentId && s.classId === cls.id);
  if (!student) return res.status(404).json(errorResp("STUDENT_NOT_FOUND", "Student not found", req.id));
  if (parsed.data.studentNo && db.students.some((s) => s.classId === cls.id && s.studentNo === parsed.data.studentNo && s.id !== student.id)) {
    return res.status(409).json(errorResp("STUDENT_NO_DUPLICATED", `Student number duplicated: ${parsed.data.studentNo}`, req.id));
  }
  if (parsed.data.displayName) student.displayName = parsed.data.displayName.trim();
  if (parsed.data.studentNo) student.studentNo = parsed.data.studentNo.trim();
  if (parsed.data.status) student.status = parsed.data.status;
  student.updatedAt = nowIso();
  return res.json(
    okResp(req.id, {
      studentId: student.id,
      studentNo: student.studentNo,
      displayName: student.displayName,
      status: student.status,
    }),
  );
});

app.delete("/api/v1/classes/:classId/students/:studentId", authRequired("teacher"), (req, res) => {
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  const idx = db.students.findIndex((s) => s.id === req.params.studentId && s.classId === cls.id);
  if (idx < 0) return res.status(404).json(errorResp("STUDENT_NOT_FOUND", "Student not found", req.id));
  const studentId = db.students[idx].id;
  db.students.splice(idx, 1);
  return res.json(okResp(req.id, { deleted: true, studentId }));
});

app.post("/api/v1/classes/:classId/codes/rotate", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    rotateJoinCode: z.boolean().default(true),
    rotateTeacherVerificationCode: z.boolean().default(true),
    joinCodeExpiresInHours: z.number().int().min(1).max(24 * 30).default(24),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const classObj = classById(req.params.classId);
  if (!classObj || classObj.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  if (parsed.data.rotateJoinCode) {
    classObj.joinCode = randomCode(6);
    classObj.joinCodeExpiresAt = hoursLater(parsed.data.joinCodeExpiresInHours);
    classObj.joinCodeUsedCount = 0;
  }
  if (parsed.data.rotateTeacherVerificationCode) {
    classObj.teacherVerificationCode = randomCode(8);
  }
  return res.json(
    okResp(req.id, {
      joinCode: classObj.joinCode,
      joinCodeExpiresAt: classObj.joinCodeExpiresAt,
      teacherVerificationCode: classObj.teacherVerificationCode,
    }),
  );
});

app.get("/api/v1/classes/:classId/policies/ai-models", authRequired("teacher"), (req, res) => {
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  return res.json(okResp(req.id, { classId: cls.id, allowedChatModels: cls.allowedChatModels || ["deepseek-v3"], allowedImageModels: cls.allowedImageModels || [] }));
});

app.put("/api/v1/classes/:classId/policies/ai-models", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    chatModels: z.array(z.string().min(1)).min(1),
    imageModels: z.array(z.string().min(1)).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  cls.allowedChatModels = parsed.data.chatModels;
  if (parsed.data.imageModels) cls.allowedImageModels = parsed.data.imageModels;
  return res.json(okResp(req.id, { classId: cls.id, allowedChatModels: cls.allowedChatModels, allowedImageModels: cls.allowedImageModels || [] }));
});

app.get("/api/v1/classes/:classId/usage", authRequired("teacher"), (req, res) => {
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 20)));
  const studentId = req.query.studentId ? String(req.query.studentId) : "";
  const endpoint = req.query.endpoint ? String(req.query.endpoint) : "";
  const logs = db.usageLogs
    .filter((l) => l.classId === cls.id)
    .filter((l) => !studentId || l.studentId === studentId)
    .filter((l) => !endpoint || l.endpoint === endpoint)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((l) => {
      const stu = l.studentId ? db.students.find((s) => s.id === l.studentId) : null;
      const studentNo = stu?.studentNo || "";
      const displayName = stu?.displayName || "";
      const promptPreview =
        (l.requestPayload?.messages?.at?.(-1)?.content ||
          l.requestPayload?.prompt ||
          l.requestPayload?.topic ||
          l.requestPayload?.durationSeconds ||
          "").slice(0, 60) || "";
      return {
        requestId: l.requestId,
        createdAt: l.createdAt,
        studentId: l.studentId || null,
        studentNo,
        displayName,
        endpoint: l.endpoint,
        selectedModel: l.selectedModel,
        requestPayload: l.requestPayload || null,
        responsePayload: l.responsePayload || null,
        promptPreview,
        costCny: l.costCny,
        fallbackUsed: l.fallbackUsed,
        statusCode: l.statusCode,
        imageCount: l.imageCount,
      };
    });
  return res.json(okResp(req.id, { classId: cls.id, items: logs }));
});

app.put("/api/v1/classes/:classId/policies/keywords", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    whitelist: z.array(z.string()).default([]),
    blacklist: z.array(z.string()).default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  cls.keywordWhitelist = normalizeKeywords(parsed.data.whitelist);
  cls.keywordBlacklist = normalizeKeywords(parsed.data.blacklist);
  return res.json(
    okResp(req.id, {
      classId: cls.id,
      keywordWhitelist: cls.keywordWhitelist,
      keywordBlacklist: cls.keywordBlacklist,
    }),
  );
});

app.put("/api/v1/classes/:classId/students/:studentId/limits", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    dailyRequests: z.number().int().min(1).max(5000).optional(),
    dailyTokens: z.number().int().min(100).max(10_000_000).optional(),
    dailyImages: z.number().int().min(0).max(500).optional(),
    dailyVideos: z.number().int().min(0).max(100).optional(),
    dailyStorybooks: z.number().int().min(0).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const student = db.students.find((s) => s.id === req.params.studentId && s.classId === cls.id);
  if (!student) {
    return res.status(404).json(errorResp("STUDENT_NOT_FOUND", "Student not found", req.id));
  }
  student.limits = {
    ...student.limits,
    ...parsed.data,
  };
  return res.json(okResp(req.id, { studentId: student.id, limits: student.limits }));
});

app.post("/api/v1/classes/:classId/students/:studentId/ban", authRequired("teacher"), (req, res) => {
  const schema = z.object({
    reason: z.string().min(1).max(200),
    durationMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
    permanent: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const student = db.students.find((s) => s.id === req.params.studentId && s.classId === cls.id);
  if (!student) {
    return res.status(404).json(errorResp("STUDENT_NOT_FOUND", "Student not found", req.id));
  }
  student.bannedUntil = parsed.data.permanent ? "permanent" : minutesLater(parsed.data.durationMinutes || 60);
  student.banReason = parsed.data.reason;
  return res.json(okResp(req.id, { studentId: student.id, bannedUntil: student.bannedUntil, reason: student.banReason }));
});

app.post("/api/v1/classes/:classId/students/:studentId/unban", authRequired("teacher"), (req, res) => {
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const student = db.students.find((s) => s.id === req.params.studentId && s.classId === cls.id);
  if (!student) {
    return res.status(404).json(errorResp("STUDENT_NOT_FOUND", "Student not found", req.id));
  }
  student.bannedUntil = null;
  student.banReason = null;
  return res.json(okResp(req.id, { studentId: student.id, bannedUntil: null }));
});

app.post("/api/v1/student/join-by-class-code", (req, res) => {
  const schema = z.object({
    joinCode: z.string().min(4),
    teacherVerificationCode: z.string().min(4),
    displayName: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const cls = db.classes.find((c) => c.joinCode === parsed.data.joinCode);
  if (!cls) {
    return res.status(404).json(errorResp("CLASS_JOIN_CODE_INVALID", "Invalid class join code", req.id));
  }
  if (new Date(cls.joinCodeExpiresAt) < new Date()) {
    return res.status(410).json(errorResp("CLASS_JOIN_CODE_EXPIRED", "Join code expired", req.id));
  }
  if (cls.joinCodeUsedCount >= cls.joinCodeMaxUses) {
    return res.status(409).json(errorResp("CLASS_JOIN_CODE_MAX_USES_REACHED", "Join code max uses reached", req.id));
  }
  if (cls.teacherVerificationCode !== parsed.data.teacherVerificationCode) {
    return res.status(401).json(errorResp("CLASS_VERIFICATION_CODE_INVALID", "Verification code invalid", req.id));
  }
  const occupied = db.students.filter((s) => s.classId === cls.id).length;
  if (occupied >= cls.seatLimit) {
    return res.status(409).json(errorResp("CLASS_CAPACITY_REACHED", "Seat capacity reached", req.id));
  }
  const idx = occupied + 1;
  const studentNo = `S${String(idx).padStart(3, "0")}`;
  const initialLoginCode = randomCode(8);
  const student = {
    id: genId(),
    classId: cls.id,
    studentNo,
    displayName: parsed.data.displayName,
    loginCodeHash: bcrypt.hashSync(initialLoginCode, 8),
    mustResetPassword: true,
    passwordHash: null,
    status: "active",
    bannedUntil: null,
    banReason: null,
    limits: { ...cls.studentDefaultLimits },
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.students.push(student);
  cls.joinCodeUsedCount += 1;
  return res.status(201).json(
    okResp(req.id, {
      classId: cls.id,
      studentId: student.id,
      studentNo: student.studentNo,
      initialLoginCode,
    }, "joined"),
  );
});

// -----------------------------
// Public classroom roster access (join link)
// -----------------------------
app.get("/api/v1/public/join/students", (req, res) => {
  const schema = z.object({
    joinCode: z.string().min(4),
    teacherVerificationCode: z.string().min(4),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const { joinCode, teacherVerificationCode } = parsed.data;
  const cls = db.classes.find((c) => c.joinCode === joinCode);
  if (!cls) {
    return res.status(404).json(errorResp("CLASS_JOIN_CODE_INVALID", "Invalid class join code", req.id));
  }
  if (new Date(cls.joinCodeExpiresAt) < new Date()) {
    return res.status(410).json(errorResp("CLASS_JOIN_CODE_EXPIRED", "Join code expired", req.id));
  }
  if (cls.teacherVerificationCode !== teacherVerificationCode) {
    return res.status(401).json(errorResp("CLASS_VERIFICATION_CODE_INVALID", "Verification code invalid", req.id));
  }
  // Return existing roster (fixed seats)
  const students = db.students
    .filter((s) => s.classId === cls.id)
    .sort((a, b) => {
      const an = parseInt(a.studentNo.replace(/[^0-9]/g, ""), 10);
      const bn = parseInt(b.studentNo.replace(/[^0-9]/g, ""), 10);
      return (Number.isNaN(an) ? 0 : an) - (Number.isNaN(bn) ? 0 : bn);
    })
    .map((s) => ({ studentNo: s.studentNo, displayName: s.displayName }));

  return res.json(okResp(req.id, { classId: cls.id, className: cls.className, gradeLevel: cls.gradeLevel, students }));
});

app.post("/api/v1/public/join/login", (req, res) => {
  const schema = z.object({
    joinCode: z.string().min(4),
    teacherVerificationCode: z.string().min(4),
    studentNo: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const { joinCode, teacherVerificationCode, studentNo } = parsed.data;

  const cls = db.classes.find((c) => c.joinCode === joinCode);
  if (!cls) {
    return res.status(404).json(errorResp("CLASS_JOIN_CODE_INVALID", "Invalid class join code", req.id));
  }
  if (new Date(cls.joinCodeExpiresAt) < new Date()) {
    return res.status(410).json(errorResp("CLASS_JOIN_CODE_EXPIRED", "Join code expired", req.id));
  }
  if (cls.teacherVerificationCode !== teacherVerificationCode) {
    return res.status(401).json(errorResp("CLASS_VERIFICATION_CODE_INVALID", "Verification code invalid", req.id));
  }

  const student = db.students.find((s) => s.classId === cls.id && s.studentNo === studentNo);
  if (!student) {
    return res.status(404).json(errorResp("STUDENT_NOT_FOUND", "Student not found in class", req.id));
  }
  if (student.status === "disabled" || student.bannedUntil) {
    const isStillBanned = student.bannedUntil === "permanent" || new Date(student.bannedUntil) > new Date();
    if (isStillBanned) {
      return res.status(403).json(errorResp("STUDENT_BANNED", "Student account is banned", req.id));
    }
  }

  cls.joinCodeUsedCount += 1;
  const accessToken = signToken({ sub: student.id, role: "student", classId: student.classId });
  const refreshToken = randomCode(24);
  db.sessions.push({
    id: genId(),
    actorType: "student",
    actorId: student.id,
    classId: student.classId,
    refreshToken,
    createdAt: nowIso(),
  });

  return res.json(
    okResp(req.id, {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSeconds,
      mustResetPassword: student.mustResetPassword,
      student: {
        id: student.id,
        displayName: student.displayName,
        classId: student.classId,
        studentNo: student.studentNo,
      },
    }),
  );
});

app.post("/api/v1/student/login-by-code", (req, res) => {
  const schema = z.object({
    classId: z.string().uuid(),
    studentNo: z.string().min(1),
    loginCode: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const student = db.students.find((s) => s.classId === parsed.data.classId && s.studentNo === parsed.data.studentNo);
  if (!student) {
    return res.status(401).json(errorResp("AUTH_INVALID_CREDENTIALS", "Invalid class/student/login code", req.id));
  }
  if (student.lockedUntil && new Date(student.lockedUntil) > new Date()) {
    return res.status(423).json(errorResp("AUTH_ACCOUNT_LOCKED", "Account is temporarily locked", req.id));
  }
  if (!bcrypt.compareSync(parsed.data.loginCode, student.loginCodeHash)) {
    student.failedLoginAttempts += 1;
    if (student.failedLoginAttempts >= config.loginMaxAttempts) {
      student.lockedUntil = minutesLater(config.lockMinutes);
      student.failedLoginAttempts = 0;
    }
    return res.status(401).json(errorResp("AUTH_INVALID_CREDENTIALS", "Invalid class/student/login code", req.id));
  }
  student.failedLoginAttempts = 0;
  student.lockedUntil = null;
  student.lastLoginAt = nowIso();
  const accessToken = signToken({ sub: student.id, role: "student", classId: student.classId });
  const refreshToken = randomCode(24);
  db.sessions.push({ id: genId(), actorType: "student", actorId: student.id, classId: student.classId, refreshToken, createdAt: nowIso() });
  return res.json(
    okResp(req.id, {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSeconds,
      mustResetPassword: student.mustResetPassword,
      student: { id: student.id, displayName: student.displayName, classId: student.classId, studentNo: student.studentNo },
    }),
  );
});

app.post("/api/v1/student/reset-password", authRequired("student"), (req, res) => {
  const schema = z.object({ oldLoginCode: z.string().min(1), newPassword: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const student = db.students.find((s) => s.id === req.auth.sub);
  if (!student) {
    return res.status(404).json(errorResp("STUDENT_NOT_FOUND", "Student not found", req.id));
  }
  if (!bcrypt.compareSync(parsed.data.oldLoginCode, student.loginCodeHash)) {
    return res.status(401).json(errorResp("AUTH_INVALID_CODE", "Old login code invalid", req.id));
  }
  student.passwordHash = bcrypt.hashSync(parsed.data.newPassword, 10);
  student.mustResetPassword = false;
  return res.json(okResp(req.id, { mustResetPassword: false }, "password updated"));
});

app.get("/api/v1/ai/models", authRequired(), (req, res) => {
  const endpoint = req.query.endpoint || "chat";

  // If student has classId in token, prefer class policy model list.
  const classId = req.auth?.role === "student" ? req.auth.classId : null;
  if (classId) {
    const cls = classById(classId);
    if (cls) {
      if (endpoint === "image") {
        const models = cls.allowedImageModels?.length ? cls.allowedImageModels : ["stable-image"];
        return res.json(okResp(req.id, { endpoint, models: models.map((m, i) => ({ id: m, displayName: m, isPrimary: i === 0 })) }));
      }
      if (endpoint === "chat") {
        const models = cls.allowedChatModels?.length ? cls.allowedChatModels : ["deepseek-v3"];
        return res.json(okResp(req.id, { endpoint, models: models.map((m, i) => ({ id: m, displayName: m, isPrimary: i === 0 })) }));
      }
    }
  }

  // Default catalog.
  const models =
    endpoint === "image"
      ? [{ id: "stable-image", displayName: "Stable Image", isPrimary: true }]
      : [
          { id: "deepseek-v3", displayName: "DeepSeek V3", isPrimary: true },
          { id: "qwen-plus", displayName: "Qwen Plus", isFallback: true },
        ];
  return res.json(okResp(req.id, { endpoint, models }));
});

app.post("/api/v1/ai/chat/completions", authRequired("student"), (req, res) => {
  const schema = z.object({
    classId: z.string().uuid(),
    messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1) })).min(1),
    stream: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const student = db.students.find((s) => s.id === req.auth.sub);
  if (!student || student.classId !== parsed.data.classId) {
    return res.status(403).json(errorResp("AUTH_FORBIDDEN", "Student does not belong to class", req.id));
  }
  const cls = classById(parsed.data.classId);
  const blocked = enforceStudentPolicy(req, res, student, cls, {
    promptText: parsed.data.messages.map((m) => m.content).join(" "),
  });
  if (blocked) return blocked;
  const usage = classDailyUsage(cls.id);
  if (usage.requests >= cls.rpmQuota * 24 * 60) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_REQUESTS", "Request quota exceeded", req.id));
  }
  const userPrompt = parsed.data.messages.filter((m) => m.role === "user").at(-1)?.content || "";
  const selectedModel = cls.allowedChatModels?.[0] || "deepseek-v3";
  const outputText = `Classroom-safe answer: ${userPrompt.slice(0, 180)}`;
  const promptTokens = Math.max(10, Math.ceil(userPrompt.length / 4));
  const completionTokens = Math.max(20, Math.ceil(outputText.length / 4));
  const sUsage = studentDailyUsage(student.id);
  if (sUsage.tokens + promptTokens + completionTokens > student.limits.dailyTokens) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_STUDENT_TOKENS", "Student daily token quota exceeded", req.id));
  }
  db.usageLogs.push({
    id: genId(),
    requestId: req.id,
    classId: cls.id,
    studentId: student.id,
    endpoint: "chat",
    selectedModel,
    fallbackUsed: false,
    promptTokens,
    completionTokens,
    imageCount: 0,
    costCny: Number(((promptTokens + completionTokens) * 0.00001).toFixed(6)),
    statusCode: 200,
    latencyMs: 120,
    requestPayload: { messages: parsed.data.messages },
    responsePayload: { outputText },
    createdAt: nowIso(),
  });
  return res.json(
    okResp(req.id, {
      outputText,
      model: selectedModel,
      fallbackUsed: false,
      usage: { promptTokens, completionTokens },
      safety: { action: "allow", riskScore: 0.01 },
    }),
  );
});

app.post("/api/v1/ai/images/generations", authRequired("student"), (req, res) => {
  const schema = z.object({
    classId: z.string().uuid(),
    prompt: z.string().min(3),
    size: z.string().default("1024x1024"),
    n: z.number().int().min(1).max(4).default(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  }
  const student = db.students.find((s) => s.id === req.auth.sub);
  if (!student || student.classId !== parsed.data.classId) {
    return res.status(403).json(errorResp("AUTH_FORBIDDEN", "Student does not belong to class", req.id));
  }
  const cls = classById(parsed.data.classId);
  const blocked = enforceStudentPolicy(req, res, student, cls, {
    promptText: parsed.data.prompt,
    imageCount: parsed.data.n,
  });
  if (blocked) return blocked;
  const usage = classDailyUsage(cls.id);
  if (usage.images + parsed.data.n > cls.dailyImageQuota) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_IMAGES", "Image quota exceeded", req.id));
  }
  const jobId = `img_${randomCode(10)}`;
  db.usageLogs.push({
    id: genId(),
    requestId: req.id,
    classId: cls.id,
    studentId: student.id,
    endpoint: "image",
    selectedModel: "stable-image",
    fallbackUsed: false,
    promptTokens: 0,
    completionTokens: 0,
    imageCount: parsed.data.n,
    costCny: Number((parsed.data.n * 0.02).toFixed(6)),
    statusCode: 200,
    latencyMs: 180,
    requestPayload: { prompt: parsed.data.prompt, size: parsed.data.size, n: parsed.data.n },
    responsePayload: { jobId, status: "processing", estimatedSeconds: 5 },
    createdAt: nowIso(),
  });
  return res.json(okResp(req.id, { jobId, status: "processing", estimatedSeconds: 5 }, "queued"));
});

app.get("/api/v1/ai/fun/providers", authRequired(), (req, res) => {
  return res.json(
    okResp(req.id, {
      storybook: [
        { provider: "Google Gemini + Imagen", strengths: ["structured story generation", "illustration prompts"] },
        { provider: "Canva", strengths: ["comic layout templates", "classroom friendly editing"] },
      ],
      video: [
        { provider: "Runway", strengths: ["creative short videos", "image-to-video"] },
        { provider: "Synthesia", strengths: ["avatar educational explainers", "multi-language narration"] },
        { provider: "Shotstack", strengths: ["API-first composition pipeline", "automated subtitle and timeline assembly"] },
      ],
    }),
  );
});

app.post("/api/v1/ai/storybooks/generations", authRequired("student"), (req, res) => {
  const schema = z.object({
    classId: z.string().uuid(),
    topic: z.string().min(2),
    gradeLevel: z.string().optional(),
    pages: z.number().int().min(4).max(20).default(8),
    style: z.string().default("cartoon"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const student = db.students.find((s) => s.id === req.auth.sub);
  if (!student || student.classId !== parsed.data.classId) {
    return res.status(403).json(errorResp("AUTH_FORBIDDEN", "Student does not belong to class", req.id));
  }
  const cls = classById(parsed.data.classId);
  const blocked = enforceStudentPolicy(req, res, student, cls, { promptText: parsed.data.topic });
  if (blocked) return blocked;
  const sUsage = studentDailyUsage(student.id);
  const storybooksUsed = db.usageLogs.filter(
    (l) => l.studentId === student.id && l.endpoint === "chat" && l.featureType === "storybook" && l.createdAt.startsWith(new Date().toISOString().slice(0, 10)),
  ).length;
  if (storybooksUsed >= student.limits.dailyStorybooks) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_STUDENT_STORYBOOKS", "Student daily storybook quota exceeded", req.id));
  }
  const tokenCost = parsed.data.pages * 120;
  if (sUsage.tokens + tokenCost > student.limits.dailyTokens) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_STUDENT_TOKENS", "Student daily token quota exceeded", req.id));
  }
  const selectedModel = cls.allowedChatModels?.[0] || "gemini-storybook";
  const jobId = `storybook_${randomCode(8)}`;
  db.usageLogs.push({
    id: genId(),
    requestId: req.id,
    classId: cls.id,
    studentId: student.id,
    endpoint: "chat",
    featureType: "storybook",
    selectedModel,
    fallbackUsed: false,
    promptTokens: tokenCost / 2,
    completionTokens: tokenCost / 2,
    imageCount: 0,
    costCny: Number((tokenCost * 0.00001).toFixed(6)),
    statusCode: 200,
    latencyMs: 250,
    requestPayload: { topic: parsed.data.topic, pages: parsed.data.pages, style: parsed.data.style, gradeLevel: parsed.data.gradeLevel || null },
    responsePayload: { jobId, status: "processing", preview: { title: `${parsed.data.topic} Adventure`, pages: parsed.data.pages, style: parsed.data.style } },
    createdAt: nowIso(),
  });
  return res.json(
    okResp(req.id, {
      jobId,
      status: "processing",
      estimatedSeconds: 12,
      preview: {
        title: `${parsed.data.topic} Adventure`,
        pages: parsed.data.pages,
        style: parsed.data.style,
      },
    }, "queued"),
  );
});

app.post("/api/v1/ai/videos/generations", authRequired("student"), (req, res) => {
  const schema = z.object({
    classId: z.string().uuid(),
    prompt: z.string().min(3),
    mode: z.enum(["text_to_video", "image_to_video"]).default("text_to_video"),
    durationSeconds: z.number().int().min(3).max(30).default(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(errorResp("BAD_REQUEST", "Invalid payload", req.id));
  const student = db.students.find((s) => s.id === req.auth.sub);
  if (!student || student.classId !== parsed.data.classId) {
    return res.status(403).json(errorResp("AUTH_FORBIDDEN", "Student does not belong to class", req.id));
  }
  const cls = classById(parsed.data.classId);
  const blocked = enforceStudentPolicy(req, res, student, cls, { promptText: parsed.data.prompt });
  if (blocked) return blocked;
  const videosUsed = db.usageLogs.filter(
    (l) => l.studentId === student.id && l.endpoint === "video" && l.createdAt.startsWith(new Date().toISOString().slice(0, 10)),
  ).length;
  if (videosUsed >= student.limits.dailyVideos) {
    return res.status(429).json(errorResp("QUOTA_EXCEEDED_STUDENT_VIDEOS", "Student daily video quota exceeded", req.id));
  }
  const jobId = `video_${randomCode(8)}`;
  db.usageLogs.push({
    id: genId(),
    requestId: req.id,
    classId: cls.id,
    studentId: student.id,
    endpoint: "video",
    selectedModel: "runway-gen",
    fallbackUsed: false,
    promptTokens: Math.ceil(parsed.data.prompt.length / 4),
    completionTokens: 0,
    imageCount: 0,
    costCny: Number((0.08 + parsed.data.durationSeconds * 0.01).toFixed(6)),
    statusCode: 200,
    latencyMs: 420,
    requestPayload: { prompt: parsed.data.prompt, mode: parsed.data.mode, durationSeconds: parsed.data.durationSeconds },
    responsePayload: { jobId, status: "processing", provider: parsed.data.mode === "image_to_video" ? "Runway/Pika class" : "Runway/Synthesia class" },
    createdAt: nowIso(),
  });
  return res.json(
    okResp(req.id, {
      jobId,
      status: "processing",
      estimatedSeconds: 20,
      provider: parsed.data.mode === "image_to_video" ? "Runway/Pika class" : "Runway/Synthesia class",
    }, "queued"),
  );
});

app.get("/api/v1/classes/:classId/dashboard/realtime", authRequired("teacher"), (req, res) => {
  const cls = classById(req.params.classId);
  if (!cls || cls.teacherId !== req.auth.sub) {
    return res.status(404).json(errorResp("CLASS_NOT_FOUND", "Class not found", req.id));
  }
  const usage = classDailyUsage(cls.id);
  const onlineStudents = db.sessions.filter((s) => s.actorType === "student" && s.classId === cls.id).length;
  const alerts = db.safetyEvents.filter((e) => e.classId === cls.id).slice(-5);
  return res.json(
    okResp(req.id, {
      onlineStudents,
      rpmCurrent: usage.requests,
      errorRate: 0,
      quota: {
        dailyTokenUsed: usage.tokens,
        dailyTokenLimit: cls.dailyTokenQuota,
        dailyImageUsed: usage.images,
        dailyImageLimit: cls.dailyImageQuota,
      },
      alerts,
    }),
  );
});

export default app;

