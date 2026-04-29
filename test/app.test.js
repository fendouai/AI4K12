import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
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

describe("AI4K12 MVP API", () => {
  beforeEach(() => {
    resetDb();
  });

  it("completes teacher -> class -> student -> ai flow", async () => {
    const register = await request(app).post("/api/v1/teacher/register").send({
      email: "teacher@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher A",
      schoolName: "Demo School",
    });
    expect(register.status).toBe(201);
    expect(register.body.code).toBe("OK");

    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher@test.edu",
      password: "StrongPwd!123",
    });
    expect(login.status).toBe(200);
    const teacherToken = login.body.data.accessToken;

    const createClass = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Grade7-1", gradeLevel: "junior_1", seatLimit: 50 });
    expect(createClass.status).toBe(201);
    const classId = createClass.body.data.classId;

    const batch = await request(app)
      .post(`/api/v1/classes/${classId}/students/batch-generate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ count: 2, namingRule: "S{index}" });
    expect(batch.status).toBe(201);
    const s1 = batch.body.data.students[0];

    const studentLogin = await request(app).post("/api/v1/student/login-by-code").send({
      classId,
      studentNo: s1.studentNo,
      loginCode: s1.initialLoginCode,
    });
    expect(studentLogin.status).toBe(200);
    const studentToken = studentLogin.body.data.accessToken;

    const chat = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        classId,
        messages: [{ role: "user", content: "Explain gravity to 10 years old." }],
      });
    expect(chat.status).toBe(200);
    expect(chat.body.data.outputText).toContain("Classroom-safe answer");

    const image = await request(app)
      .post("/api/v1/ai/images/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        classId,
        prompt: "Draw a simple solar system poster",
        n: 1,
      });
    expect(image.status).toBe(200);
    expect(image.body.message).toBe("queued");

    const dashboard = await request(app)
      .get(`/api/v1/classes/${classId}/dashboard/realtime`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.quota.dailyImageUsed).toBe(1);
  });

  it("rejects invalid verification code on student join", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher2@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher B",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher2@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;

    const createClass = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Grade8-1", seatLimit: 50 });

    const join = await request(app).post("/api/v1/student/join-by-class-code").send({
      joinCode: createClass.body.data.joinCode,
      teacherVerificationCode: "WRONGCODE",
      displayName: "Student Z",
    });

    expect(join.status).toBe(401);
    expect(join.body.code).toBe("CLASS_VERIFICATION_CODE_INVALID");
  });

  it("supports student ban, keyword policy, and per-student quota controls", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher3@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher C",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher3@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;
    const createClass = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Grade6-2", seatLimit: 50 });
    const classId = createClass.body.data.classId;

    const batch = await request(app)
      .post(`/api/v1/classes/${classId}/students/batch-generate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ count: 1, namingRule: "S{index}" });
    const student = batch.body.data.students[0];

    const studentLogin = await request(app).post("/api/v1/student/login-by-code").send({
      classId,
      studentNo: student.studentNo,
      loginCode: student.initialLoginCode,
    });
    const studentToken = studentLogin.body.data.accessToken;
    const studentId = studentLogin.body.data.student.id;

    const setKeywords = await request(app)
      .put(`/api/v1/classes/${classId}/policies/keywords`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ blacklist: ["violence"], whitelist: [] });
    expect(setKeywords.status).toBe(200);

    const blockedChat = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        classId,
        messages: [{ role: "user", content: "Teach me violence tactics" }],
      });
    expect(blockedChat.status).toBe(403);
    expect(blockedChat.body.code).toBe("KEYWORD_BLACKLIST_BLOCKED");

    const setLimits = await request(app)
      .put(`/api/v1/classes/${classId}/students/${studentId}/limits`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ dailyRequests: 1, dailyVideos: 1, dailyStorybooks: 1 });
    expect(setLimits.status).toBe(200);
    expect(setLimits.body.data.limits.dailyRequests).toBe(1);

    const chatOk = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        classId,
        messages: [{ role: "user", content: "Explain plants" }],
      });
    expect(chatOk.status).toBe(200);

    const chatRateLimited = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        classId,
        messages: [{ role: "user", content: "Explain water" }],
      });
    expect(chatRateLimited.status).toBe(429);
    expect(chatRateLimited.body.code).toBe("QUOTA_EXCEEDED_STUDENT_REQUESTS");

    const ban = await request(app)
      .post(`/api/v1/classes/${classId}/students/${studentId}/ban`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ reason: "misuse", permanent: true });
    expect(ban.status).toBe(200);

    const imageWhileBanned = await request(app)
      .post("/api/v1/ai/images/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, prompt: "draw a cat", n: 1 });
    expect(imageWhileBanned.status).toBe(403);
    expect(imageWhileBanned.body.code).toBe("STUDENT_BANNED");

    const unban = await request(app)
      .post(`/api/v1/classes/${classId}/students/${studentId}/unban`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({});
    expect(unban.status).toBe(200);
  });

  it("provides fun provider list and storybook/video generation APIs", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher4@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher D",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher4@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;
    const createClass = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Grade5-1", seatLimit: 50 });
    const classId = createClass.body.data.classId;
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
    const studentToken = studentLogin.body.data.accessToken;

    const providers = await request(app).get("/api/v1/ai/fun/providers").set("Authorization", `Bearer ${studentToken}`);
    expect(providers.status).toBe(200);
    expect(providers.body.data.video.length).toBeGreaterThan(0);

    const storybook = await request(app)
      .post("/api/v1/ai/storybooks/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, topic: "The Solar System", pages: 6, style: "comic" });
    expect(storybook.status).toBe(200);
    expect(storybook.body.message).toBe("queued");

    const video = await request(app)
      .post("/api/v1/ai/videos/generations")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, prompt: "A volcano eruption science demo", durationSeconds: 6 });
    expect(video.status).toBe(200);
    expect(video.body.message).toBe("queued");
  });

  it("enforces whitelist keywords when whitelist is configured", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher5@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher E",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher5@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;
    const createClass = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Grade4-1", seatLimit: 50 });
    const classId = createClass.body.data.classId;
    const batch = await request(app)
      .post(`/api/v1/classes/${classId}/students/batch-generate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ count: 1, namingRule: "S{index}" });
    const s = batch.body.data.students[0];

    await request(app)
      .put(`/api/v1/classes/${classId}/policies/keywords`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ whitelist: ["math"], blacklist: [] });

    const studentLogin = await request(app).post("/api/v1/student/login-by-code").send({
      classId,
      studentNo: s.studentNo,
      loginCode: s.initialLoginCode,
    });
    const studentToken = studentLogin.body.data.accessToken;

    const blocked = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, messages: [{ role: "user", content: "write a poem" }] });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("KEYWORD_WHITELIST_REQUIRED");

    const allowed = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, messages: [{ role: "user", content: "solve this math problem" }] });
    expect(allowed.status).toBe(200);
  });

  it("enforces join code max uses separate from seat limit", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher6@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher F",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher6@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;
    const createClass = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Grade3-1", seatLimit: 50 });
    const classId = createClass.body.data.classId;

    // Force max uses low to validate enforcement.
    const cls = db.classes.find((x) => x.id === classId);
    cls.joinCodeMaxUses = 1;

    const firstJoin = await request(app).post("/api/v1/student/join-by-class-code").send({
      joinCode: createClass.body.data.joinCode,
      teacherVerificationCode: createClass.body.data.teacherVerificationCode,
      displayName: "Student A",
    });
    expect(firstJoin.status).toBe(201);

    const secondJoin = await request(app).post("/api/v1/student/join-by-class-code").send({
      joinCode: createClass.body.data.joinCode,
      teacherVerificationCode: createClass.body.data.teacherVerificationCode,
      displayName: "Student B",
    });
    expect(secondJoin.status).toBe(409);
    expect(secondJoin.body.code).toBe("CLASS_JOIN_CODE_MAX_USES_REACHED");
  });

  it("imports student roster after selecting class", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher7@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher G",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher7@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;
    const createClass = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Grade2-1", seatLimit: 50 });
    const classId = createClass.body.data.classId;

    const importRet = await request(app)
      .post(`/api/v1/classes/${classId}/students/import`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        students: [
          { displayName: "张三" },
          { displayName: "李四", studentNo: "L004" },
        ],
      });
    expect(importRet.status).toBe(201);
    expect(importRet.body.data.importedCount).toBe(2);

    const classes = await request(app).get("/api/v1/classes").set("Authorization", `Bearer ${teacherToken}`);
    expect(classes.status).toBe(200);
    expect(classes.body.data.classes[0].seatUsed).toBe(2);
  });

  it("supports teacher CRUD for grade class and student", async () => {
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher8@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher H",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher8@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;

    const gradeCreate = await request(app).post("/api/v1/grades").set("Authorization", `Bearer ${teacherToken}`).send({ name: "Grade 7" });
    expect(gradeCreate.status).toBe(201);
    const gradeId = gradeCreate.body.data.gradeId;

    const gradeUpdate = await request(app)
      .put(`/api/v1/grades/${gradeId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ name: "Grade 7A" });
    expect(gradeUpdate.status).toBe(200);

    const classCreate = await request(app)
      .post("/api/v1/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Class 1", gradeLevel: "Grade 7A", seatLimit: 50 });
    const classId = classCreate.body.data.classId;

    const classUpdate = await request(app)
      .put(`/api/v1/classes/${classId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ className: "Class 1 Updated", seatLimit: 60 });
    expect(classUpdate.status).toBe(200);

    const studentCreate = await request(app)
      .post(`/api/v1/classes/${classId}/students`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ displayName: "Student One", studentNo: "ST01" });
    expect(studentCreate.status).toBe(201);
    const studentId = studentCreate.body.data.studentId;

    const studentUpdate = await request(app)
      .put(`/api/v1/classes/${classId}/students/${studentId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ displayName: "Student One Updated", status: "locked" });
    expect(studentUpdate.status).toBe(200);
    expect(studentUpdate.body.data.status).toBe("locked");

    const studentList = await request(app).get(`/api/v1/classes/${classId}/students`).set("Authorization", `Bearer ${teacherToken}`);
    expect(studentList.status).toBe(200);
    expect(studentList.body.data.students.length).toBe(1);

    const studentDelete = await request(app).delete(`/api/v1/classes/${classId}/students/${studentId}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(studentDelete.status).toBe(200);

    const classDelete = await request(app).delete(`/api/v1/classes/${classId}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(classDelete.status).toBe(200);

    const gradeDelete = await request(app).delete(`/api/v1/grades/${gradeId}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(gradeDelete.status).toBe(200);
  });

  it("allows teacher to configure student chat model and view API interaction logs", async () => {
    // Teacher + class + student
    await request(app).post("/api/v1/teacher/register").send({
      email: "teacher9@test.edu",
      password: "StrongPwd!123",
      fullName: "Teacher I",
    });
    const login = await request(app).post("/api/v1/teacher/login").send({
      email: "teacher9@test.edu",
      password: "StrongPwd!123",
    });
    const teacherToken = login.body.data.accessToken;
    const classCreate = await request(app).post("/api/v1/classes").set("Authorization", `Bearer ${teacherToken}`).send({
      className: "Policy-Chat-Class",
      gradeLevel: "junior_1",
      seatLimit: 50,
    });
    const classId = classCreate.body.data.classId;
    const batch = await request(app)
      .post(`/api/v1/classes/${classId}/students/batch-generate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ count: 1, namingRule: "S{index}" });
    const student = batch.body.data.students[0];
    const studentLogin = await request(app)
      .post("/api/v1/student/login-by-code")
      .send({ classId, studentNo: student.studentNo, loginCode: student.initialLoginCode });
    const studentToken = studentLogin.body.data.accessToken;

    // Configure allowed chat model for this class
    const policy = await request(app)
      .put(`/api/v1/classes/${classId}/policies/ai-models`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ chatModels: ["my-llm-chat-model"], imageModels: [] });
    expect(policy.status).toBe(200);
    expect(policy.body.data.allowedChatModels[0]).toBe("my-llm-chat-model");

    // Student sees models list restricted to policy
    const models = await request(app)
      .get(`/api/v1/ai/models?endpoint=chat`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(models.status).toBe(200);
    expect(models.body.data.models[0].id).toBe("my-llm-chat-model");

    // Student calls chat
    const chat = await request(app)
      .post("/api/v1/ai/chat/completions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ classId, messages: [{ role: "user", content: "Test message for model policy" }] });
    expect(chat.status).toBe(200);

    // Teacher views usage logs (request/response)
    const usage = await request(app)
      .get(`/api/v1/classes/${classId}/usage?limit=10`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(usage.status).toBe(200);
    expect(usage.body.data.items.length).toBeGreaterThan(0);
    expect(usage.body.data.items[0].selectedModel).toBe("my-llm-chat-model");
    expect(usage.body.data.items[0].responsePayload.outputText).toContain("Classroom-safe answer");
    expect(usage.body.data.items[0].requestPayload.messages[0].content).toBe("Test message for model policy");
  });
});

