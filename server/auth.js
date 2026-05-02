import crypto from "node:crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlJson(value) {
  return base64Url(JSON.stringify(value));
}

function timingSafeEqual(a, b) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  if (first.length !== second.length) return false;
  return crypto.timingSafeEqual(first, second);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(":");
  if (!salt || !originalHash) return false;

  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(hash, originalHash);
}

export function signToken(user, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };

  const body = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${body}.${signature}`;
}

export function verifyToken(token, secret) {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const body = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (!timingSafeEqual(signature, expected)) return null;

  const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const payload = JSON.parse(json);
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}
