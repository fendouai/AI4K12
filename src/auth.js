import jwt from "jsonwebtoken";
import { config } from "./config.js";

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.accessTokenTtlSeconds });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function authRequired(expectedRole) {
  return (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json(errorResp("AUTH_MISSING", "Missing bearer token", req.id));
    }
    try {
      const payload = verifyToken(token);
      if (expectedRole && payload.role !== expectedRole) {
        return res.status(403).json(errorResp("AUTH_FORBIDDEN", "Forbidden role", req.id));
      }
      req.auth = payload;
      return next();
    } catch {
      return res.status(401).json(errorResp("AUTH_INVALID", "Invalid token", req.id));
    }
  };
}

export function okResp(reqId, data, message = "success") {
  return { code: "OK", message, requestId: reqId, data };
}

export function errorResp(code, message, reqId, details = {}) {
  return { code, message, requestId: reqId, details };
}

