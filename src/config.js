export const config = {
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-prod",
  accessTokenTtlSeconds: 60 * 60 * 2,
  loginMaxAttempts: 5,
  lockMinutes: 15,
  defaultJoinCodeHours: 24,
};

