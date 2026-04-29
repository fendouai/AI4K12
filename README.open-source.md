# AI4K12

> Classroom-safe AI platform for K12 teachers and students.

A practical MVP that helps teachers create classes, onboard students in minutes, and run AI-powered classroom activities with policy controls, quotas, and audit-friendly logs.

---

## Why AI4K12

Most general AI tools are not designed for real classrooms.  
AI4K12 focuses on classroom-first workflows:

- **Fast onboarding**: class join codes + student login codes, no phone number required
- **Teacher control plane**: class policies, allowed models, keyword rules, per-student limits
- **Safety by default**: auth guardrails, lockouts, ban/unban, whitelist/blacklist checks
- **AI gateway foundation**: chat, image generation, storybook, and video task APIs
- **Extensible architecture**: easy to evolve from MVP to production stack

---

## Key Features

### Teacher Experience

- Teacher register/login with lockout protection
- Grade/Class CRUD with pagination and search
- Batch student account generation and roster import
- Class code + teacher verification code rotation
- Model policy management per class
- Provider key management and model discovery
- Realtime classroom dashboard endpoint
- Rich usage log viewer (request/response level)

### Student Experience

- Join by class code + verification code
- Login by class ID + student number + login code
- Join-link flow with student roster selection
- Chat with class-allowed models
- Image, storybook, and video generation tasks

### Governance & Safety

- JWT role-based auth (`teacher` / `student`)
- Student-level and class-level quota enforcement
- Keyword whitelist/blacklist policy
- Student ban/unban controls
- Unified response/error contract for frontend integration

---

## Quick Demo

### 1) Install

```bash
npm install
```

### 2) Run

```bash
npm run dev
```

Open: `http://localhost:3000`

### 3) Login (seeded demo account)

- Teacher email: `fendouai@gmail.com`
- Teacher password: `wo2010WO`

---

## API Surface (high level)

Base path: `/api/v1`

- **Teacher/Auth**: `/teacher/register`, `/teacher/login`
- **Classroom Management**: `/grades`, `/classes`, `/classes/:classId/students`
- **Policy & Governance**:
  - `/classes/:classId/policies/ai-models`
  - `/classes/:classId/policies/keywords`
  - `/classes/:classId/students/:studentId/limits`
  - `/classes/:classId/students/:studentId/ban`
- **AI Endpoints**:
  - `/ai/models`
  - `/ai/chat/completions`
  - `/ai/images/generations`
  - `/ai/storybooks/generations`
  - `/ai/videos/generations`
- **Observability**:
  - `/classes/:classId/usage`
  - `/classes/:classId/dashboard/realtime`

For full engineering details, see `README.md`.

---

## Built With

- Node.js + Express 5
- Zod
- JSON Web Token
- bcryptjs
- Vitest + Supertest
- Vanilla HTML/CSS/JS demo console

---

## Testing

```bash
npm test
```

```bash
npm run test:coverage
```

The project includes business-flow tests + branch-focused guardrail tests.

---

## Project Status

Current status: **MVP / Demo-ready**

What is already implemented:

- End-to-end teacher -> class -> student -> AI flow
- Policy controls and quota enforcement
- Provider key and model catalog integration points
- Comprehensive API tests

What is intentionally simplified:

- In-memory storage (not persistent DB)
- Simplified async task execution for image/storybook/video
- No production queue / distributed rate limiter yet

---

## Roadmap

- [ ] Persist data to PostgreSQL + Redis
- [ ] Add queue-based async workers (e.g., BullMQ)
- [ ] Add OpenAPI docs + contract tests
- [ ] Add multi-school tenancy and billing
- [ ] Add production-grade audit trails and alerting

---

## Contributing

Issues and PRs are welcome.

Recommended first steps:

1. Fork and clone the repo
2. Create a feature branch
3. Add/adjust tests with your change
4. Open a PR with a short test plan

---

## Security Notice

This repository ships with demo credentials and development defaults.  
Do **not** use as-is in production.

Before production use, rotate secrets, remove seeded credentials, add persistent storage, and complete security/compliance hardening.

