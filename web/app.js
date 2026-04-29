const state = {
  teacherToken: "",
  studentToken: "",
  classId: "",
  studentClassId: "",
  classPage: 1,
  classPageSize: 5,
  classQ: "",
  studentPage: 1,
  studentPageSize: 5,
  studentQ: "",
  joinCode: "",
  teacherVerificationCode: "",
  setupClassId: "",
  setupAllClasses: [],
  setupAllowedChatModels: [],
  setupAllowedImageModels: [],
  usageItems: [],
  systemPublicBaseUrl: "",
  systemPublicDomain: "",
  systemPublicIp: "",
  studentChatMessages: [],
};

const output = document.getElementById("output");
const entryGateway = document.getElementById("entry-gateway");
const teacherAuth = document.getElementById("teacher-auth");
const studentAuth = document.getElementById("student-auth");
const teacherDashboard = document.getElementById("teacher-dashboard");
const studentWorkspace = document.getElementById("student-workspace");
const importClassSelect = document.getElementById("import-class-select");
const classCreateGradeSelect = document.getElementById("class-create-grade-select");
const classEditGradeSelect = document.getElementById("class-edit-grade-select");
const studentGradeSelect = document.getElementById("student-grade-select");
const studentClassIdSelect = document.getElementById("student-class-id-select");
const systemProviderSelect = document.getElementById("system-provider-select");
const systemApiKeyInput = document.getElementById("system-api-key-input");
const systemBaseUrlInput = document.getElementById("system-base-url-input");
const systemSaveAndFetchModelsBtn = document.getElementById("system-save-and-fetch-models-btn");
const systemFetchHint = document.getElementById("system-fetch-hint");
const systemModelResults = document.getElementById("system-model-results");
const systemPublicBaseUrlInput = document.getElementById("system-public-base-url-input");
const systemSavePublicBaseUrlBtn = document.getElementById("system-save-public-base-url-btn");
const systemPublicDomainInput = document.getElementById("system-public-domain-input");
const systemPublicIpInput = document.getElementById("system-public-ip-input");
const systemSaveDomainIpBtn = document.getElementById("system-save-domain-ip-btn");
const teacherTabsRoot = document.getElementById("teacher-dashboard");
const setupGradeSelect = document.getElementById("setup-grade-select");
const setupClassSelect = document.getElementById("setup-class-select");
const setupGenerateCodeBtn = document.getElementById("setup-generate-code-btn");
const setupJoinCodeInput = document.getElementById("setup-join-code");
const setupVerificationCodeInput = document.getElementById("setup-verification-code");
const setupLoginLinkArea = document.getElementById("setup-login-link");
const copyLoginLinkBtn = document.getElementById("copy-login-link-btn");
const setupModelProviderSelect = document.getElementById("setup-model-provider-select");
const setupChatModelSelect = document.getElementById("setup-chat-model-select");
const setupChatModelManualInput = document.getElementById("setup-chat-model-manual");
const setupOpenModelBtn = document.getElementById("setup-open-model-btn");
const setupCurrentAllowedModelsEl = document.getElementById("setup-current-allowed-models");
const setupImageProviderSelect = document.getElementById("setup-image-provider-select");
const setupImageModelSelect = document.getElementById("setup-image-model-select");
const setupImageModelManualInput = document.getElementById("setup-image-model-manual");
const setupSaveImageBtn = document.getElementById("setup-save-image-btn");
const setupImageInheritChatBtn = document.getElementById("setup-image-inherit-chat-btn");
const setupCurrentAllowedImageModelsEl = document.getElementById("setup-current-allowed-image-models");
const studentJoinLoginForm = document.getElementById("student-join-login-form");
const studentJoinClassInfo = document.getElementById("student-join-class-info");
const studentJoinSelect = document.getElementById("student-join-select");
const studentLinkHint = document.getElementById("student-link-hint");
const toastEl = document.getElementById("toast");

const studentChatModelSelect = document.getElementById("student-chat-model-select");
const studentChatHistory = document.getElementById("student-chat-history");
const studentChatClearBtn = document.getElementById("student-chat-clear-btn");
const studentImageForm = document.getElementById("student-image-form");
const studentImageModelSelect = document.getElementById("student-image-model-select");
const studentImageSizeSelect = document.getElementById("student-image-size");
const studentImageNInput = document.getElementById("student-image-n");
const studentImagePromptInput = document.getElementById("student-image-prompt");
const studentImageSubmitBtn = document.getElementById("student-image-submit-btn");
const studentImagePreview = document.getElementById("student-image-preview");
const studentImageStatus = document.getElementById("student-image-status");
const studentImageDisabledHint = document.getElementById("student-image-disabled-hint");

const usageLimitInput = document.getElementById("usage-limit-input");
const usageStudentFilter = document.getElementById("usage-student-filter");
const usageRefreshBtn = document.getElementById("usage-refresh-btn");
const usageTableBody = document.querySelector("#usage-table tbody");
const usageDetails = document.getElementById("usage-details");

function log(data) {
  output.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 1800);
}

async function api(path, method = "GET", body, token) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw json;
  return json;
}

const TEACHER_TOKEN_STORAGE_KEY = "ai4k12.v1.teacherAccessToken";

function setPersistedTeacherToken(token) {
  if (token) localStorage.setItem(TEACHER_TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TEACHER_TOKEN_STORAGE_KEY);
}

function isStudentJoinUrl() {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("joinCode")?.trim() && params.get("teacherVerificationCode")?.trim());
}

async function initializeTeacherDashboardUI() {
  await refreshTeacherClasses();
  await refreshGradeOptions();
  await renderGradeTable();
  await renderClassTable();
  await refreshStudentGradeClassSelects();
  showSection(teacherDashboard);
  await refreshTeacherSetupSelects();
  await loadSystemSettings();
  setTeacherTab("setup");
  await loadSetupModelProviders().catch((e) => log(e));
  await refreshSetupAllowedModelsFromPolicy().catch((e) => log(e));
}

async function restoreTeacherSessionIfNeeded() {
  if (isStudentJoinUrl()) return;
  const token = localStorage.getItem(TEACHER_TOKEN_STORAGE_KEY);
  if (!token) return;
  try {
    await api("/api/v1/grades", "GET", undefined, token);
    state.teacherToken = token;
    await initializeTeacherDashboardUI();
  } catch {
    setPersistedTeacherToken(null);
    state.teacherToken = "";
  }
}

function list(value) {
  return String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
}

function parseRoster(raw) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, studentNo] = line.split(",").map((x) => x?.trim());
      return studentNo ? { displayName: name, studentNo } : { displayName: name };
    });
}

async function refreshTeacherClasses() {
  const ret = await api("/api/v1/classes?page=1&pageSize=100", "GET", undefined, state.teacherToken);
  importClassSelect.innerHTML = '<option value="">请选择班级</option>';
  for (const c of ret.data.classes) {
    const option = document.createElement("option");
    option.value = c.classId;
    option.textContent = `${c.className} (${c.seatUsed}/${c.seatLimit})`;
    importClassSelect.appendChild(option);
  }
  return ret;
}

async function refreshStudentGradeClassSelects() {
  const gradesRet = await api("/api/v1/grades", "GET", undefined, state.teacherToken);
  studentGradeSelect.innerHTML = '<option value="">请选择年级</option>';
  for (const g of gradesRet.data.grades) {
    const opt = document.createElement("option");
    opt.value = g.name;
    opt.textContent = g.name;
    studentGradeSelect.appendChild(opt);
  }

  const classesRet = await api("/api/v1/classes?page=1&pageSize=100", "GET", undefined, state.teacherToken);
  const allClasses = classesRet.data.classes || [];

  const fillClassesForGrade = (gradeName) => {
    studentClassIdSelect.innerHTML = '<option value="">请选择班级</option>';
    const filtered = allClasses.filter((c) => (c.gradeLevel || "") === gradeName);
    for (const c of filtered) {
      const opt = document.createElement("option");
      opt.value = c.classId;
      opt.textContent = `${c.className} (${c.seatUsed}/${c.seatLimit})`;
      studentClassIdSelect.appendChild(opt);
    }
    // Ensure default selection is a real classId (avoid blank select -> empty student list).
    if (filtered.length > 0) {
      const best = filtered.find((c) => c.seatUsed > 0) || filtered[0];
      studentClassIdSelect.value = best.classId;
      state.studentClassId = best.classId;
    } else {
      studentClassIdSelect.value = "";
      state.studentClassId = "";
    }
  };

  // Default to a class that actually has students (avoid empty initial table).
  if (gradesRet.data.grades.length > 0) {
    const seededClass = allClasses.find((c) => c.seatUsed > 0);
    const fallbackGrade = gradesRet.data.grades[0].name;
    const targetGrade = seededClass?.gradeLevel || fallbackGrade;
    studentGradeSelect.value = targetGrade;
    fillClassesForGrade(targetGrade);
  }
  await renderStudentTable();
}

studentGradeSelect.addEventListener("change", async () => {
  // Rebuild class options for the selected grade.
  if (!state.teacherToken) return;
  await refreshStudentGradeClassSelects();
});

studentClassIdSelect.addEventListener("change", async () => {
  if (!state.teacherToken) return;
  state.studentPage = 1;
  await renderStudentTable();
});

usageRefreshBtn?.addEventListener("click", async () => {
  try {
    await loadUsageLogs();
  } catch (e) {
    log(e);
  }
});

usageLimitInput?.addEventListener("change", async () => {
  try {
    await loadUsageLogs();
  } catch (e) {
    log(e);
  }
});

usageStudentFilter?.addEventListener("change", async () => {
  try {
    await loadUsageLogs();
  } catch (e) {
    log(e);
  }
});

async function refreshGradeOptions() {
  const ret = await api("/api/v1/grades", "GET", undefined, state.teacherToken);
  const all = ['<option value="">请选择年级</option>']
    .concat(ret.data.grades.map((g) => `<option value="${g.name}">${g.name}</option>`))
    .join("");
  classCreateGradeSelect.innerHTML = all;
  classEditGradeSelect.innerHTML = '<option value="">新年级（可选）</option>' + all.replace('<option value="">请选择年级</option>', "");
  return ret;
}

async function renderGradeTable() {
  const ret = await api("/api/v1/grades", "GET", undefined, state.teacherToken);
  document.getElementById("grade-total").textContent = `总数: ${ret.data.grades.length}`;
  const tbody = document.querySelector("#grade-table tbody");
  tbody.innerHTML = "";
  for (const g of ret.data.grades) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input type="checkbox" data-grade-check="${g.gradeId}" /></td><td>${g.gradeId}</td><td><input value="${g.name}" data-grade-id="${g.gradeId}" /></td><td><button data-grade-save="${g.gradeId}">保存</button> <button data-grade-del="${g.gradeId}">删除</button></td>`;
    tbody.appendChild(tr);
  }
}

async function renderClassTable() {
  const ret = await api(`/api/v1/classes?page=${state.classPage}&pageSize=${state.classPageSize}&q=${encodeURIComponent(state.classQ)}`, "GET", undefined, state.teacherToken);
  document.getElementById("class-total").textContent = `总数: ${ret.data.pagination.total}`;
  const tbody = document.querySelector("#class-table tbody");
  tbody.innerHTML = "";
  for (const c of ret.data.classes) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input type="checkbox" data-class-check="${c.classId}" /></td><td>${c.classId}</td><td><input value="${c.className}" data-class-name="${c.classId}" /></td><td><input value="${c.gradeLevel || ""}" data-class-grade="${c.classId}" /></td><td><input value="${c.seatLimit}" type="number" min="1" max="500" data-class-seat="${c.classId}" /></td><td><button data-class-save="${c.classId}">保存</button> <button data-class-del="${c.classId}">删除</button></td>`;
    tbody.appendChild(tr);
  }
}

async function renderStudentTable() {
  const classId = studentClassIdSelect?.value || state.studentClassId;
  if (!classId) return;
  const ret = await api(`/api/v1/classes/${classId}/students?page=${state.studentPage}&pageSize=${state.studentPageSize}&q=${encodeURIComponent(state.studentQ)}`, "GET", undefined, state.teacherToken);
  document.getElementById("student-total").textContent = `总数: ${ret.data.pagination.total}`;
  const tbody = document.querySelector("#student-table tbody");
  tbody.innerHTML = "";
  for (const s of ret.data.students) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input type="checkbox" data-student-check="${s.studentId}" /></td><td>${s.studentId}</td><td><input value="${s.studentNo}" data-student-no="${s.studentId}" /></td><td><input value="${s.displayName}" data-student-name="${s.studentId}" /></td><td><select data-student-status="${s.studentId}"><option value="active" ${s.status === "active" ? "selected" : ""}>active</option><option value="locked" ${s.status === "locked" ? "selected" : ""}>locked</option><option value="disabled" ${s.status === "disabled" ? "selected" : ""}>disabled</option></select></td><td><button data-student-save="${s.studentId}">保存</button> <button data-student-del="${s.studentId}">删除</button></td>`;
    tbody.appendChild(tr);
  }

  // Update usage log filter options using currently paged students.
  if (usageStudentFilter) {
    usageStudentFilter.innerHTML = '<option value="">全部学生</option>';
    for (const s of ret.data.students) {
      const opt = document.createElement("option");
      opt.value = s.studentId;
      opt.textContent = `${s.displayName} (${s.studentNo})`;
      usageStudentFilter.appendChild(opt);
    }
  }

  // Refresh latest usage logs for the selected class.
  await loadUsageLogs().catch((e) => log(e));
}

function escapeText(v) {
  return String(v ?? "");
}

async function loadUsageLogs() {
  if (!usageTableBody || !usageDetails) return;
  const classId = studentClassIdSelect?.value || state.studentClassId;
  if (!classId) return;

  const limit = usageLimitInput ? Number(usageLimitInput.value || 20) : 20;
  const studentId = usageStudentFilter?.value || "";

  const params = new URLSearchParams({ limit: String(limit) });
  if (studentId) params.set("studentId", studentId);

  const ret = await api(`/api/v1/classes/${classId}/usage?${params.toString()}`, "GET", undefined, state.teacherToken);
  state.usageItems = ret.data.items || [];

  usageTableBody.innerHTML = "";
  for (let i = 0; i < state.usageItems.length; i += 1) {
    const item = state.usageItems[i];
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    const timeTd = document.createElement("td");
    timeTd.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";

    const stuTd = document.createElement("td");
    stuTd.textContent = item.displayName ? `${item.displayName} (${item.studentNo})` : `${item.studentNo}`;

    const epTd = document.createElement("td");
    epTd.textContent = item.endpoint || "";

    const modelTd = document.createElement("td");
    modelTd.textContent = item.selectedModel || "";

    const previewTd = document.createElement("td");
    previewTd.textContent = escapeText(item.promptPreview).slice(0, 80);

    tr.appendChild(timeTd);
    tr.appendChild(stuTd);
    tr.appendChild(epTd);
    tr.appendChild(modelTd);
    tr.appendChild(previewTd);
    tr.dataset.usageIndex = String(i);
    usageTableBody.appendChild(tr);
  }

  usageDetails.textContent = "";

  // Show full request/response when user clicks a log row.
  usageTableBody.onclick = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const tr = t.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.usageIndex);
    const item = state.usageItems[idx];
    if (!item) return;
    usageDetails.textContent = JSON.stringify(
      {
        createdAt: item.createdAt,
        student: { studentId: item.studentId, studentNo: item.studentNo, displayName: item.displayName },
        endpoint: item.endpoint,
        selectedModel: item.selectedModel,
        requestPayload: item.requestPayload,
        responsePayload: item.responsePayload,
        costCny: item.costCny,
        fallbackUsed: item.fallbackUsed,
        statusCode: item.statusCode,
      },
      null,
      2,
    );
  };
}

async function loadStudentChatModels() {
  if (!studentChatModelSelect) return;
  if (!state.studentToken || !state.classId) return;

  // Ask backend for class-allowed chat models.
  try {
    const ret = await api("/api/v1/ai/models?endpoint=chat", "GET", undefined, state.studentToken);
    const models = ret.data.models || [];
    studentChatModelSelect.innerHTML = "";
    if (!models.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "未配置可用模型";
      studentChatModelSelect.appendChild(opt);
      return;
    }
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.displayName || m.id;
      studentChatModelSelect.appendChild(opt);
    }

    // Default to primary model.
    const primary = models.find((m) => m.isPrimary)?.id || models[0]?.id || "";
    studentChatModelSelect.value = primary;
  } catch (e) {
    toast(e?.code ? e.code : "加载模型失败");
    log(e);
  }
}

function setStudentImagePanelEnabled(enabled) {
  if (!studentImageForm) return;
  studentImageForm.classList.toggle("is-disabled", !enabled);
  studentImageDisabledHint?.classList.toggle("hidden", enabled);
}

async function loadStudentImageModels() {
  if (!studentImageModelSelect) return;
  if (!state.studentToken || !state.classId) {
    setStudentImagePanelEnabled(false);
    return;
  }

  try {
    const ret = await api("/api/v1/ai/models?endpoint=image", "GET", undefined, state.studentToken);
    const models = ret.data.models || [];
    studentImageModelSelect.innerHTML = "";

    if (!models.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "未开放文生图";
      studentImageModelSelect.appendChild(opt);
      setStudentImagePanelEnabled(false);
      return;
    }

    setStudentImagePanelEnabled(true);
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.displayName || m.id;
      studentImageModelSelect.appendChild(opt);
    }
    const primary = models.find((m) => m.isPrimary)?.id || models[0]?.id || "";
    studentImageModelSelect.value = primary;
  } catch (e) {
    setStudentImagePanelEnabled(false);
    toast(e?.code ? e.code : "加载文生图模型失败");
    log(e);
  }
}

function resetStudentChat() {
  state.studentChatMessages = [];
  renderStudentChatHistory();
}

function renderStudentChatHistory() {
  if (!studentChatHistory) return;
  studentChatHistory.innerHTML = "";
  if (!state.studentChatMessages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-message assistant";
    empty.textContent = "开始提问吧，系统会保留当前会话上下文。";
    studentChatHistory.appendChild(empty);
    return;
  }
  for (const m of state.studentChatMessages) {
    const row = document.createElement("div");
    row.className = `chat-message ${m.role === "user" ? "user" : "assistant"}`;
    const prefix = m.role === "user" ? "你：" : "AI：";
    row.textContent = `${prefix}${m.content}`;
    studentChatHistory.appendChild(row);
  }
  studentChatHistory.scrollTop = studentChatHistory.scrollHeight;
}

function showSection(sectionId) {
  [entryGateway, teacherAuth, studentAuth, teacherDashboard, studentWorkspace].forEach((el) => el && el.classList.add("hidden"));
  sectionId.classList.remove("hidden");
}

function setTeacherTab(tab) {
  const root = document.getElementById("teacher-dashboard");
  const items = root.querySelectorAll("[data-tab]");
  items.forEach((el) => {
    const key = el.getAttribute("data-tab") || "";
    el.classList.toggle("hidden", key !== tab);
  });
  const btns = root.querySelectorAll("button.tab-btn[data-teacher-tab]");
  btns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.teacherTab === tab);
  });
}

async function refreshTeacherSetupSelects() {
  const gradesRet = await api("/api/v1/grades", "GET", undefined, state.teacherToken);
  const classesRet = await api("/api/v1/classes?page=1&pageSize=100", "GET", undefined, state.teacherToken);
  const grades = gradesRet.data.grades || [];
  const allClasses = classesRet.data.classes || [];
  state.setupAllClasses = allClasses;

  setupGradeSelect.innerHTML = '<option value="">请选择年级</option>';
  for (const g of grades) {
    const opt = document.createElement("option");
    opt.value = g.name;
    opt.textContent = g.name;
    setupGradeSelect.appendChild(opt);
  }

  const seeded = allClasses.find((c) => c.seatUsed > 0) || allClasses[0];
  const targetGrade = seeded?.gradeLevel || grades[0]?.name || "";
  setupGradeSelect.value = targetGrade;
  populateSetupClassesForGrade(targetGrade);
}

function populateSetupClassesForGrade(gradeName) {
  const allClasses = state.setupAllClasses || [];
  setupClassSelect.innerHTML = '<option value="">请选择班级</option>';
  const filtered = allClasses.filter((c) => (c.gradeLevel || "") === gradeName);
  for (const c of filtered) {
    const opt = document.createElement("option");
    opt.value = c.classId;
    opt.textContent = `${c.className} (${c.seatUsed}/${c.seatLimit})`;
    setupClassSelect.appendChild(opt);
  }
  if (filtered.length > 0) {
    const best = filtered.find((c) => c.seatUsed > 0) || filtered[0];
    setupClassSelect.value = best.classId;
    state.setupClassId = best.classId;
    if (state.teacherToken) refreshSetupAllowedModelsFromPolicy().catch((e) => log(e));
  } else {
    setupClassSelect.value = "";
    state.setupClassId = "";
    if (state.teacherToken) refreshSetupAllowedModelsFromPolicy().catch((e) => log(e));
  }
}

async function loadSetupModelProviders() {
  if (!state.teacherToken) return;
  const ret = await api("/api/v1/system/providers", "GET", undefined, state.teacherToken);
  const providers = ret.data.providers || [];
  const fillSelect = (selectEl, emptyLabel) => {
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="">${emptyLabel}</option>`;
    for (const p of providers) {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = `${p.name} (${p.kind})`;
      selectEl.appendChild(opt);
    }
  };
  fillSelect(setupModelProviderSelect, "选择平台（需已在系统配置填 Key）");
  fillSelect(setupImageProviderSelect, "选择平台（留空表示不单独指定，沿用聊天 Key）");
}

async function loadSetupImageModels(providerKey) {
  if (!setupImageModelSelect || !providerKey) return;
  setupImageModelSelect.innerHTML = '<option value="">请选择文生图模型</option>';
  try {
    const ret = await api(`/api/v1/system/providers/${providerKey}/models`, "GET", undefined, state.teacherToken);
    const models = ret.data.models || [];
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.displayName || m.id;
      setupImageModelSelect.appendChild(opt);
    }
  } catch (e) {
    toast("文生图模型列表拉取失败，可手动填写模型 id");
  }

  const allowed = state.setupAllowedImageModels || [];
  const primary = allowed[0];
  if (primary && Array.from(setupImageModelSelect.options).some((o) => o.value === primary)) {
    setupImageModelSelect.value = primary;
  }
}

async function loadSetupChatModels(providerKey) {
  if (!setupChatModelSelect || !providerKey) return;
  setupChatModelSelect.innerHTML = '<option value="">请选择模型</option>';
  try {
    const ret = await api(`/api/v1/system/providers/${providerKey}/models`, "GET", undefined, state.teacherToken);
    const models = ret.data.models || [];
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.displayName || m.id;
      setupChatModelSelect.appendChild(opt);
    }
  } catch (e) {
    toast("拉取模型失败，可手动填写模型名");
    // Keep empty list; user can retry after saving keys.
  }

  // If policy already has an allowed model, pre-select it when present.
  const allowed = state.setupAllowedChatModels || [];
  const primary = allowed[0];
  if (primary && Array.from(setupChatModelSelect.options).some((o) => o.value === primary)) {
    setupChatModelSelect.value = primary;
  }
}

async function loadSystemSettings() {
  if (!state.teacherToken) return;
  try {
    const ret = await api("/api/v1/system/settings", "GET", undefined, state.teacherToken);
    state.systemPublicBaseUrl = ret?.data?.publicBaseUrl || "";
    state.systemPublicDomain = ret?.data?.publicDomain || "";
    state.systemPublicIp = ret?.data?.publicIp || "";
    if (systemPublicBaseUrlInput) {
      systemPublicBaseUrlInput.value = state.systemPublicBaseUrl;
    }
    if (systemPublicDomainInput) systemPublicDomainInput.value = state.systemPublicDomain;
    if (systemPublicIpInput) systemPublicIpInput.value = state.systemPublicIp;
  } catch (e) {
    log(e);
  }
}

async function refreshSetupAllowedModelsFromPolicy() {
  const classId = setupClassSelect?.value || state.setupClassId;
  if (!classId || !state.teacherToken) return;
  const ret = await api(`/api/v1/classes/${classId}/policies/ai-models`, "GET", undefined, state.teacherToken);
  state.setupAllowedChatModels = ret.data.allowedChatModels || [];
  state.setupAllowedImageModels = ret.data.allowedImageModels || [];

  const allowed = state.setupAllowedChatModels;
  const providerKey = ret.data.allowedChatProviderKey || "";

  setupCurrentAllowedModelsEl && (setupCurrentAllowedModelsEl.textContent = allowed.length ? `当前：${allowed.join(",")}` : "当前：未配置");

  const imgAllowed = state.setupAllowedImageModels;
  const imgProviderKey = ret.data.allowedImageProviderKey || "";
  setupCurrentAllowedImageModelsEl &&
    (setupCurrentAllowedImageModelsEl.textContent = imgAllowed.length ? `当前文生图：${imgAllowed.join(", ")}` : "当前文生图：未开放");

  // 1) Always ensure the model dropdown has options for currently allowed models.
  //    This fixes cases where providerKey isn't configured yet but we still want a visible dropdown.
  if (setupChatModelSelect) {
    setupChatModelSelect.innerHTML = "";
    if (allowed.length) {
      for (const m of allowed) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        setupChatModelSelect.appendChild(opt);
      }
      setupChatModelSelect.value = allowed[0];
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "未配置可用模型";
      setupChatModelSelect.appendChild(opt);
    }
  }

  if (setupImageModelSelect) {
    setupImageModelSelect.innerHTML = "";
    if (imgAllowed.length) {
      for (const m of imgAllowed) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        setupImageModelSelect.appendChild(opt);
      }
      setupImageModelSelect.value = imgAllowed[0];
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "未配置文生图模型";
      setupImageModelSelect.appendChild(opt);
    }
  }

  // 2) If we have providerKey, try to load the full provider model list
  //    and keep the current allowed model selected.
  if (setupModelProviderSelect && providerKey) {
    setupModelProviderSelect.value = providerKey;
    await loadSetupChatModels(providerKey).catch((e) => log(e));
    if (allowed[0] && setupChatModelSelect && Array.from(setupChatModelSelect.options).some((o) => o.value === allowed[0])) {
      setupChatModelSelect.value = allowed[0];
    }
  }

  if (setupImageProviderSelect) {
    if (imgProviderKey) {
      setupImageProviderSelect.value = imgProviderKey;
      await loadSetupImageModels(imgProviderKey).catch((e) => log(e));
      if (imgAllowed[0] && setupImageModelSelect && Array.from(setupImageModelSelect.options).some((o) => o.value === imgAllowed[0])) {
        setupImageModelSelect.value = imgAllowed[0];
      }
    } else {
      setupImageProviderSelect.value = "";
    }
  }
}

async function generateJoinLink() {
  const classId = setupClassSelect.value;
  if (!classId) return toast("请先选择班级");
  const ret = await api(`/api/v1/classes/${classId}/codes/rotate`, "POST", { rotateJoinCode: true, rotateTeacherVerificationCode: true, joinCodeExpiresInHours: 24 }, state.teacherToken);
  const joinCode = ret.data.joinCode;
  const teacherVerificationCode = ret.data.teacherVerificationCode;
  state.joinCode = joinCode;
  state.teacherVerificationCode = teacherVerificationCode;

  setupJoinCodeInput.value = joinCode;
  setupVerificationCodeInput.value = teacherVerificationCode;

  const baseUrl = (state.systemPublicBaseUrl || window.location.origin || "").replace(/\/+$/, "");
  const link = `${baseUrl}${window.location.pathname}?joinCode=${encodeURIComponent(joinCode)}&teacherVerificationCode=${encodeURIComponent(teacherVerificationCode)}`;
  setupLoginLinkArea.value = link;
  toast("登录链接已生成");
}

document.getElementById("go-teacher-auth")?.addEventListener("click", () => showSection(teacherAuth));
document.getElementById("go-student-auth")?.addEventListener("click", () => showSection(studentAuth));
document.getElementById("back-to-entry-1")?.addEventListener("click", () => showSection(entryGateway));
document.getElementById("back-to-entry-2")?.addEventListener("click", () => showSection(entryGateway));

// Teacher dashboard tabs & classroom code generation
document.querySelectorAll("#teacher-dashboard button.tab-btn[data-teacher-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.teacherTab;
    setTeacherTab(tab);
    if (tab === "system") {
      loadSystemProviders().catch((e) => log(e));
      loadSystemSettings().catch((e) => log(e));
    }
    if (tab === "setup") loadSetupModelProviders().catch((e) => log(e));
  });
});

if (setupGradeSelect && setupClassSelect) {
  setupGradeSelect.addEventListener("change", () => {
    populateSetupClassesForGrade(setupGradeSelect.value);
  });
  setupClassSelect.addEventListener("change", () => {
    state.setupClassId = setupClassSelect.value || "";
    refreshSetupAllowedModelsFromPolicy().catch((e) => log(e));
  });
}

setupGenerateCodeBtn?.addEventListener("click", () => {
  generateJoinLink().catch((e) => log(e));
});

copyLoginLinkBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(setupLoginLinkArea.value || "");
    toast("已复制登录链接");
  } catch {
    toast("复制失败，请手动复制");
  }
});

setupModelProviderSelect?.addEventListener("change", async () => {
  await loadSetupChatModels(setupModelProviderSelect.value);
});

setupOpenModelBtn?.addEventListener("click", async () => {
  try {
    const classId = setupClassSelect?.value || state.setupClassId;
    if (!classId) return toast("请先选择班级");
    const selectedModel = setupChatModelSelect?.value || setupChatModelManualInput?.value?.trim();
    const selectedProviderKey = setupModelProviderSelect?.value || undefined;
    if (!selectedModel) return toast("请选择要开放的聊天模型");

    const payload = {
      chatModels: [selectedModel],
    };
    // Only include providerKey when user actually selected it; otherwise don't overwrite.
    if (selectedProviderKey) payload.chatProviderKey = selectedProviderKey;

    await api(
      `/api/v1/classes/${classId}/policies/ai-models`,
      "PUT",
      payload,
      state.teacherToken,
    );
    await refreshSetupAllowedModelsFromPolicy();
    toast("已保存并开放给学生");
  } catch (e) {
    toast(e?.code ? e.code : "保存失败");
    log(e);
  }
});

setupImageProviderSelect?.addEventListener("change", async () => {
  await loadSetupImageModels(setupImageProviderSelect.value);
});

setupSaveImageBtn?.addEventListener("click", async () => {
  try {
    const classId = setupClassSelect?.value || state.setupClassId;
    if (!classId) return toast("请先选择班级");
    const selectedModel = setupImageModelSelect?.value || setupImageModelManualInput?.value?.trim();
    if (!selectedModel) return toast("请选择或填写文生图模型");
    const imageProviderKey = setupImageProviderSelect?.value?.trim() || undefined;
    /** @type {{ imageModels: string[]; imageProviderKey?: string | null }} */
    const payload = { imageModels: [selectedModel] };
    if (imageProviderKey) payload.imageProviderKey = imageProviderKey;

    await api(`/api/v1/classes/${classId}/policies/ai-models`, "PUT", payload, state.teacherToken);
    await refreshSetupAllowedModelsFromPolicy();
    toast("文生图设置已保存");
  } catch (e) {
    toast(e?.code ? e.code : "保存失败");
    log(e);
  }
});

setupImageInheritChatBtn?.addEventListener("click", async () => {
  try {
    const classId = setupClassSelect?.value || state.setupClassId;
    if (!classId) return toast("请先选择班级");
    await api(
      `/api/v1/classes/${classId}/policies/ai-models`,
      "PUT",
      { imageProviderKey: null },
      state.teacherToken,
    );
    await refreshSetupAllowedModelsFromPolicy();
    toast("文生图将使用与聊天相同的平台 Key");
  } catch (e) {
    toast(e?.code ? e.code : "保存失败");
    log(e);
  }
});

async function loadSystemProviders() {
  if (!systemProviderSelect) return;
  const ret = await api("/api/v1/system/providers", "GET", undefined, state.teacherToken);
  systemProviderSelect.innerHTML = '<option value="">选择平台</option>';
  for (const p of ret.data.providers) {
    const opt = document.createElement("option");
    opt.value = p.key;
    opt.textContent = `${p.name} (${p.kind})`;
    systemProviderSelect.appendChild(opt);
  }
}

async function saveAndFetchModels() {
  if (!systemProviderSelect) return;
  const providerKey = systemProviderSelect.value;
  const apiKey = systemApiKeyInput.value.trim();
  const baseUrl = systemBaseUrlInput.value || undefined;
  if (!providerKey) return toast("请选择平台");
  systemFetchHint && (systemFetchHint.style.display = "inline");
  systemModelResults.textContent = "";
  try {
    // API Key is optional here:
    // - when provided: update persisted key then fetch models
    // - when empty: directly fetch models with existing persisted key
    if (apiKey) {
      await api(`/api/v1/system/providers/${providerKey}/keys`, "PUT", { apiKey, baseUrl }, state.teacherToken);
    }
    const modelsRet = await api(`/api/v1/system/providers/${providerKey}/models`, "GET", undefined, state.teacherToken);
    const models = modelsRet.data.models || [];
    systemModelResults.textContent = JSON.stringify(models, null, 2);
    toast(apiKey ? `已保存并拉取 ${models.length} 个模型` : `已使用已保存 Key 拉取 ${models.length} 个模型`);
  } catch (e) {
    systemModelResults.textContent = JSON.stringify(e, null, 2);
    if (!apiKey && e?.code === "PROVIDER_KEY_MISSING") {
      toast("未找到已保存的 Key，请先填写并保存一次");
    } else {
      toast(e?.code ? e.code : "拉取模型失败");
    }
  } finally {
    systemFetchHint && (systemFetchHint.style.display = "none");
  }
}

systemSaveAndFetchModelsBtn?.addEventListener("click", () => {
  saveAndFetchModels().catch((e) => log(e));
});

systemSavePublicBaseUrlBtn?.addEventListener("click", async () => {
  try {
    const v = systemPublicBaseUrlInput?.value?.trim() || "";
    const payload = { publicBaseUrl: v || null };
    const ret = await api("/api/v1/system/settings", "PUT", payload, state.teacherToken);
    state.systemPublicBaseUrl = ret?.data?.publicBaseUrl || "";
    if (systemPublicBaseUrlInput) systemPublicBaseUrlInput.value = state.systemPublicBaseUrl;
    toast("链接地址已保存");
  } catch (e) {
    toast(e?.code ? e.code : "保存失败");
    log(e);
  }
});

systemSaveDomainIpBtn?.addEventListener("click", async () => {
  try {
    const domain = systemPublicDomainInput?.value?.trim() || "";
    const ip = systemPublicIpInput?.value?.trim() || "";
    const payload = {
      publicDomain: domain || null,
      publicIp: ip || null,
    };
    const ret = await api("/api/v1/system/settings", "PUT", payload, state.teacherToken);
    state.systemPublicBaseUrl = ret?.data?.publicBaseUrl || "";
    state.systemPublicDomain = ret?.data?.publicDomain || "";
    state.systemPublicIp = ret?.data?.publicIp || "";
    if (systemPublicBaseUrlInput) systemPublicBaseUrlInput.value = state.systemPublicBaseUrl;
    if (systemPublicDomainInput) systemPublicDomainInput.value = state.systemPublicDomain;
    if (systemPublicIpInput) systemPublicIpInput.value = state.systemPublicIp;
    toast("域名/IP 已保存");
  } catch (e) {
    toast(e?.code ? e.code : "保存失败");
    log(e);
  }
});

const teacherLoginForm = document.getElementById("teacher-login-form");
const teacherRegisterForm = document.getElementById("teacher-register-form");
document.getElementById("show-teacher-login").addEventListener("click", () => {
  teacherLoginForm.classList.remove("hidden");
  teacherRegisterForm.classList.add("hidden");
});
document.getElementById("show-teacher-register").addEventListener("click", () => {
  teacherRegisterForm.classList.remove("hidden");
  teacherLoginForm.classList.add("hidden");
});

document.getElementById("teacher-register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const ret = await api("/api/v1/teacher/register", "POST", { email: f.email.value, password: f.password.value, fullName: f.fullName.value });
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("teacher-login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const ret = await api("/api/v1/teacher/login", "POST", { email: f.email.value, password: f.password.value });
    state.teacherToken = ret.data.accessToken;
    setPersistedTeacherToken(ret.data.accessToken);
    await initializeTeacherDashboardUI();
    toast("登录成功");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("class-create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const ret = await api("/api/v1/classes", "POST", { className: f.className.value, gradeLevel: f.gradeLevel.value || undefined, seatLimit: Number(f.seatLimit.value || 50) }, state.teacherToken);
    state.classId = ret.data.classId;
    await refreshTeacherClasses();
    await renderClassTable();
    await refreshStudentGradeClassSelects();
    await refreshTeacherSetupSelects();
    toast("班级创建成功");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("grade-crud-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const action = f.action.value;
  try {
    let ret;
    if (action === "create") ret = await api("/api/v1/grades", "POST", { name: f.name.value }, state.teacherToken);
    if (action === "list") ret = await api("/api/v1/grades", "GET", undefined, state.teacherToken);
    if (action === "update") ret = await api(`/api/v1/grades/${f.gradeId.value}`, "PUT", { name: f.name.value }, state.teacherToken);
    if (action === "delete") ret = await api(`/api/v1/grades/${f.gradeId.value}`, "DELETE", undefined, state.teacherToken);
    await refreshGradeOptions();
    await renderGradeTable();
    await renderClassTable();
    toast("年级操作成功");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("class-crud-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const action = f.action.value;
  try {
    let ret;
    if (action === "list") ret = await api("/api/v1/classes", "GET", undefined, state.teacherToken);
    if (action === "detail") ret = await api(`/api/v1/classes/${f.classId.value}`, "GET", undefined, state.teacherToken);
    if (action === "update") ret = await api(`/api/v1/classes/${f.classId.value}`, "PUT", { className: f.className.value || undefined, gradeLevel: f.gradeLevel.value || undefined, seatLimit: f.seatLimit.value ? Number(f.seatLimit.value) : undefined }, state.teacherToken);
    if (action === "delete") ret = await api(`/api/v1/classes/${f.classId.value}`, "DELETE", undefined, state.teacherToken);
    await refreshTeacherClasses();
    await renderClassTable();
    toast("班级操作成功");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("refresh-classes-btn").addEventListener("click", async () => {
  try {
    const ret = await refreshTeacherClasses();
    await renderClassTable();
    log(ret);
  } catch (err) {
    log(err);
  }
});
document.getElementById("refresh-grade-table").addEventListener("click", async () => {
  try {
    await refreshGradeOptions();
    await renderGradeTable();
    log("年级表已刷新");
  } catch (err) {
    log(err);
  }
});

document.getElementById("student-import-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const ret = await api(`/api/v1/classes/${f.classId.value}/students/import`, "POST", { students: parseRoster(f.studentsRaw.value), defaultPasswordResetRequired: true }, state.teacherToken);
    await refreshTeacherClasses();
    await refreshStudentGradeClassSelects();
    toast("名单导入成功");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("student-generate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const classId = f.classId.value || state.classId;
    const ret = await api(`/api/v1/classes/${classId}/students/batch-generate`, "POST", { count: Number(f.count.value || 1), namingRule: "S{index}" }, state.teacherToken);
    await refreshTeacherClasses();
    await refreshStudentGradeClassSelects();
    toast("批量生成成功");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("keyword-policy-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const ret = await api(`/api/v1/classes/${f.classId.value}/policies/keywords`, "PUT", { whitelist: list(f.whitelist.value), blacklist: list(f.blacklist.value) }, state.teacherToken);
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("student-ban-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const ret =
      f.action.value === "ban"
        ? await api(`/api/v1/classes/${f.classId.value}/students/${f.studentId.value}/ban`, "POST", { reason: f.reason.value || "teacher action", durationMinutes: 60 }, state.teacherToken)
        : await api(`/api/v1/classes/${f.classId.value}/students/${f.studentId.value}/unban`, "POST", {}, state.teacherToken);
    await renderStudentTable();
    toast("封禁状态已更新");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("student-crud-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const action = f.action.value;
  try {
    let ret;
    if (action === "list") ret = await api(`/api/v1/classes/${f.classId.value}/students`, "GET", undefined, state.teacherToken);
    if (action === "create") ret = await api(`/api/v1/classes/${f.classId.value}/students`, "POST", { displayName: f.displayName.value, studentNo: f.studentNo.value || undefined }, state.teacherToken);
    if (action === "update") ret = await api(`/api/v1/classes/${f.classId.value}/students/${f.studentId.value}`, "PUT", { displayName: f.displayName.value || undefined, studentNo: f.studentNo.value || undefined, status: f.status.value || undefined }, state.teacherToken);
    if (action === "delete") ret = await api(`/api/v1/classes/${f.classId.value}/students/${f.studentId.value}`, "DELETE", undefined, state.teacherToken);
    await refreshTeacherClasses();
    await renderStudentTable();
    toast("学生操作成功");
    log(ret);
  } catch (err) {
    log(err);
  }
});

document.getElementById("class-search-btn").addEventListener("click", async () => {
  state.classQ = document.getElementById("class-search-input").value;
  state.classPage = 1;
  await renderClassTable();
});
document.getElementById("class-prev-btn").addEventListener("click", async () => {
  state.classPage = Math.max(1, state.classPage - 1);
  await renderClassTable();
});
document.getElementById("class-next-btn").addEventListener("click", async () => {
  state.classPage += 1;
  await renderClassTable();
});
document.getElementById("student-search-btn").addEventListener("click", async () => {
  state.studentQ = document.getElementById("student-search-input").value;
  state.studentPage = 1;
  await renderStudentTable();
});
document.getElementById("student-prev-btn").addEventListener("click", async () => {
  state.studentPage = Math.max(1, state.studentPage - 1);
  await renderStudentTable();
});
document.getElementById("student-next-btn").addEventListener("click", async () => {
  state.studentPage += 1;
  await renderStudentTable();
});

document.addEventListener("click", async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  try {
    if (t.dataset.gradeSave) {
      const id = t.dataset.gradeSave;
      const name = document.querySelector(`input[data-grade-id="${id}"]`).value;
      const ret = await api(`/api/v1/grades/${id}`, "PUT", { name }, state.teacherToken);
      await refreshGradeOptions();
      await renderGradeTable();
      toast("保存成功");
      log(ret);
    }
    if (t.dataset.gradeDel) {
      const id = t.dataset.gradeDel;
      const ret = await api(`/api/v1/grades/${id}`, "DELETE", undefined, state.teacherToken);
      await refreshGradeOptions();
      await renderGradeTable();
      await renderClassTable();
      toast("删除成功");
      log(ret);
    }
    if (t.dataset.classSave) {
      const id = t.dataset.classSave;
      const className = document.querySelector(`input[data-class-name="${id}"]`).value;
      const gradeLevel = document.querySelector(`input[data-class-grade="${id}"]`).value;
      const seatLimit = Number(document.querySelector(`input[data-class-seat="${id}"]`).value);
      const ret = await api(`/api/v1/classes/${id}`, "PUT", { className, gradeLevel: gradeLevel || null, seatLimit }, state.teacherToken);
      await renderClassTable();
      await refreshTeacherClasses();
      toast("保存成功");
      log(ret);
    }
    if (t.dataset.classDel) {
      const id = t.dataset.classDel;
      const ret = await api(`/api/v1/classes/${id}`, "DELETE", undefined, state.teacherToken);
      await renderClassTable();
      await refreshTeacherClasses();
      toast("删除成功");
      log(ret);
    }
    if (t.dataset.studentSave) {
      const studentId = t.dataset.studentSave;
      const classId = studentClassIdSelect?.value || state.studentClassId;
      const studentNo = document.querySelector(`input[data-student-no="${studentId}"]`).value;
      const displayName = document.querySelector(`input[data-student-name="${studentId}"]`).value;
      const status = document.querySelector(`select[data-student-status="${studentId}"]`).value;
      const ret = await api(`/api/v1/classes/${classId}/students/${studentId}`, "PUT", { studentNo, displayName, status }, state.teacherToken);
      await renderStudentTable();
      toast("保存成功");
      log(ret);
    }
    if (t.dataset.studentDel) {
      const studentId = t.dataset.studentDel;
      const classId = studentClassIdSelect?.value || state.studentClassId;
      const ret = await api(`/api/v1/classes/${classId}/students/${studentId}`, "DELETE", undefined, state.teacherToken);
      await renderStudentTable();
      await refreshTeacherClasses();
      toast("删除成功");
      log(ret);
    }
  } catch (err) {
    log(err);
  }
});

document.getElementById("grade-check-all").addEventListener("change", (e) => {
  const checked = e.target.checked;
  document.querySelectorAll('input[data-grade-check]').forEach((x) => (x.checked = checked));
});
document.getElementById("class-check-all").addEventListener("change", (e) => {
  const checked = e.target.checked;
  document.querySelectorAll('input[data-class-check]').forEach((x) => (x.checked = checked));
});
document.getElementById("student-check-all").addEventListener("change", (e) => {
  const checked = e.target.checked;
  document.querySelectorAll('input[data-student-check]').forEach((x) => (x.checked = checked));
});

document.getElementById("grade-bulk-delete-btn").addEventListener("click", async () => {
  const ids = [...document.querySelectorAll('input[data-grade-check]:checked')].map((x) => x.dataset.gradeCheck);
  if (!ids.length) return toast("请先勾选要删除的年级");
  for (const id of ids) await api(`/api/v1/grades/${id}`, "DELETE", undefined, state.teacherToken);
  await refreshGradeOptions();
  await renderGradeTable();
  await renderClassTable();
  toast(`已批量删除 ${ids.length} 个年级`);
});

document.getElementById("class-bulk-delete-btn").addEventListener("click", async () => {
  const ids = [...document.querySelectorAll('input[data-class-check]:checked')].map((x) => x.dataset.classCheck);
  if (!ids.length) return toast("请先勾选要删除的班级");
  for (const id of ids) await api(`/api/v1/classes/${id}`, "DELETE", undefined, state.teacherToken);
  await refreshTeacherClasses();
  await renderClassTable();
  toast(`已批量删除 ${ids.length} 个班级`);
});

document.getElementById("student-bulk-delete-btn").addEventListener("click", async () => {
  const classId = studentClassIdSelect?.value || state.studentClassId;
  if (!classId) return toast("请先选择班级");
  const ids = [...document.querySelectorAll('input[data-student-check]:checked')].map((x) => x.dataset.studentCheck);
  if (!ids.length) return toast("请先勾选要删除的学生");
  for (const id of ids) await api(`/api/v1/classes/${classId}/students/${id}`, "DELETE", undefined, state.teacherToken);
  await refreshTeacherClasses();
  await renderStudentTable();
  toast(`已批量删除 ${ids.length} 个学生`);
});

// Join-login via teacher-generated link (public join)
if (studentJoinLoginForm) {
  studentJoinLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const studentNo = studentJoinSelect.value;
      if (!state.joinCode || !state.teacherVerificationCode) {
        return toast("缺少班级登录链接信息");
      }
      const ret = await api("/api/v1/public/join/login", "POST", {
        joinCode: state.joinCode,
        teacherVerificationCode: state.teacherVerificationCode,
        studentNo,
      });
      state.studentToken = ret.data.accessToken;
      state.classId = ret.data.student.classId;
      resetStudentChat();
      showSection(studentWorkspace);
      await loadStudentChatModels().catch((err) => log(err));
      await loadStudentImageModels().catch((err) => log(err));
      toast("已登录学生账号");
      history.replaceState({}, document.title, window.location.pathname);
      log(ret);
    } catch (err) {
      log(err);
      toast(err?.code ? err.code : "登录失败");
    }
  });
}

studentChatClearBtn?.addEventListener("click", () => {
  resetStudentChat();
  toast("会话已清空");
});

document.getElementById("student-chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const prompt = String(f.prompt.value || "").trim();
  if (!prompt) return;
  state.studentChatMessages.push({ role: "user", content: prompt });
  renderStudentChatHistory();
  f.prompt.value = "";
  try {
    const selectedModel = studentChatModelSelect?.value || undefined;
    const messages = state.studentChatMessages.map((m) => ({ role: m.role, content: m.content }));
    const ret = await api(
      "/api/v1/ai/chat/completions",
      "POST",
      { classId: state.classId, model: selectedModel || undefined, messages },
      state.studentToken,
    );
    if (ret?.data?.outputText) {
      state.studentChatMessages.push({ role: "assistant", content: ret.data.outputText });
      renderStudentChatHistory();
      output.textContent = ret.data.outputText;
      toast("回复已生成");
    } else {
      log(ret);
    }
  } catch (err) {
    state.studentChatMessages.push({ role: "assistant", content: `请求失败：${err?.message || err?.code || "发送失败"}` });
    renderStudentChatHistory();
    log(err);
    toast(err?.code ? err.code : "发送失败");
  }
});

studentImageForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (studentImageForm.classList.contains("is-disabled")) return;
  const prompt = String(studentImagePromptInput?.value || "").trim();
  if (!prompt) return toast("请填写画面描述");

  const model = studentImageModelSelect?.value || undefined;
  if (!model) return toast("请选择文生图模型");

  const size = studentImageSizeSelect?.value || "1024x1024";
  const n = Math.min(4, Math.max(1, Number(studentImageNInput?.value || 1)));

  if (studentImagePreview) studentImagePreview.innerHTML = "";
  if (studentImageStatus) {
    studentImageStatus.textContent = "生成中…";
    studentImageStatus.classList.remove("hidden");
  }
  if (studentImageSubmitBtn) studentImageSubmitBtn.disabled = true;

  try {
    const ret = await api(
      "/api/v1/ai/images/generations",
      "POST",
      { classId: state.classId, prompt, model, size, n },
      state.studentToken,
    );
    const d = ret.data;
    if (studentImageStatus) {
      if (d?.jobId) {
        studentImageStatus.textContent = `已排队：${d.jobId}（演示模式，约 ${d.estimatedSeconds ?? "?"} 秒）`;
      } else {
        studentImageStatus.textContent = d?.fallbackUsed === false ? "已由上游生成" : "已完成";
      }
    }

    if (d?.imageUrl && studentImagePreview) {
      const img = document.createElement("img");
      img.src = d.imageUrl;
      img.alt = "文生图结果";
      studentImagePreview.appendChild(img);
    } else if (d?.b64Json && studentImagePreview) {
      const img = document.createElement("img");
      img.src = `data:image/png;base64,${d.b64Json}`;
      img.alt = "文生图结果";
      studentImagePreview.appendChild(img);
    } else if (d?.jobId && studentImagePreview) {
      const p = document.createElement("p");
      p.style.fontSize = "13px";
      p.style.color = "#6b7280";
      p.textContent = "当前为队列/演示响应，配置上游文生图后将在此显示图片。";
      studentImagePreview.appendChild(p);
    }

    toast(d?.imageUrl || d?.b64Json ? "图片已生成" : "请求已提交");
    log(ret);
  } catch (err) {
    if (studentImageStatus) {
      studentImageStatus.textContent = `失败：${err?.message || err?.code || "未知错误"}`;
    }
    log(err);
    toast(err?.code ? err.code : "文生图失败");
  } finally {
    if (studentImageSubmitBtn) studentImageSubmitBtn.disabled = false;
  }
});

renderStudentChatHistory();

document.getElementById("teacher-logout-btn")?.addEventListener("click", () => {
  state.teacherToken = "";
  setPersistedTeacherToken(null);
  showSection(teacherAuth);
  toast("已退出登录");
});

// Restore teacher session (after refresh), then optional student join-link flow from URL query
(async () => {
  await restoreTeacherSessionIfNeeded();
  try {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("joinCode");
    const teacherVerificationCode = params.get("teacherVerificationCode");
    if (!joinCode || !teacherVerificationCode) return;
    if (!studentJoinLoginForm || !studentJoinSelect) return;

    state.joinCode = joinCode;
    state.teacherVerificationCode = teacherVerificationCode;

    studentLinkHint?.classList.add("hidden");
    studentJoinLoginForm.classList.remove("hidden");

    studentJoinClassInfo.textContent = "正在加载班级名单...";
    showSection(studentAuth);

    const rosterRes = await fetch(
      `/api/v1/public/join/students?joinCode=${encodeURIComponent(joinCode)}&teacherVerificationCode=${encodeURIComponent(
        teacherVerificationCode,
      )}`,
      { method: "GET" },
    );
    const rosterJson = await rosterRes.json();
    if (!rosterRes.ok) throw rosterJson;

    const students = rosterJson.data.students || [];
    studentJoinSelect.innerHTML = '<option value="">请选择你的名字</option>';
    for (const s of students) {
      const opt = document.createElement("option");
      opt.value = s.studentNo;
      opt.textContent = `${s.displayName} (${s.studentNo})`;
      studentJoinSelect.appendChild(opt);
    }

    studentJoinClassInfo.textContent = `班级：${rosterJson.data.className}`;
  } catch (e) {
    toast(e?.code ? e.code : "无法加载登录链接信息");
    studentJoinLoginForm?.classList.add("hidden");
    studentLinkHint?.classList.remove("hidden");
    showSection(studentAuth);
  }
})();

