import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { signToken } from "../src/auth.js";
import { db } from "../src/store.js";

function resetDb() {
  db.grades.length = 0;
  db.teachers.length = 0;
  db.classes.length = 0;
  db.students.length = 0;
  db.sessions.length = 0;
  db.usageLogs.length = 0;
  db.safetyEvents.length = 0;
}

async function bootstrap() {
  await request(app).post("/api/v1/teacher/register").send({
    email: "cov.teacher@test.edu",
    password: "StrongPwd!123",
    fullName: "Coverage Teacher",
  });
  const login = await request(app).post("/api/v1/teacher/login").send({
    email: "cov.teacher@test.edu",
    password: "StrongPwd!123",
  });
  const teacherToken = login.body.data.accessToken;
  const cls = await request(app)
    .post("/api/v1/classes")
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ className: "Cov-Class", seatLimit: 50 });
  const classId = cls.body.data.classId;
  const batch = await request(app)
    .post(`/api/v1/classes/${classId}/students/batch-generate`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ count: 1, namingRule: "S{index}" });
  const s = batch.body.data.students[0];
  const studentLogin = await request(app).post("/api/v1/student/login-by-code").send({
    classId,
    studentNo: s.studentNo,
    loginCode: s.initialLoginCode,
  });
  return {
    teacherToken,
    classId,
    studentToken: studentLogin.body.data.accessToken,
    studentId: studentLogin.body.data.student.id,
    studentNo: s.studentNo,
    initialLoginCode: s.initialLoginCode,
    joinCode: cls.body.data.joinCode,
    teacherVerificationCode: cls.body.data.teacherVerificationCode,
  };
}

describe("Coverage branch tests", () => {
  beforeEach(() => {
    resetDb();
  });

  it("covers auth missing/invalid/forbidden token branches", async () => {
    const missing = await request(app).get("/api/v1/ai/models");
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe("AUTH_MISSING");

    const invalid = await request(app).get("/api/v1/ai/models").set("Authorization", "Bearer bad.token");
    expect(invalid.status).toBe(401);
    expect(invalid.body.code).toBe("AUTH_INVALID");

    const { teacherToken, classId } = await bootstrap();
    const forbiddenRole = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ classId, messages: [{ role: "user", content: "hello" }] });
    expect(forbiddenRole.status).toBe(403);
    expect(forbiddenRole.body.code).toBe("AUTH_FORBIDDEN");
  });

  it("covers login lockout branches for teacher and student", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "lock.teacher@test.edu",
      password: "StrongPwd!123",
      fullName: "Lock Teacher",
    });
    for (let i = 0; i < 5; i += 1) {
      const fail = await request(app).post("/api/v1/teacher/login").send({
        email: "lock.teacher@test.edu",
        password: "wrong-pass",
      });
      expect(fail.status).toBe(401);
    }
    const locked = await request(app).post("/api/v1/teacher/login").send({
      email: "lock.teacher@test.edu",
      password: "StrongPwd!123",
    });
    expect(locked.status).toBe(423);

    const { classId, studentNo, initialLoginCode } = await bootstrap();
    for (let i = 0; i < 5; i += 1) {
      const sfail = await request(app).post("/api/v1/student/login-by-code").send({
        classId,
        studentNo,
        loginCode: "WRONG000",
      });
      expect(sfail.status).toBe(401);
    }
    const slocked = await request(app).post("/api/v1/student/login-by-code").send({
      classId,
      studentNo,
      loginCode: initialLoginCode,
    });
    expect(slocked.status).toBe(423);
  });

  it("covers join code invalid/expired/capacity paths", async () => {
    const ctx = await bootstrap();
    const invalid = await request(app).post("/api/v1/student/join-by-class-code").send({
      joinCode: "BAD001",
      teacherVerificationCode: "ANY1",
      displayName: "A",
    });
    expect(invalid.status).toBe(404);

    const cls = db.classes.find((c) => c.id === ctx.classId);
    cls.joinCodeExpiresAt = new Date(Date.now() - 3600 * 1000).toISOString();
    const expired = await request(app).post("/api/v1/student/join-by-class-code").send({
      joinCode: ctx.joinCode,
      teacherVerificationCode: ctx.teacherVerificationCode,
      displayName: "B",
    });
    expect(expired.status).toBe(410);

    cls.joinCodeExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    cls.seatLimit = 1;
    const full = await request(app).post("/api/v1/student/join-by-class-code").send({
      joinCode: ctx.joinCode,
      teacherVerificationCode: ctx.teacherVerificationCode,
      displayName: "C",
    });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("CLASS_CAPACITY_REACHED");
  });

  it("covers reset-password not found and invalid code branches", async () => {
    const { studentToken } = await bootstrap();
    const badCode = await request(app)
      .post("/api/v1/student/reset-password")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ oldLoginCode: "BAD", newPassword: "NewPassword!123" });
    expect(badCode.status).toBe(401);

    const fakeStudentToken = signToken({ sub: "6d4d7f24-092f-4e28-bf02-e7ccd8394cd1", role: "student", classId: "x" });
    const notFound = await request(app)
      .post("/api/v1/student/reset-password")
      .set("Authorization", `Bearer ${fakeStudentToken}`)
      .send({ oldLoginCode: "ANY", newPassword: "NewPassword!123" });
    expect(notFound.status).toBe(404);
  });

  it("covers keyword management, limits, ban not found branches", async () => {
    const { teacherToken, classId } = await bootstrap();

    const kwNotFound = await request(app)
      .put("/api/v1/classes/0c881757-1c66-40bf-90c2-6ceddf8ec3f0/policies/keywords")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ whitelist: ["a"] });
    expect(kwNotFound.status).toBe(404);

    const limitsNotFound = await request(app)
      .put(`/api/v1/classes/${classId}/students/0c881757-1c66-40bf-90c2-6ceddf8ec3f0/limits`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ dailyRequests: 10 });
    expect(limitsNotFound.status).toBe(404);

    const banNotFound = await request(app)
      .post(`/api/v1/classes/${classId}/students/0c881757-1c66-40bf-90c2-6ceddf8ec3f0/ban`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ reason: "x", durationMinutes: 10 });
    expect(banNotFound.status).toBe(404);
  });

  it("covers chat/image/storybook/video quota and class mismatch branches", async () => {
    const { teacherToken, classId, studentToken, studentId } = await bootstrap();
    const cls = db.classes.find((c) => c.id === classId);
    const stu = db.students.find((s) => s.id === studentId);

    const imageModels = await request(app).get("/api/v1/ai/models?endpoint=image").set("Authorization", `Bearer ${teacherToken}`);
    expect(imageModels.status).toBe(200);
    expect(imageModels.body.data.models[0].id).toBe("stable-image");

    const wrongClass = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId: "0c881757-1c66-40bf-90c2-6ceddf8ec3f0", messages: [{ role: "user", content: "test" }] });
    expect(wrongClass.status).toBe(403);

    cls.rpmQuota = 0;
    const rpmExceeded = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, messages: [{ role: "user", content: "test" }] });
    expect(rpmExceeded.status).toBe(429);
    expect(rpmExceeded.body.code).toBe("QUOTA_EXCEEDED_REQUESTS");
    cls.rpmQuota = 120;

    stu.limits.dailyTokens = 1;
    const tokenExceeded = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, messages: [{ role: "user", content: "long long long long text" }] });
    expect(tokenExceeded.status).toBe(429);
    expect(tokenExceeded.body.code).toBe("QUOTA_EXCEEDED_STUDENT_TOKENS");
    stu.limits.dailyTokens = 100000;

    stu.limits.dailyImages = 0;
    const imgStudentExceeded = await request(app)
      .post("/api/v1/ai/images/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, prompt: "tree image", n: 1 });
    expect(imgStudentExceeded.status).toBe(429);
    expect(imgStudentExceeded.body.code).toBe("QUOTA_EXCEEDED_STUDENT_IMAGES");
    stu.limits.dailyImages = 10;

    cls.dailyImageQuota = 0;
    const imgClassExceeded = await request(app)
      .post("/api/v1/ai/images/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, prompt: "tree image", n: 1 });
    expect(imgClassExceeded.status).toBe(429);
    expect(imgClassExceeded.body.code).toBe("QUOTA_EXCEEDED_IMAGES");
    cls.dailyImageQuota = 100;

    stu.limits.dailyStorybooks = 0;
    const storybookExceeded = await request(app)
      .post("/api/v1/ai/storybooks/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, topic: "Ocean", pages: 6 });
    expect(storybookExceeded.status).toBe(429);
    expect(storybookExceeded.body.code).toBe("QUOTA_EXCEEDED_STUDENT_STORYBOOKS");
    stu.limits.dailyStorybooks = 5;

    stu.limits.dailyVideos = 0;
    const videoExceeded = await request(app)
      .post("/api/v1/ai/videos/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, prompt: "planet video", durationSeconds: 6 });
    expect(videoExceeded.status).toBe(429);
    expect(videoExceeded.body.code).toBe("QUOTA_EXCEEDED_STUDENT_VIDEOS");
  });

  it("covers expired temporary ban, rotate toggles, and dashboard not found", async () => {
    const { teacherToken, classId, studentToken, studentId } = await bootstrap();
    const stu = db.students.find((s) => s.id === studentId);
    stu.bannedUntil = new Date(Date.now() - 5000).toISOString();

    const allowedAfterExpiredBan = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, messages: [{ role: "user", content: "math basics" }] });
    expect(allowedAfterExpiredBan.status).toBe(200);

    const cls = db.classes.find((c) => c.id === classId);
    const beforeJoinCode = cls.joinCode;
    const beforeVerifyCode = cls.teacherVerificationCode;
    const rotateNoChange = await request(app)
      .post(`/api/v1/classes/${classId}/codes/rotate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ rotateJoinCode: false, rotateTeacherVerificationCode: false, joinCodeExpiresInHours: 1 });
    expect(rotateNoChange.status).toBe(200);
    expect(rotateNoChange.body.data.joinCode).toBe(beforeJoinCode);
    expect(rotateNoChange.body.data.teacherVerificationCode).toBe(beforeVerifyCode);

    const badDashboard = await request(app)
      .get("/api/v1/classes/0c881757-1c66-40bf-90c2-6ceddf8ec3f0/dashboard/realtime")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(badDashboard.status).toBe(404);
  });

  it("covers additional bad-request and forbidden branches for strong gate", async () => {
    const badRegister = await request(app).post("/api/v1/teacher/register").send({
      email: "not-an-email",
      password: "123",
      fullName: "",
    });
    expect(badRegister.status).toBe(400);

    const badTeacherLogin = await request(app).post("/api/v1/teacher/login").send({ email: "x" });
    expect(badTeacherLogin.status).toBe(400);

    const unknownTeacherLogin = await request(app).post("/api/v1/teacher/login").send({
      email: "none@test.edu",
      password: "StrongPwd!123",
    });
    expect(unknownTeacherLogin.status).toBe(401);

    const ctx = await bootstrap();

    const badClassCreate = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${ctx.teacherToken}`)
      .send({ className: "", seatLimit: 9999 });
    expect(badClassCreate.status).toBe(400);

    const batchNotFound = await request(app)
      .post("/api/v1/classes/0c881757-1c66-40bf-90c2-6ceddf8ec3f0/students/batch-generate")
      .set("Authorization", `Bearer ${ctx.teacherToken}`)
      .send({ count: 1 });
    expect(batchNotFound.status).toBe(404);

    const badRotate = await request(app)
      .post(`/api/v1/classes/${ctx.classId}/codes/rotate`)
      .set("Authorization", `Bearer ${ctx.teacherToken}`)
      .send({ joinCodeExpiresInHours: 0 });
    expect(badRotate.status).toBe(400);

    const badKeywords = await request(app)
      .put(`/api/v1/classes/${ctx.classId}/policies/keywords`)
      .set("Authorization", `Bearer ${ctx.teacherToken}`)
      .send({ whitelist: "math" });
    expect(badKeywords.status).toBe(400);

    const badLimits = await request(app)
      .put(`/api/v1/classes/${ctx.classId}/students/${ctx.studentId}/limits`)
      .set("Authorization", `Bearer ${ctx.teacherToken}`)
      .send({ dailyRequests: 0 });
    expect(badLimits.status).toBe(400);

    const badBan = await request(app)
      .post(`/api/v1/classes/${ctx.classId}/students/${ctx.studentId}/ban`)
      .set("Authorization", `Bearer ${ctx.teacherToken}`)
      .send({ reason: "", durationMinutes: 0 });
    expect(badBan.status).toBe(400);

    const unbanNotFound = await request(app)
      .post(`/api/v1/classes/${ctx.classId}/students/0c881757-1c66-40bf-90c2-6ceddf8ec3f0/unban`)
      .set("Authorization", `Bearer ${ctx.teacherToken}`)
      .send({});
    expect(unbanNotFound.status).toBe(404);

    const badJoinPayload = await request(app).post("/api/v1/student/join-by-class-code").send({
      joinCode: "A",
      teacherVerificationCode: "B",
      displayName: "",
    });
    expect(badJoinPayload.status).toBe(400);

    const badStudentLoginPayload = await request(app).post("/api/v1/student/login-by-code").send({
      classId: "not-uuid",
      studentNo: "",
      loginCode: "",
    });
    expect(badStudentLoginPayload.status).toBe(400);

    const badImagePayload = await request(app)
      .post("/api/v1/ai/images/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: ctx.classId, prompt: "x", n: 0 });
    expect(badImagePayload.status).toBe(400);

    const imageForbidden = await request(app)
      .post("/api/v1/ai/images/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: "0c881757-1c66-40bf-90c2-6ceddf8ec3f0", prompt: "tree image", n: 1 });
    expect(imageForbidden.status).toBe(403);

    const badStorybookPayload = await request(app)
      .post("/api/v1/ai/storybooks/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: ctx.classId, topic: "x", pages: 30 });
    expect(badStorybookPayload.status).toBe(400);

    const storybookForbidden = await request(app)
      .post("/api/v1/ai/storybooks/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: "0c881757-1c66-40bf-90c2-6ceddf8ec3f0", topic: "Ocean", pages: 6 });
    expect(storybookForbidden.status).toBe(403);

    const stu = db.students.find((s) => s.id === ctx.studentId);
    stu.limits.dailyTokens = 10;
    const storybookTokenExceeded = await request(app)
      .post("/api/v1/ai/storybooks/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: ctx.classId, topic: "Ocean", pages: 6 });
    expect(storybookTokenExceeded.status).toBe(429);
    expect(storybookTokenExceeded.body.code).toBe("QUOTA_EXCEEDED_STUDENT_TOKENS");
    stu.limits.dailyTokens = 100000;

    const badVideoPayload = await request(app)
      .post("/api/v1/ai/videos/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: ctx.classId, prompt: "x", durationSeconds: 2 });
    expect(badVideoPayload.status).toBe(400);

    const videoForbidden = await request(app)
      .post("/api/v1/ai/videos/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: "0c881757-1c66-40bf-90c2-6ceddf8ec3f0", prompt: "planet video", durationSeconds: 6 });
    expect(videoForbidden.status).toBe(403);

    const videoImageMode = await request(app)
      .post("/api/v1/ai/videos/generations")
      .set("Authorization", `Bearer ${ctx.studentToken}`)
      .send({ classId: ctx.classId, prompt: "planet video", durationSeconds: 6, mode: "image_to_video" });
    expect(videoImageMode.status).toBe(200);
    expect(videoImageMode.body.data.provider).toContain("Runway/Pika");
  });
});

