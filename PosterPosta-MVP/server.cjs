'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 3 * 1024 * 1024;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_MS = 10 * 60 * 1000;
const COOKIE = 'pp_session';
// 敏感账号操作（绑定/解绑邮箱、改主邮箱、设密码、踢下线）要求本会话在这段时间内完成过身份验证。
const REAUTH_MS = 15 * 60 * 1000;
const MAX_EMAILS = 5;
// 密码登录：15 分钟内连续 5 次失败锁定 15 分钟（按邮箱；生产再加出口 IP）。
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const sha256 = value => crypto.createHash('sha256').update(value).digest();
const hex = value => sha256(value).toString('hex');
const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const randomToken = () => crypto.randomBytes(32).toString('base64url');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function fail(status, code, message) { throw new ApiError(status, code, message); }
function text(value, label, min = 1, max = 500) {
  if (typeof value !== 'string') fail(400, 'INVALID_INPUT', `${label}须为文字。`);
  const result = value.trim();
  const size = Array.from(result).length;
  if (size < min || size > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    fail(400, 'INVALID_INPUT', `${label}须为 ${min}–${max} 个有效字符。`);
  }
  return result;
}
function nameText(value) {
  const result = text(value, '姓名', 1, 50);
  if (/[\r\n\t]/.test(result)) fail(400, 'INVALID_INPUT', '姓名不能包含控制字符。');
  return result;
}
function emailText(value) {
  if (typeof value !== 'string') fail(400, 'INVALID_EMAIL', '请输入有效的邮箱。');
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  const [local, domain] = parts;
  if (email.length > 254 || parts.length !== 2 || !local || local.length > 64 ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !domain || !domain.includes('.') || domain.split('.').some(p => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p))) {
    fail(400, 'INVALID_EMAIL', '请输入有效的邮箱。');
  }
  return email;
}
function cents(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value))) {
    fail(400, 'INVALID_PRICE', '价格须为 0.01–999 元，最多两位小数。');
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.01 || n > 999 || Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) {
    fail(400, 'INVALID_PRICE', '价格须为 0.01–999 元，最多两位小数。');
  }
  return Math.round(n * 100);
}
function objectInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_INPUT', '请求参数须为对象。');
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160) fail(400, 'INVALID_INPUT', '标识无效。');
  return value;
}
function imageData(value) {
  if (typeof value !== 'string' || value.length > 2800000) fail(400, 'INVALID_IMAGE', '图片不能超过 2 MB。');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) fail(400, 'INVALID_IMAGE', '只支持 PNG、JPEG、WebP base64 图片，不接受 SVG。');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 2 * 1024 * 1024 || bytes.toString('base64') !== match[2]) fail(400, 'INVALID_IMAGE', '图片大小或 base64 编码无效。');
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0;
  const jpeg = bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 &&
    bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  const webp = bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.readUInt32LE(4) === bytes.length - 8 && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
  if (!({ png, jpeg, webp })[match[1]]) fail(400, 'INVALID_IMAGE', '图片魔数与声明格式不匹配。');
  return value;
}
function addBusinessDays(value, days) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(days) || days < 0 || days > 3660) throw new TypeError('工作日参数无效');
  while (days > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) days--;
  }
  return date.toISOString();
}
function haversine(from, to) {
  const r = d => d * Math.PI / 180;
  const a = Math.sin(r(to.lat - from.lat) / 2) ** 2 + Math.cos(r(from.lat)) * Math.cos(r(to.lat)) * Math.sin(r(to.lng - from.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
function loadCatalog() {
  // 只运行静态城市/catalog 声明；不执行原型的 seed、load 或 localStorage。
  const source = fs.readFileSync(path.join(PUBLIC_DIR, 'engine.js'), 'utf8');
  const end = source.indexOf('  const products = [];');
  if (end < 0) throw new Error('engine catalog 结构不受支持');
  const data = vm.runInNewContext(source.slice(0, end) + '\nreturn { cities, catalog }; })({});', Object.create(null), { timeout: 1000 });
  return JSON.parse(JSON.stringify(data));
}
function loopback(ip) { return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'; }
function clientIP(req, trustProxy) {
  let ip = req.socket.remoteAddress || '';
  if (trustProxy === 'loopback' && loopback(ip) && req.headers['x-forwarded-for'] !== undefined) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded !== 'string' || forwarded !== forwarded.trim() || !net.isIP(forwarded)) {
      fail(400, 'INVALID_FORWARDED_IP', '仅接受可信本机代理提供的单个合法 IP。');
    }
    ip = forwarded;
  }
  if (ip.startsWith('::ffff:') && net.isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return ip;
}
function isPublicIP(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  return net.isIP(ip) === 6 && !/^(::|f[cd]|fe[89ab]|ff)/i.test(ip);
}
function cityFromTencent(payload, cities) {
  if (payload?.status !== 0 || typeof payload.result?.ad_info?.city !== 'string') return null;
  const name = payload.result.ad_info.city.trim().replace(/市$/, '');
  return Object.entries(cities).find(([, city]) => city.name === name)?.[0] || null;
}
async function lookupTencent({ ip, key }) {
  const url = new URL('https://apis.map.qq.com/ws/location/v1/ip');
  url.searchParams.set('ip', ip);
  url.searchParams.set('key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error('位置服务不可用');
  return response.json();
}
async function sendResend({ apiKey, from, to, subject, text: body, idempotencyKey }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from, to: [to], subject, text: body })
  });
  if (!response.ok) throw new Error('邮件服务未确认接受');
  const data = await response.json();
  if (typeof data.id !== 'string' || data.id.length < 1 || data.id.length > 256) throw new Error('邮件服务响应无效');
  return { id: data.id };
}
function passwordText(value) {
  const message = '密码须为 8–128 个字符，且同时包含字母和数字。';
  if (typeof value !== 'string') fail(400, 'INVALID_PASSWORD', message);
  const size = Array.from(value).length;
  if (size < 8 || size > 128 || !/[A-Za-z]/.test(value) || !/\d/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) fail(400, 'INVALID_PASSWORD', message);
  return value;
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}
const DUMMY_PASSWORD_HASH = hashPassword('not-a-real-password-0');
// 无论账号是否存在、是否设过密码，都完整跑一次 scrypt，避免用响应时间探测账号。
function checkPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  const real = parts.length === 6 && parts[0] === 'scrypt';
  const [, N, r, p, salt, hash] = real ? parts : DUMMY_PASSWORD_HASH.split('$');
  const expected = Buffer.from(hash, 'base64');
  const supplied = typeof password === 'string' && password.length <= 512 ? password.normalize('NFKC') : '';
  const actual = crypto.scryptSync(supplied, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(actual, expected) && real;
}
function deviceLabel(ua) {
  if (typeof ua !== 'string' || !ua) return '未知设备';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /MicroMessenger/.test(ua) ? '微信' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|curl|undici/i.test(ua) ? '脚本客户端' : '';
  return [browser, os].filter(Boolean).join(' · ') || '未知设备';
}
function publicUser(row) { return row ? { id: row.id, email: row.email, name: row.name } : null; }
function maskEmail(email) {
  const [local, domain] = email.split('@');
  const labels = domain.split('.');
  return `${local[0]}***@${labels[0][0]}***.${labels.at(-1)}`;
}

// 部署参数可以随源码放进 deploy.config.json：有些托管环境不会把启动命令里的
// 环境变量传给进程，也会在打包时跳过 .env 之类的文件，所以两个位置都找一遍。
// 只在调用方没有显式传入 env 时读取，且真实环境变量优先。
function deployEnvDefaults() {
  for (const relative of ['deploy.config.json', 'public/deploy.config.json', 'deploy.env.json']) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(path.join(__dirname, relative), 'utf8')); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const values = parsed.env;
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    const out = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/.test(key)) out[key] = value;
    }
    if (Object.keys(out).length) return out;
  }
  return {};
}
function createApp(options = {}) {
  const env = options.env ? { ...options.env } : { ...deployEnvDefaults(), ...process.env };
  const mode = env.APP_ENV || 'development';
  if (!['development', 'production'].includes(mode)) throw new Error('APP_ENV 必须是 development 或 production');
  const dev = mode === 'development';
  const port = env.PORT === undefined ? 4180 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 无效');
  if (env.TRUST_PROXY && env.TRUST_PROXY !== 'loopback') throw new Error('TRUST_PROXY 仅支持 loopback 或留空');
  // 默认只监听本机回环。部署到反向代理之后（例如云端沙箱）才用 HOST=0.0.0.0 放开，
  // 并且必须同时用 ALLOWED_HOSTS 明确列出对外域名，否则请求仍会被 Host 校验挡下。
  const bindHost = String(env.HOST ?? '127.0.0.1').trim();
  if (!['127.0.0.1', '::1', 'localhost', '0.0.0.0', '::'].includes(bindHost)) {
    throw new Error('HOST 仅支持 127.0.0.1、::1、localhost 或 0.0.0.0');
  }
  const hostPatterns = [];
  if (env.ALLOWED_HOSTS !== undefined && String(env.ALLOWED_HOSTS).trim() !== '') {
    for (const raw of String(env.ALLOWED_HOSTS).split(',')) {
      const item = raw.trim().toLowerCase();
      if (!item) continue;
      if (!/^(\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/.test(item)) throw new Error('ALLOWED_HOSTS 含无效条目');
      hostPatterns.push(item);
    }
    if (!hostPatterns.length) throw new Error('ALLOWED_HOSTS 未包含有效条目');
  }
  let publicOrigin = null;
  if (env.PUBLIC_ORIGIN) {
    try {
      const url = new URL(env.PUBLIC_ORIGIN);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
      publicOrigin = url.origin;
    } catch { throw new Error('PUBLIC_ORIGIN 必须是有效的单一站点 origin'); }
  }
  const mailReady = Boolean(env.RESEND_API_KEY?.trim() && env.MAIL_FROM?.trim() && !/[\r\n]/.test(env.MAIL_FROM));
  const locationReady = Boolean(env.TENCENT_LOCATION_KEY?.trim());
  if (!dev && (!publicOrigin?.startsWith('https://') || !mailReady || !locationReady)) {
    throw new Error('生产启动需要 HTTPS PUBLIC_ORIGIN、RESEND_API_KEY、MAIL_FROM 和 TENCENT_LOCATION_KEY');
  }
  const clock = options.now || Date.now;
  const now = () => {
    const value = new Date(clock()).getTime();
    if (!Number.isFinite(value)) throw new Error('时间源无效');
    return value;
  };
  const iso = () => new Date(now()).toISOString();
  const rateLimitMs = options.rateLimitMs ?? 60000;
  if (!Number.isFinite(rateLimitMs) || rateLimitMs < 0) throw new Error('rateLimitMs 无效');
  const { cities, catalog } = loadCatalog();
  const cityKey = value => {
    if (typeof value !== 'string' || !Object.hasOwn(cities, value)) fail(400, 'INVALID_CITY', '请选择 catalog 中的城市。');
    return value;
  };
  const dbPath = options.dbPath || env.DB_PATH || path.join(__dirname, 'data', dev ? 'development.sqlite' : 'production.sqlite');
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') fs.chmodSync(dbPath, 0o600);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      claimed_free INTEGER NOT NULL DEFAULT 0 CHECK(claimed_free IN (0,1)), created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash BLOB PRIMARY KEY, user_id TEXT REFERENCES users(id), location TEXT,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS otps (
      email TEXT PRIMARY KEY, salt BLOB NOT NULL, code_hash BLOB NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, consumed_at INTEGER
    ) STRICT;
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, requested_at INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, base INTEGER NOT NULL CHECK(base IN (0,1)), creator_id TEXT REFERENCES users(id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), owner_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('unused','listed','used','sent','received')),
      source TEXT NOT NULL, resale_allowed INTEGER NOT NULL CHECK(resale_allowed IN (0,1)), created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS assets_owner ON assets(owner_id);
    CREATE TABLE IF NOT EXISTS creations (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL UNIQUE REFERENCES products(id), user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('pending','approved')), data TEXT NOT NULL, review_note TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), product_id TEXT NOT NULL REFERENCES products(id),
      seller_id TEXT NOT NULL REFERENCES users(id), buyer_id TEXT REFERENCES users(id),
      price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 1 AND 99900), description TEXT NOT NULL,
      active INTEGER NOT NULL CHECK(active IN (0,1)), source TEXT NOT NULL, sandbox INTEGER NOT NULL,
      created_at TEXT NOT NULL, sold_at TEXT
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS active_asset ON listings(asset_id) WHERE active=1;
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id), asset_id TEXT NOT NULL REFERENCES assets(id),
      market_id TEXT REFERENCES listings(id), amount_cents INTEGER NOT NULL, sandbox INTEGER NOT NULL,
      description TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS letters (
      id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id), receiver_id TEXT REFERENCES users(id),
      to_email TEXT NOT NULL, asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id), stamp_asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id),
      status TEXT NOT NULL CHECK(status IN ('transit','sandbox_ready','accepted','delivered','received')),
      data TEXT NOT NULL, claim_hash BLOB NOT NULL UNIQUE, claimed_at TEXT,
      sandbox INTEGER NOT NULL, accepted_at TEXT, delivered_at TEXT, delivery_note TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS letters_participants ON letters(sender_id,receiver_id);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, letter_id TEXT NOT NULL UNIQUE REFERENCES letters(id),
      status TEXT NOT NULL CHECK(status IN ('pending','processing','sandbox_ready','accepted','done','uncertain')),
      due_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT, error_code TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS due_jobs ON jobs(status,due_at);
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY, market_id TEXT NOT NULL REFERENCES listings(id), product_id TEXT NOT NULL REFERENCES products(id),
      buyer_id TEXT NOT NULL REFERENCES users(id), seller_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
      UNIQUE(market_id,buyer_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, letter_id TEXT REFERENCES letters(id), thread_id TEXT REFERENCES threads(id),
      author_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, time TEXT NOT NULL,
      CHECK((letter_id IS NULL) != (thread_id IS NULL))
    ) STRICT;
    CREATE INDEX IF NOT EXISTS letter_messages ON messages(letter_id);
    CREATE INDEX IF NOT EXISTS thread_messages ON messages(thread_id);
    -- 一个邮箱全局只能属于一个账号；users.email 是其中被设为「主邮箱」的那一个。
    CREATE TABLE IF NOT EXISTS user_emails (
      email TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      verified_at TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS user_emails_user ON user_emails(user_id);
    -- 登录验证码仍在 otps；绑定新邮箱与二次验证的验证码按用途、账号隔离在这里。
    CREATE TABLE IF NOT EXISTS email_codes (
      purpose TEXT NOT NULL CHECK(purpose IN ('bind','reauth')), user_id TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL,
      salt BLOB NOT NULL, code_hash BLOB NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, consumed_at INTEGER,
      PRIMARY KEY(purpose, user_id, email)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS auth_failures (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, first_at INTEGER NOT NULL, locked_until INTEGER
    ) STRICT;
  `);
  // 旧库迁移：只加列、不改已有数据；可重复执行。
  const columnsOf = table => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  const userColumns = columnsOf('users');
  for (const [name, type] of [['password_hash', 'TEXT'], ['password_changed_at', 'TEXT']]) {
    if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  const sessionColumns = columnsOf('sessions');
  for (const [name, type] of [['verified_at', 'INTEGER'], ['user_agent', 'TEXT'], ['last_seen_at', 'INTEGER']]) {
    if (!sessionColumns.has(name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`);
  }
  db.exec('INSERT OR IGNORE INTO user_emails(email,user_id,verified_at,created_at) SELECT email,id,created_at,created_at FROM users');
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  transaction(() => {
    for (const item of catalog) run('INSERT OR IGNORE INTO products(id,data,base,creator_id) VALUES(?,?,1,NULL)', item.id, JSON.stringify(item));
  });
  const sendMail = options.mailTransport || sendResend;
  const locate = options.locationTransport || lookupTencent;
  const locationCache = new Map();
  let closing = false;
  let workerPromise = null;
  let closePromise = null;
  const mailTasks = new Set();
  const config = () => ({
    appEnv: mode, development: dev, publicOrigin, bindHost, allowedHosts: [...hostPatterns], paymentConfigured: false,
    sandboxPurchase: dev, setLocation: dev, markDelivered: dev, reviewCreation: dev, reset: false,
    email: { configured: mailReady, mode: dev ? 'disabled-development' : 'resend', deliveryWebhooksConfigured: false },
    location: { configured: locationReady, provider: 'tencent', trustProxy: env.TRUST_PROXY || false },
    auth: { methods: ['email-code', 'password'], maxEmails: MAX_EMAILS, reauthMinutes: REAUTH_MS / 60000, codeMinutes: OTP_MS / 60000 },
    persistence: 'sqlite', income: 0
  });
  function product(productId) {
    const row = get('SELECT * FROM products WHERE id=?', identifier(productId));
    if (!row) fail(404, 'PRODUCT_NOT_FOUND', '未找到作品。');
    return { ...JSON.parse(row.data), base: Boolean(row.base) };
  }
  function assetJSON(row) {
    return { id: row.id, productId: row.product_id, status: row.status, source: row.source, createdAt: row.created_at };
  }
  function ownedAsset(ctx, assetId) {
    const row = get('SELECT * FROM assets WHERE id=? AND owner_id=?', identifier(assetId), ctx.user.id);
    if (!row) fail(404, 'ASSET_NOT_FOUND', '未找到你拥有的资产。');
    return row;
  }
  function requireUnused(row) {
    if (row.status !== 'unused') fail(409, 'ASSET_NOT_UNUSED', '资产已使用或已锁定。');
  }
  function insertAsset(userId, productId, source, resaleAllowed = true) {
    const assetId = id('asset');
    run('INSERT INTO assets(id,product_id,owner_id,status,source,resale_allowed,created_at) VALUES(?,?,?,?,?,?,?)', assetId, productId, userId, 'unused', source, Number(resaleAllowed), iso());
    return get('SELECT * FROM assets WHERE id=?', assetId);
  }
  function listing(marketId) {
    const row = get('SELECT l.*,u.name AS seller_name FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=?', identifier(marketId));
    if (!row) fail(404, 'LISTING_NOT_FOUND', '未找到市场记录。');
    return row;
  }
  function listingJSON(row, userId) {
    return {
      id: row.id, productId: row.product_id, assetId: row.asset_id, price: row.price_cents / 100,
      seller: row.seller_name, sellerInitial: Array.from(row.seller_name)[0], description: row.description,
      active: Boolean(row.active), own: row.seller_id === userId, source: row.source,
      createdAt: row.created_at, sandbox: Boolean(row.sandbox), demo: Boolean(row.sandbox)
    };
  }
  function messages(kind, value) {
    const column = kind === 'letter' ? 'letter_id' : 'thread_id';
    return all(`SELECT m.*,u.name AS author FROM messages m JOIN users u ON u.id=m.author_id WHERE m.${column}=? ORDER BY m.rowid`, value)
      .map(m => ({ id: m.id, authorId: m.author_id, author: m.author, text: m.text, time: m.time }));
  }
  function letterJSON(row, userId = null) {
    // 收发方身份按账号判断：主邮箱可以更换，寄信时快照下来的 fromEmail 不再可靠。
    const role = userId && row.sender_id === userId ? 'sender' : userId && row.receiver_id === userId ? 'recipient' : null;
    return {
      ...JSON.parse(row.data), role, status: row.status, sandbox: Boolean(row.sandbox), demo: Boolean(row.sandbox),
      acceptedAt: row.accepted_at, deliveredAt: row.delivered_at, receivedAt: row.claimed_at,
      deliveryNote: row.delivery_note, messages: messages('letter', row.id)
    };
  }
  function threadJSON(row, userId) {
    const peer = get('SELECT name FROM users WHERE id=?', row.buyer_id === userId ? row.seller_id : row.buyer_id);
    return {
      id: row.id, title: `关于「${product(row.product_id).title}」的交易咨询`, peer: peer.name,
      productId: row.product_id, marketId: row.market_id, messages: messages('thread', row.id)
    };
  }
  function creationJSON(row) {
    return { ...JSON.parse(row.data), status: row.status, reviewNote: row.review_note };
  }
  function bootstrap(ctx) {
    const userId = ctx.user?.id || null;
    const user = userId ? get('SELECT * FROM users WHERE id=?', userId) : null;
    const verifiedAt = ctx.session?.verified_at;
    const fresh = Boolean(user && verifiedAt && now() - verifiedAt <= REAUTH_MS);
    const state = {
      user: publicUser(user), account: user ? { ...accountJSON(user), verifiedUntil: fresh ? new Date(verifiedAt + REAUTH_MS).toISOString() : null } : null,
      location: ctx.location,
      claimedFree: Boolean(user?.claimed_free), assets: [], letters: [], creations: [], transactions: [],
      market: all('SELECT l.*,u.name AS seller_name FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.active=1 ORDER BY l.rowid DESC')
        .map(row => listingJSON(row, userId)),
      community: [], revenue: 0, income: 0
    };
    if (user) {
      state.assets = all('SELECT * FROM assets WHERE owner_id=? ORDER BY rowid', userId).map(assetJSON);
      state.letters = all('SELECT * FROM letters WHERE sender_id=? OR receiver_id=? ORDER BY rowid', userId, userId).map(row => letterJSON(row, userId));
      state.creations = all('SELECT * FROM creations WHERE user_id=? ORDER BY rowid', userId).map(creationJSON);
      state.community = all('SELECT * FROM threads WHERE buyer_id=? OR seller_id=? ORDER BY rowid', userId, userId).map(row => threadJSON(row, userId));
      state.transactions = all('SELECT * FROM transactions WHERE user_id=? ORDER BY rowid', userId).map(row => ({
        id: row.id, type: row.type, productId: row.product_id, assetId: row.asset_id, marketId: row.market_id,
        amount: row.amount_cents / 100, actualAmount: 0, sandbox: Boolean(row.sandbox), demo: Boolean(row.sandbox),
        description: row.description, createdAt: row.created_at
      }));
    }
    const products = all(`SELECT p.* FROM products p LEFT JOIN creations c ON c.product_id=p.id
      WHERE p.base=1 OR c.status='approved' OR c.user_id=?
      OR EXISTS(SELECT 1 FROM assets a WHERE a.product_id=p.id AND a.owner_id=?)
      OR EXISTS(SELECT 1 FROM letters l JOIN assets a ON a.id=l.asset_id OR a.id=l.stamp_asset_id WHERE a.product_id=p.id AND (l.sender_id=? OR l.receiver_id=?))
      OR EXISTS(SELECT 1 FROM threads t WHERE t.product_id=p.id AND (t.buyer_id=? OR t.seller_id=?))
      ORDER BY p.rowid`, userId, userId, userId, userId, userId, userId).map(row => JSON.parse(row.data));
    return { state, products, cities, config: config() };
  }
  function cookie(res, token, clear = false) {
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_MS / 1000}${dev ? '' : '; Secure'}`);
  }
  function createSession(res, userId, location, meta = {}) {
    const token = randomToken();
    const hash = sha256(token);
    const ua = typeof meta.ua === 'string' && meta.ua ? meta.ua.slice(0, 300) : null;
    const at = now();
    const verifiedAt = meta.verified ? at : null;
    run('INSERT INTO sessions(token_hash,user_id,location,created_at,expires_at,verified_at,user_agent,last_seen_at) VALUES(?,?,?,?,?,?,?,?)',
      hash, userId, location, at, at + SESSION_MS, verifiedAt, ua, at);
    cookie(res, token);
    return { token_hash: hash, user_id: userId, location, created_at: at, expires_at: at + SESSION_MS, verified_at: verifiedAt, user_agent: ua, last_seen_at: at };
  }
  async function context(req, res) {
    const ip = clientIP(req, env.TRUST_PROXY);
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
    const cookies = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
    const token = cookies.length === 1 ? cookies[0].slice(COOKIE.length + 1) : '';
    let session = /^[A-Za-z0-9_-]{43}$/.test(token) ? get('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?', sha256(token), now()) : null;
    if (!session) session = createSession(res, null, dev ? 'tokyo' : null, { ua });
    else if (session.user_id && (!session.last_seen_at || now() - session.last_seen_at > 60000)) {
      // 「最近活跃」只做粗粒度记录，一分钟内的请求不重复写库。
      run('UPDATE sessions SET last_seen_at=? WHERE token_hash=?', now(), session.token_hash);
      session.last_seen_at = now();
    }
    let location = dev ? session.location : null;
    if (!dev && isPublicIP(ip)) {
      const key = sha256(ip).toString('hex');
      const cache = locationCache.get(key);
      if (cache && cache.expires > now()) location = cache.city;
      else {
        try { location = cityFromTencent(await locate({ ip, key: env.TENCENT_LOCATION_KEY }), cities); }
        catch { location = null; }
        if (locationCache.size >= 1000) locationCache.delete(locationCache.keys().next().value);
        locationCache.set(key, { city: location, expires: now() + 5 * 60 * 1000 });
      }
    }
    const user = session.user_id ? get('SELECT * FROM users WHERE id=?', session.user_id) : null;
    return { session, user, location, ip, ua };
  }
  function requireUser(ctx) { if (!ctx.user) fail(401, 'AUTH_REQUIRED', '请先验证邮箱并登录。'); }
  function requireFresh(ctx) {
    requireUser(ctx);
    const at = ctx.session.verified_at;
    if (!at || now() - at > REAUTH_MS) fail(403, 'REAUTH_REQUIRED', '为保护账号安全，请先验证身份再继续。');
  }
  function userByEmail(email) {
    return get('SELECT u.* FROM user_emails e JOIN users u ON u.id=e.user_id WHERE e.email=?', email) || null;
  }
  function ownsEmail(userId, email) {
    return Boolean(userId && get('SELECT 1 AS ok FROM user_emails WHERE email=? AND user_id=?', email, userId));
  }
  function emailCount(userId) { return get('SELECT count(*) AS n FROM user_emails WHERE user_id=?', userId).n; }
  function accountJSON(user) {
    if (!user) return null;
    const emails = all('SELECT * FROM user_emails WHERE user_id=? ORDER BY created_at, rowid', user.id)
      .map(row => ({ email: row.email, primary: row.email === user.email, verifiedAt: row.verified_at }));
    return {
      ...publicUser(user), emails, maxEmails: MAX_EMAILS, hasPassword: Boolean(user.password_hash),
      passwordChangedAt: user.password_changed_at || null, createdAt: user.created_at
    };
  }
  function reloadUser(ctx) { ctx.user = get('SELECT * FROM users WHERE id=?', ctx.user.id); return ctx.user; }
  function startLogin(ctx, res, user) {
    run('DELETE FROM sessions WHERE token_hash=?', ctx.session.token_hash);
    return createSession(res, user.id, dev ? ctx.location : null, { ua: ctx.ua, verified: true });
  }
  // 登录失败计数：窗口外自动重置；达到上限后锁定，锁定期内连正确密码也不接受。
  function failureKeys(ctx, email) {
    const keys = [`pw:email:${hex(email)}`];
    if (!dev) keys.push(`pw:ip:${hex(ctx.ip)}`);
    return keys;
  }
  function assertNotLocked(keys) {
    for (const key of keys) {
      const row = get('SELECT * FROM auth_failures WHERE key=?', key);
      if (row?.locked_until && row.locked_until > now()) {
        const minutes = Math.max(1, Math.ceil((row.locked_until - now()) / 60000));
        fail(429, 'LOGIN_LOCKED', `密码错误次数过多，请 ${minutes} 分钟后再试，或改用邮箱验证码登录。`);
      }
    }
  }
  function recordFailure(keys) {
    for (const key of keys) {
      const row = get('SELECT * FROM auth_failures WHERE key=?', key);
      if (!row || now() - row.first_at > FAILURE_WINDOW_MS) {
        run('INSERT INTO auth_failures VALUES(?,1,?,NULL) ON CONFLICT(key) DO UPDATE SET count=1,first_at=excluded.first_at,locked_until=NULL', key, now());
      } else {
        const count = row.count + 1;
        run('UPDATE auth_failures SET count=?,locked_until=? WHERE key=?', count, count >= MAX_FAILURES ? now() + LOCK_MS : row.locked_until, key);
      }
    }
  }
  function requireDev() { if (!dev) fail(403, 'DEVELOPMENT_ONLY', '此测试功能在生产环境禁用。'); }
  function requireLocation(ctx) { if (!ctx.location || !Object.hasOwn(cities, ctx.location)) fail(403, 'LOCATION_UNKNOWN', '无法确认当前城市，不能进行当地操作。'); }
  function estimate(ctx, city) {
    cityKey(city);
    requireLocation(ctx);
    const distance = haversine(cities[ctx.location], cities[city]);
    const [min, max] = distance <= 1000 ? [1, 3] : distance <= 5000 ? [3, 6] : [6, 10];
    return { min, max, distance: Math.round(distance) };
  }
  async function deliverMail(payload) {
    const task = Promise.resolve().then(() => sendMail({ ...payload, apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }));
    mailTasks.add(task);
    try {
      const result = await task;
      if (typeof result?.id !== 'string' || !result.id || result.id.length > 256) throw new Error('邮件服务响应无效');
      return result;
    } finally { mailTasks.delete(task); }
  }
  async function requestOTP(ctx, body) {
    const email = emailText(body.email);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(code, salt, 32);
    transaction(() => {
      // 邮箱维度始终限流；IP 维度只在生产启用 —— 托管沙箱里所有访客共用同一个出口 IP，
      // 按 IP 限流会让同时演示的人互相把对方卡住（开发环境本就不发送真实邮件）。
      const keys = [`email:${sha256(email).toString('hex')}`];
      if (!dev) keys.push(`ip:${sha256(ctx.ip).toString('hex')}`);
      for (const key of keys) {
        const limit = get('SELECT requested_at FROM rate_limits WHERE key=?', key);
        if (limit && now() - limit.requested_at < rateLimitMs) fail(429, 'RATE_LIMITED', '验证码请求过于频繁，请稍后再试。');
      }
      for (const key of keys) run('INSERT INTO rate_limits VALUES(?,?) ON CONFLICT(key) DO UPDATE SET requested_at=excluded.requested_at', key, now());
      run(`INSERT INTO otps VALUES(?,?,?,0,?,NULL) ON CONFLICT(email) DO UPDATE SET
        salt=excluded.salt,code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,consumed_at=NULL`, email, salt, hash, now() + OTP_MS);
    });
    if (dev) return { devCode: code, emailSent: false, sandbox: true, note: '本地开发验证码，未发送任何邮件。' };
    try {
      await deliverMail({ to: email, subject: 'PosterPosta 登录验证码', text: `你的验证码是 ${code}，10 分钟内有效，请勿转发。`, idempotencyKey: id('otp') });
    } catch {
      run('UPDATE otps SET consumed_at=? WHERE email=? AND code_hash=?', now(), email, hash);
      fail(503, 'MAIL_UNAVAILABLE', '验证码邮件暂时无法发送，请稍后再试。');
    }
    return { emailSent: true, status: 'accepted' };
  }
  function verifyOTP(ctx, res, body) {
    const email = emailText(body.email);
    // 昵称只在注册新邮箱时需要；已有账号登录时忽略，不会被覆盖。
    const blankName = body.name === undefined || body.name === null || (typeof body.name === 'string' && body.name.trim() === '');
    const name = blankName ? null : nameText(body.name);
    // 失败计数必须提交，不能随着 HTTP 错误一起回滚。
    const result = transaction(() => {
      const otp = get('SELECT * FROM otps WHERE email=?', email);
      if (!otp || otp.consumed_at !== null || otp.expires_at <= now()) return { error: [400, 'OTP_INVALID_OR_EXPIRED', '验证码无效、已使用或已过期。'] };
      if (otp.attempts >= 5) return { error: [429, 'OTP_LOCKED', '验证码已锁定，请重新申请。'] };
      const supplied = typeof body.code === 'string' && /^\d{6}$/.test(body.code) ? body.code : '';
      const hash = crypto.scryptSync(supplied, Buffer.from(otp.salt), 32);
      if (!crypto.timingSafeEqual(hash, Buffer.from(otp.code_hash))) {
        run('UPDATE otps SET attempts=attempts+1 WHERE email=?', email);
        return { error: otp.attempts + 1 >= 5 ? [429, 'OTP_LOCKED', '验证码已锁定，请重新申请。'] : [400, 'OTP_INVALID_OR_EXPIRED', '验证码无效、已使用或已过期。'] };
      }
      let user = userByEmail(email);
      // 新邮箱但没给昵称：不消费验证码，让前端补填昵称后用同一个验证码重新提交。
      if (!user && !name) return { error: [400, 'NAME_REQUIRED', '这是一个新邮箱，请填写昵称完成注册。'] };
      run('UPDATE otps SET consumed_at=? WHERE email=?', now(), email);
      if (!user) {
        const userId = id('user');
        run('INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)', userId, email, name, iso());
        run('INSERT INTO user_emails(email,user_id,verified_at,created_at) VALUES(?,?,?,?)', email, userId, iso(), iso());
        user = get('SELECT * FROM users WHERE id=?', userId);
      }
      // 能收到邮箱验证码就证明了邮箱所有权，顺带清掉这个邮箱的密码失败计数。
      run('DELETE FROM auth_failures WHERE key=?', `pw:email:${hex(email)}`);
      return { user, session: startLogin(ctx, res, user) };
    });
    if (result.error) fail(...result.error);
    ctx.user = result.user;
    ctx.session = result.session;
    return publicUser(ctx.user);
  }
  function passwordLogin(ctx, res, body) {
    const email = emailText(body.email);
    const keys = failureKeys(ctx, email);
    assertNotLocked(keys);
    const user = userByEmail(email);
    const matched = checkPassword(body.password, user?.password_hash);
    if (!user || !matched) {
      recordFailure(keys);
      assertNotLocked(keys);
      fail(400, 'INVALID_CREDENTIALS', '邮箱或密码不正确。没有设置过密码的账号，请用邮箱验证码登录。');
    }
    const session = transaction(() => {
      run('DELETE FROM auth_failures WHERE key=?', keys[0]);
      return startLogin(ctx, res, user);
    });
    ctx.user = user;
    ctx.session = session;
    return publicUser(user);
  }
  function logout(ctx, res) {
    run('DELETE FROM sessions WHERE token_hash=?', ctx.session.token_hash);
    ctx.user = null;
    ctx.location = dev ? 'tokyo' : ctx.location;
    cookie(res, '', true);
    return null;
  }

  // ---- 账号内验证码（绑定新邮箱、二次验证）----
  async function issueCode(ctx, purpose, email, subject, intro) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(code, salt, 32);
    transaction(() => {
      const keys = [`${purpose}:email:${hex(email)}`];
      if (!dev) keys.push(`${purpose}:ip:${hex(ctx.ip)}`);
      for (const key of keys) {
        const limit = get('SELECT requested_at FROM rate_limits WHERE key=?', key);
        if (limit && now() - limit.requested_at < rateLimitMs) fail(429, 'RATE_LIMITED', '验证码请求过于频繁，请稍后再试。');
      }
      for (const key of keys) run('INSERT INTO rate_limits VALUES(?,?) ON CONFLICT(key) DO UPDATE SET requested_at=excluded.requested_at', key, now());
      run(`INSERT INTO email_codes VALUES(?,?,?,?,?,0,?,NULL) ON CONFLICT(purpose,user_id,email) DO UPDATE SET
        salt=excluded.salt,code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,consumed_at=NULL`,
        purpose, ctx.user.id, email, salt, hash, now() + OTP_MS);
    });
    if (dev) return { devCode: code, emailSent: false, sandbox: true, sentTo: maskEmail(email), note: '本地开发验证码，未发送任何邮件。' };
    try {
      await deliverMail({ to: email, subject, text: `${intro}验证码是 ${code}，10 分钟内有效，请勿转发。如果不是你本人操作，请忽略本邮件。`, idempotencyKey: id(purpose) });
    } catch {
      run('UPDATE email_codes SET consumed_at=? WHERE purpose=? AND user_id=? AND email=? AND code_hash=?', now(), purpose, ctx.user.id, email, hash);
      fail(503, 'MAIL_UNAVAILABLE', '验证码邮件暂时无法发送，请稍后再试。');
    }
    return { emailSent: true, status: 'accepted', sentTo: maskEmail(email) };
  }
  // 返回错误数组而不是直接抛出，好让失败次数在事务里提交。
  function consumeCode(ctx, purpose, email, code) {
    const row = get('SELECT * FROM email_codes WHERE purpose=? AND user_id=? AND email=?', purpose, ctx.user.id, email);
    if (!row || row.consumed_at !== null || row.expires_at <= now()) return [400, 'CODE_INVALID_OR_EXPIRED', '验证码无效、已使用或已过期。'];
    if (row.attempts >= 5) return [429, 'CODE_LOCKED', '验证码已锁定，请重新获取。'];
    const supplied = typeof code === 'string' && /^\d{6}$/.test(code) ? code : '';
    const hash = crypto.scryptSync(supplied, Buffer.from(row.salt), 32);
    if (!crypto.timingSafeEqual(hash, Buffer.from(row.code_hash))) {
      run('UPDATE email_codes SET attempts=attempts+1 WHERE purpose=? AND user_id=? AND email=?', purpose, ctx.user.id, email);
      return row.attempts + 1 >= 5 ? [429, 'CODE_LOCKED', '验证码已锁定，请重新获取。'] : [400, 'CODE_INVALID_OR_EXPIRED', '验证码无效、已使用或已过期。'];
    }
    run('UPDATE email_codes SET consumed_at=? WHERE purpose=? AND user_id=? AND email=?', now(), purpose, ctx.user.id, email);
    return null;
  }
  function markVerified(ctx) {
    run('UPDATE sessions SET verified_at=? WHERE token_hash=?', now(), ctx.session.token_hash);
    ctx.session.verified_at = now();
  }

  // ---- 二次验证：邮箱验证码或密码，任选其一 ----
  async function requestReauth(ctx) {
    requireUser(ctx);
    return issueCode(ctx, 'reauth', ctx.user.email, 'PosterPosta 身份验证码', '你正在进行 PosterPosta 账号安全操作。');
  }
  function verifyReauth(ctx, body) {
    requireUser(ctx);
    if (body.password !== undefined) {
      if (!ctx.user.password_hash) fail(409, 'NO_PASSWORD', '这个账号还没有设置密码，请用邮箱验证码验证。');
      const keys = failureKeys(ctx, ctx.user.email);
      assertNotLocked(keys);
      if (!checkPassword(body.password, ctx.user.password_hash)) {
        recordFailure(keys);
        assertNotLocked(keys);
        fail(400, 'INVALID_CREDENTIALS', '密码不正确。');
      }
      run('DELETE FROM auth_failures WHERE key=?', keys[0]);
    } else {
      const error = transaction(() => consumeCode(ctx, 'reauth', ctx.user.email, body.code));
      if (error) fail(...error);
    }
    markVerified(ctx);
    return accountJSON(ctx.user);
  }

  // ---- 资料 ----
  function updateProfile(ctx, body) {
    requireUser(ctx);
    const name = nameText(body.name);
    run('UPDATE users SET name=? WHERE id=?', name, ctx.user.id);
    return accountJSON(reloadUser(ctx));
  }

  // ---- 邮箱绑定 ----
  function assertBindable(ctx, email) {
    const owner = get('SELECT user_id FROM user_emails WHERE email=?', email);
    if (owner?.user_id === ctx.user.id) fail(409, 'EMAIL_ALREADY_BOUND', '这个邮箱已经绑定在当前账号。');
    if (owner) fail(409, 'EMAIL_TAKEN', '这个邮箱已属于另一个账号。请先在那个账号里解绑，或直接用它登录。');
    if (emailCount(ctx.user.id) >= MAX_EMAILS) fail(409, 'EMAIL_LIMIT', `每个账号最多绑定 ${MAX_EMAILS} 个邮箱，请先解绑一个。`);
  }
  async function requestBind(ctx, body) {
    requireFresh(ctx);
    const email = emailText(body.email);
    assertBindable(ctx, email);
    return issueCode(ctx, 'bind', email, 'PosterPosta 绑定邮箱验证码', '你正在把这个邮箱绑定到一个 PosterPosta 账号。');
  }
  function verifyBind(ctx, body) {
    requireFresh(ctx);
    const email = emailText(body.email);
    const error = transaction(() => {
      const failed = consumeCode(ctx, 'bind', email, body.code);
      if (failed) return failed;
      // 发码到验证之间可能被别人抢先绑定，或本账号已满，在同一事务里再核一次。
      assertBindable(ctx, email);
      run('INSERT INTO user_emails(email,user_id,verified_at,created_at) VALUES(?,?,?,?)', email, ctx.user.id, iso(), iso());
      return null;
    });
    if (error) fail(...error);
    return accountJSON(reloadUser(ctx));
  }
  function setPrimaryEmail(ctx, body) {
    requireFresh(ctx);
    const email = emailText(body.email);
    if (!ownsEmail(ctx.user.id, email)) fail(404, 'EMAIL_NOT_BOUND', '这个邮箱没有绑定在当前账号。');
    run('UPDATE users SET email=? WHERE id=?', email, ctx.user.id);
    return accountJSON(reloadUser(ctx));
  }
  function removeEmail(ctx, body) {
    requireFresh(ctx);
    const email = emailText(body.email);
    transaction(() => {
      if (!ownsEmail(ctx.user.id, email)) fail(404, 'EMAIL_NOT_BOUND', '这个邮箱没有绑定在当前账号。');
      if (email === ctx.user.email) fail(409, 'PRIMARY_EMAIL', '主邮箱不能解绑，请先把另一个邮箱设为主邮箱。');
      run('DELETE FROM user_emails WHERE email=? AND user_id=?', email, ctx.user.id);
      // 解绑后这个邮箱尚未使用的登录验证码一并作废，不能再借它登进本账号。
      run('DELETE FROM otps WHERE email=?', email);
      run('DELETE FROM email_codes WHERE email=? AND user_id=?', email, ctx.user.id);
    });
    return accountJSON(reloadUser(ctx));
  }

  // ---- 密码（可选） ----
  function setPassword(ctx, body) {
    requireUser(ctx);
    const password = passwordText(body.password);
    if (ctx.user.password_hash && body.currentPassword !== undefined) {
      const keys = failureKeys(ctx, ctx.user.email);
      assertNotLocked(keys);
      if (!checkPassword(body.currentPassword, ctx.user.password_hash)) {
        recordFailure(keys);
        assertNotLocked(keys);
        fail(400, 'INVALID_CREDENTIALS', '当前密码不正确。');
      }
    } else requireFresh(ctx);
    const stored = hashPassword(password);
    const revoked = transaction(() => {
      run('UPDATE users SET password_hash=?,password_changed_at=? WHERE id=?', stored, iso(), ctx.user.id);
      // 改密码后其他设备全部下线，当前设备保留并视为刚完成验证。
      return run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', ctx.user.id, ctx.session.token_hash).changes;
    });
    markVerified(ctx);
    return { ...accountJSON(reloadUser(ctx)), revokedSessions: revoked };
  }
  function removePassword(ctx) {
    requireFresh(ctx);
    if (!ctx.user.password_hash) fail(409, 'NO_PASSWORD', '这个账号没有设置密码。');
    run('UPDATE users SET password_hash=NULL,password_changed_at=? WHERE id=?', iso(), ctx.user.id);
    return accountJSON(reloadUser(ctx));
  }

  // ---- 登录设备 ----
  const sessionId = hash => Buffer.from(hash).toString('hex').slice(0, 16);
  function listSessions(ctx) {
    requireUser(ctx);
    const current = sessionId(ctx.session.token_hash);
    return all('SELECT * FROM sessions WHERE user_id=? AND expires_at>? ORDER BY COALESCE(last_seen_at,created_at) DESC', ctx.user.id, now())
      .map(row => ({
        id: sessionId(row.token_hash), current: sessionId(row.token_hash) === current, device: deviceLabel(row.user_agent),
        createdAt: new Date(row.created_at).toISOString(), lastSeenAt: new Date(row.last_seen_at ?? row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString()
      }));
  }
  function revokeSessions(ctx, body) {
    requireFresh(ctx);
    if (body.others === true) {
      const revoked = run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', ctx.user.id, ctx.session.token_hash).changes;
      return { revoked, sessions: listSessions(ctx) };
    }
    if (typeof body.id !== 'string' || !/^[0-9a-f]{16}$/.test(body.id)) fail(400, 'INVALID_INPUT', '设备标识无效。');
    if (body.id === sessionId(ctx.session.token_hash)) fail(400, 'CURRENT_SESSION', '当前设备请直接使用「退出账号」。');
    const row = all('SELECT token_hash FROM sessions WHERE user_id=?', ctx.user.id).find(r => sessionId(r.token_hash) === body.id);
    if (!row) fail(404, 'SESSION_NOT_FOUND', '没有找到这个登录设备，它可能已经退出。');
    run('DELETE FROM sessions WHERE token_hash=?', row.token_hash);
    return { revoked: 1, sessions: listSessions(ctx) };
  }
  function recordTransaction(userId, type, productId, assetId, marketId, amount, sandbox, description) {
    run('INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?)', id('transaction'), userId, type, productId, assetId, marketId, amount, Number(sandbox), description, iso());
  }
  function acquire(ctx, productId, marketId, sandboxPurchase) {
    requireUser(ctx);
    const p = product(productId);
    return transaction(() => {
      const offer = marketId === undefined || marketId === null ? null : listing(marketId);
      if (offer && (!offer.active || offer.product_id !== p.id)) fail(409, 'LISTING_UNAVAILABLE', '卖品已成交、已下架或作品不匹配。');
      if (offer?.seller_id === ctx.user.id) fail(403, 'OWN_LISTING', '不能购买自己的卖品。');
      if (!offer && !p.base) fail(403, 'MARKET_ONLY', '原创作品只能通过已审核的市场记录购买。');
      const price = offer ? offer.price_cents : Math.round(p.price * 100);
      if (price > 0 && !dev) fail(503, 'PAYMENT_NOT_CONFIGURED', '未接入真实支付，不能购买或发放付费资产。');
      if (price > 0 && !sandboxPurchase) fail(409, 'SANDBOX_CONFIRMATION_REQUIRED', '开发付费购买请显式调用 sandboxPurchase，不会真实扣款。');
      if (!offer) {
        requireLocation(ctx);
        if (p.city !== ctx.location) fail(403, 'CITY_MISMATCH', '当地商店仅支持服务器确认的当前城市；跨城请使用市场。');
      }
      let item;
      if (price === 0) {
        if (p.type !== 'card' || offer) fail(400, 'INVALID_FREE_PRODUCT', '免费领取仅限当地免费明信片。');
        const changed = run('UPDATE users SET claimed_free=1 WHERE id=? AND claimed_free=0', ctx.user.id);
        if (changed.changes !== 1) fail(409, 'FREE_ALREADY_CLAIMED', '全球免费明信片只可领取一次。');
        item = insertAsset(ctx.user.id, p.id, 'free', false);
        const gift = product(`${p.city}-stamp`);
        insertAsset(ctx.user.id, gift.id, 'gift', false);
      } else if (offer) {
        const changed = run('UPDATE listings SET active=0,buyer_id=?,sold_at=? WHERE id=? AND active=1', ctx.user.id, iso(), offer.id);
        if (changed.changes !== 1) fail(409, 'LISTING_UNAVAILABLE', '这件卖品已被其他买家购得。');
        const moved = run("UPDATE assets SET owner_id=?,status='unused',source='market' WHERE id=? AND owner_id=? AND status='listed'", ctx.user.id, offer.asset_id, offer.seller_id);
        if (moved.changes !== 1) fail(409, 'ASSET_CONFLICT', '卖品资产状态冲突。');
        item = get('SELECT * FROM assets WHERE id=?', offer.asset_id);
        recordTransaction(offer.seller_id, 'sale', p.id, item.id, offer.id, price, true, '沙盒出售记录，未收款，真实收入为 0');
      } else item = insertAsset(ctx.user.id, p.id, 'shop');
      recordTransaction(ctx.user.id, price === 0 ? 'free' : 'purchase', p.id, item.id, offer?.id || null, -price, dev,
        price === 0 ? '全球免费领取，附赠同城邮票一枚' : '沙盒购买，未产生真实扣款');
      return { ...assetJSON(item), sandbox: dev, charged: false };
    });
  }
  function sendLetter(ctx, input) {
    requireUser(ctx);
    objectInput(input);
    const toName = nameText(input.toName);
    const toEmail = emailText(input.toEmail);
    if (ownsEmail(ctx.user.id, toEmail)) fail(400, 'SELF_RECIPIENT', '不能寄给自己账号绑定的邮箱。');
    const toCity = cityKey(input.toCity);
    const message = text(input.message, '寄语', 1, 500);
    const range = estimate(ctx, toCity);
    return transaction(() => {
      const card = ownedAsset(ctx, input.assetId);
      const stamp = ownedAsset(ctx, input.stampAssetId);
      requireUnused(card);
      requireUnused(stamp);
      if (product(card.product_id).type !== 'card' || product(stamp.product_id).type !== 'stamp') fail(400, 'ASSET_TYPE_MISMATCH', '须选择一张明信片和一枚邮票。');
      const days = crypto.randomInt(range.min, range.max + 1);
      const sentAt = iso();
      const letter = {
        id: id('letter'), productId: card.product_id, stampId: stamp.product_id,
        assetId: card.id, stampAssetId: stamp.id, fromName: ctx.user.name, fromEmail: ctx.user.email,
        toName, toEmail, fromCity: ctx.location, toCity, message, days, sentAt, eta: addBusinessDays(sentAt, days)
      };
      const token = randomToken();
      run("UPDATE assets SET status='sent' WHERE id=? AND status='unused'", card.id);
      run("UPDATE assets SET status='used' WHERE id=? AND status='unused'", stamp.id);
      run(`INSERT INTO letters(id,sender_id,to_email,asset_id,stamp_asset_id,status,data,claim_hash,sandbox)
        VALUES(?,?,?,?,?,'transit',?,?,?)`, letter.id, ctx.user.id, toEmail, card.id, stamp.id, JSON.stringify(letter), sha256(token), Number(dev));
      run("INSERT INTO jobs(id,letter_id,status,due_at) VALUES(?,?,'pending',?)", id('job'), letter.id, Date.parse(letter.eta));
      const result = letterJSON(get('SELECT * FROM letters WHERE id=?', letter.id), ctx.user.id);
      // 沙盒领取凭据只在本次操作结果中返回；bootstrap 和数据库不保存明文 token。
      if (dev) result.sandboxClaimToken = token;
      return result;
    });
  }
  function participantLetter(ctx, letterId) {
    requireUser(ctx);
    const row = get('SELECT * FROM letters WHERE id=? AND (sender_id=? OR receiver_id=?)', identifier(letterId), ctx.user.id, ctx.user.id);
    if (!row) fail(404, 'LETTER_NOT_FOUND', '未找到你有权查看的信件。');
    return row;
  }
  function markDelivered(ctx, letterId) {
    requireDev();
    const letter = participantLetter(ctx, letterId);
    if (letter.sender_id !== ctx.user.id || !letter.sandbox) fail(403, 'FORBIDDEN', '只能测试本人发出的沙盒信件。');
    if (!['transit', 'sandbox_ready'].includes(letter.status)) fail(409, 'LETTER_STATUS_CONFLICT', '信件不能重复模拟投递。');
    return transaction(() => {
      run("UPDATE letters SET status='delivered',delivered_at=?,delivery_note=? WHERE id=?", iso(), '仅开发模拟投递：没有发送邮件，也没有真实送达。', letter.id);
      run("UPDATE jobs SET status='done',finished_at=? WHERE letter_id=?", now(), letter.id);
      return letterJSON(get('SELECT * FROM letters WHERE id=?', letter.id), ctx.user.id);
    });
  }
  function insertMessage(ctx, kind, target, value) {
    const content = text(value, '消息', 1, 500);
    const messageId = id('message');
    const time = iso();
    run('INSERT INTO messages VALUES(?,?,?,?,?,?)', messageId, kind === 'letter' ? target : null, kind === 'thread' ? target : null, ctx.user.id, content, time);
    return { id: messageId, authorId: ctx.user.id, author: ctx.user.name, text: content, time };
  }
  function reply(ctx, letterId, value) {
    const letter = participantLetter(ctx, letterId);
    if (letter.status !== 'received' && !(dev && letter.sandbox && letter.status === 'delivered')) fail(409, 'LETTER_NOT_RECEIVED', '收件人须先通过邮箱验证并签收，才能聊天。');
    return insertMessage(ctx, 'letter', letter.id, value);
  }
  function comment(ctx, threadId, value) {
    requireUser(ctx);
    const thread = get('SELECT * FROM threads WHERE id=? AND (buyer_id=? OR seller_id=?)', identifier(threadId), ctx.user.id, ctx.user.id);
    if (!thread) fail(404, 'THREAD_NOT_FOUND', '未找到你参与的交易会话。');
    return insertMessage(ctx, 'thread', thread.id, value);
  }
  function startThread(ctx, marketId, value) {
    requireUser(ctx);
    const content = text(value, '咨询内容', 1, 500);
    return transaction(() => {
      const offer = listing(marketId);
      if (!offer.active) fail(409, 'LISTING_UNAVAILABLE', '卖品已下架，可以在已有会话中继续交流。');
      if (offer.seller_id === ctx.user.id) fail(403, 'OWN_LISTING', '不能向自己咨询。');
      let thread = get('SELECT * FROM threads WHERE market_id=? AND buyer_id=?', offer.id, ctx.user.id);
      if (!thread) {
        const threadId = id('thread');
        run('INSERT INTO threads VALUES(?,?,?,?,?,?)', threadId, offer.id, offer.product_id, ctx.user.id, offer.seller_id, iso());
        thread = get('SELECT * FROM threads WHERE id=?', threadId);
      }
      insertMessage(ctx, 'thread', thread.id, content);
      return threadJSON(thread, ctx.user.id);
    });
  }
  function makeListing(ctx, assetId, price, description = '') {
    const item = ownedAsset(ctx, assetId);
    requireUnused(item);
    if (!item.resale_allowed || ['free', 'gift'].includes(item.source)) fail(403, 'RESALE_FORBIDDEN', '免费卡和赠送邮票不可转售。');
    const creation = get('SELECT * FROM creations WHERE product_id=?', item.product_id);
    if (creation && creation.status !== 'approved') fail(403, 'CREATION_NOT_APPROVED', '原创须先经过审核。');
    const amount = cents(price);
    const details = text(description, '上架说明', 0, 500);
    const listingId = id('market');
    run('INSERT INTO listings(id,asset_id,product_id,seller_id,price_cents,description,active,source,sandbox,created_at) VALUES(?,?,?,?,?,?,1,?,?,?)',
      listingId, item.id, item.product_id, ctx.user.id, amount, details, item.source, Number(dev), iso());
    run("UPDATE assets SET status='listed' WHERE id=? AND status='unused'", item.id);
    return listingJSON(listing(listingId), ctx.user.id);
  }
  function listAsset(ctx, assetId, price, description) {
    requireUser(ctx);
    return transaction(() => makeListing(ctx, assetId, price, description));
  }
  function unlistAsset(ctx, marketId) {
    requireUser(ctx);
    return transaction(() => {
      const offer = listing(marketId);
      if (offer.seller_id !== ctx.user.id) fail(403, 'FORBIDDEN', '只能下架自己的卖品。');
      if (!offer.active) fail(409, 'LISTING_UNAVAILABLE', '卖品已成交或已下架。');
      const moved = run("UPDATE assets SET status='unused' WHERE id=? AND owner_id=? AND status='listed'", offer.asset_id, ctx.user.id);
      if (moved.changes !== 1) fail(409, 'ASSET_CONFLICT', '资产状态冲突。');
      run('UPDATE listings SET active=0 WHERE id=? AND active=1', offer.id);
      return assetJSON(get('SELECT * FROM assets WHERE id=?', offer.asset_id));
    });
  }
  function createWork(ctx, input) {
    requireUser(ctx);
    objectInput(input);
    if (input.rights !== true) fail(400, 'RIGHTS_REQUIRED', '须确认你拥有图片版权或已获得授权。');
    const title = text(input.title, '作品标题', 2, 30);
    const city = cityKey(input.city);
    if (!['card', 'stamp'].includes(input.type)) fail(400, 'INVALID_TYPE', '作品只能是 card 或 stamp。');
    const price = cents(input.price) / 100;
    const img = imageData(input.img);
    const description = text(input.description ?? '', '作品说明', 0, 500);
    return transaction(() => {
      const work = { id: id('creation'), productId: id('work'), title, city, type: input.type, price, img, description, rights: true, createdAt: iso() };
      const p = { id: work.productId, title, subtitle: description || '把自己的风景寄给远方', city, type: work.type, price, img, creator: ctx.user.name, tag: '原创作品' };
      run('INSERT INTO products VALUES(?,?,0,?)', work.productId, JSON.stringify(p), ctx.user.id);
      run("INSERT INTO creations(id,product_id,user_id,status,data) VALUES(?,?,?,'pending',?)", work.id, work.productId, ctx.user.id, JSON.stringify(work));
      insertAsset(ctx.user.id, work.productId, 'creation');
      return creationJSON(get('SELECT * FROM creations WHERE id=?', work.id));
    });
  }
  function reviewCreation(ctx, creationId) {
    requireDev();
    requireUser(ctx);
    return transaction(() => {
      const row = get('SELECT * FROM creations WHERE id=? AND user_id=?', identifier(creationId), ctx.user.id);
      if (!row) fail(404, 'CREATION_NOT_FOUND', '未找到本人的原创作品。');
      if (row.status !== 'pending') fail(409, 'ALREADY_REVIEWED', '作品已完成审核。');
      const asset = get('SELECT * FROM assets WHERE product_id=? AND owner_id=? AND source=?', row.product_id, ctx.user.id, 'creation');
      if (!asset) fail(409, 'ASSET_CONFLICT', '原创资产已不属于当前账号。');
      run("UPDATE creations SET status='approved',review_note=? WHERE id=?", '仅开发沙盒审核通过；生产管理员审核工作流尚未接入。', row.id);
      const work = JSON.parse(row.data);
      makeListing(ctx, asset.id, work.price, work.description);
      return creationJSON(get('SELECT * FROM creations WHERE id=?', row.id));
    });
  }
  function claimRow(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(404, 'CLAIM_NOT_FOUND', '领取凭据无效。');
    const row = get('SELECT * FROM letters WHERE claim_hash=?', sha256(token));
    if (!row) fail(404, 'CLAIM_NOT_FOUND', '领取凭据无效。');
    return row;
  }
  function canClaim(row) {
    return row.status === 'accepted' || (dev && row.sandbox && ['sandbox_ready', 'delivered'].includes(row.status));
  }
  function getClaim(ctx, token) {
    const row = claimRow(token);
    if (!ctx.user) {
      if (row.claimed_at) fail(409, 'ALREADY_CLAIMED', '信件已被签收。');
      return { fromName: JSON.parse(row.data).fromName, maskedEmail: maskEmail(row.to_email) };
    }
    if (!ownsEmail(ctx.user.id, row.to_email)) fail(403, 'CLAIM_EMAIL_MISMATCH', '请用收信邮箱登录，或先把收信邮箱绑定到当前账号。');
    if (!canClaim(row) && row.status !== 'received') fail(409, 'LETTER_NOT_READY', '信件尚未进入可签收状态。');
    return letterJSON(row, ctx.user.id);
  }
  function claim(ctx, token) {
    requireUser(ctx);
    return transaction(() => {
      const row = claimRow(token);
      if (!ownsEmail(ctx.user.id, row.to_email)) fail(403, 'CLAIM_EMAIL_MISMATCH', '只有绑定了收信邮箱的账号才能签收。');
      if (row.claimed_at) fail(409, 'ALREADY_CLAIMED', '这封信已经签收，不能重复领取资产。');
      if (!canClaim(row)) fail(409, 'LETTER_NOT_READY', '信件尚未进入可签收状态。');
      const moved = run("UPDATE assets SET owner_id=?,status='received' WHERE id=? AND owner_id=? AND status='sent'", ctx.user.id, row.asset_id, row.sender_id);
      if (moved.changes !== 1) fail(409, 'ASSET_CONFLICT', '信件资产状态冲突。');
      const changed = run("UPDATE letters SET receiver_id=?,status='received',claimed_at=? WHERE id=? AND claimed_at IS NULL", ctx.user.id, iso(), row.id);
      if (changed.changes !== 1) fail(409, 'ALREADY_CLAIMED', '信件已经签收。');
      return letterJSON(get('SELECT * FROM letters WHERE id=?', row.id), ctx.user.id);
    });
  }
  const actions = Object.freeze({
    setLocation: [1, 1, (ctx, city) => { requireDev(); cityKey(city); run('UPDATE sessions SET location=? WHERE token_hash=?', city, ctx.session.token_hash); ctx.location = city; return city; }],
    acquire: [1, 2, (ctx, p, m) => acquire(ctx, p, m, false)],
    sandboxPurchase: [1, 2, (ctx, p, m) => { requireDev(); return acquire(ctx, p, m, true); }],
    sendLetter: [1, 1, sendLetter], deliveryEstimate: [1, 1, estimate],
    markDelivered: [1, 1, markDelivered], reply: [2, 2, reply], comment: [2, 2, comment], startThread: [2, 2, startThread],
    listAsset: [2, 3, listAsset], unlistAsset: [1, 1, unlistAsset], createWork: [1, 1, createWork], reviewCreation: [1, 1, reviewCreation],
    reset: [0, 0, () => { requireDev(); fail(403, 'RESET_DISABLED', '禁用破坏性重置，不删除任何用户资产。'); }]
  });
  function action(ctx, body) {
    if (typeof body.name !== 'string' || !Object.hasOwn(actions, body.name)) fail(404, 'ACTION_NOT_FOUND', '不支持此操作。');
    const [min, max, fn] = actions[body.name];
    if (!Array.isArray(body.args) || body.args.length < min || body.args.length > max) fail(400, 'INVALID_ARGUMENTS', '操作参数数量或格式错误。');
    return fn(ctx, ...body.args);
  }
  async function worker() {
    // 中断于网络请求期间的任务不能假定失败后重复发送；保留给人工核对。
    run("UPDATE jobs SET status='uncertain',error_code='INTERRUPTED_SEND' WHERE status='processing' AND started_at<?", now() - 5 * 60 * 1000);
    const processed = [];
    for (let count = 0; count < 25 && !closing; count++) {
      const job = transaction(() => {
        const row = get("SELECT j.* FROM jobs j JOIN letters l ON l.id=j.letter_id WHERE j.status='pending' AND j.due_at<=? AND l.status='transit' ORDER BY j.due_at LIMIT 1", now());
        if (!row) return null;
        // 沙盒数据库不能在切换到生产模式后突然发出历史测试邮件。
        const letter = get('SELECT * FROM letters WHERE id=?', row.letter_id);
        if (dev || letter.sandbox) {
          run("UPDATE letters SET status='sandbox_ready',delivery_note=? WHERE id=?", '本地任务已到期：没有发送邮件，不代表已送达。', row.letter_id);
          run("UPDATE jobs SET status='sandbox_ready',finished_at=? WHERE id=?", now(), row.id);
          return { ...row, local: true };
        }
        const changed = run("UPDATE jobs SET status='processing',started_at=?,attempts=attempts+1 WHERE id=? AND status='pending'", now(), row.id);
        return changed.changes === 1 ? row : null;
      });
      if (!job) break;
      if (job.local) { processed.push({ letterId: job.letter_id, status: 'sandbox_ready' }); continue; }
      // 真正发邮件前才产生要分发的凭据；明文仅在本次调用内存中存在。
      const token = randomToken();
      run('UPDATE letters SET claim_hash=? WHERE id=? AND claimed_at IS NULL', sha256(token), job.letter_id);
      const letter = get('SELECT * FROM letters WHERE id=?', job.letter_id);
      const data = JSON.parse(letter.data);
      try {
        const result = await deliverMail({
          to: letter.to_email, subject: '你收到了一封 PosterPosta 来信',
          text: `${data.fromName} 给你寄来一张明信片。请使用本收件邮箱验证后打开：\n${publicOrigin}/?claim=${token}\n验证并签收后才会开放信件和对话。`,
          idempotencyKey: `letter-${job.id}`
        });
        transaction(() => {
          run("UPDATE letters SET status='accepted',accepted_at=?,delivery_note=? WHERE id=? AND status='transit'", iso(), 'Resend 已接受发送，不代表真实送达；须收件人验证并签收。', job.letter_id);
          run("UPDATE jobs SET status='accepted',provider_id=?,finished_at=? WHERE id=? AND status='processing'", result.id, now(), job.id);
        });
        processed.push({ letterId: job.letter_id, status: 'accepted' });
      } catch {
        run("UPDATE jobs SET status='uncertain',error_code='MAIL_RESULT_UNKNOWN',finished_at=? WHERE id=?", now(), job.id);
        processed.push({ letterId: job.letter_id, status: 'uncertain' });
      }
    }
    return processed;
  }
  function runWorker() {
    if (closing) return Promise.resolve([]);
    if (workerPromise) return workerPromise;
    workerPromise = worker().finally(() => { workerPromise = null; });
    return workerPromise;
  }
  function secureHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(),camera=(),microphone=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    if (!dev) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  function json(res, status, value) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
  }
  function hostMatches(requestHost) {
    const host = String(requestHost || '').toLowerCase();
    return hostPatterns.some(pattern => pattern.startsWith('*.')
      ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
      : host === pattern);
  }
  // 绑回环时 Host 是唯一的准入屏障，必须严格；服务一旦显式对外监听，它本身就已经是
  // 公开服务，此时若没有配置对外域名，就不再拿 Host 卡自己（跨站请求仍由 Origin 与
  // Fetch Metadata 拦下）。生产环境始终严格。
  const loopbackBound = bindHost === '127.0.0.1' || bindHost === '::1' || bindHost === 'localhost';
  const enforceHosts = hostPatterns.length > 0 || !dev || loopbackBound;
  function checkOrigin(req) {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    const localOrigins = [`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`];
    const allowed = new Set(dev ? localOrigins : []);
    if (publicOrigin) allowed.add(publicOrigin);
    const hosts = new Set(localOrigins.map(v => new URL(v).host));
    if (publicOrigin) hosts.add(new URL(publicOrigin).host);
    const requestHost = String(req.headers.host || '').toLowerCase();
    // 命中 ALLOWED_HOSTS 的域名同样被接受，并把这个域名自己的 origin 纳入 CSRF 白名单。
    if (!hosts.has(requestHost) && hostMatches(requestHost)) {
      hosts.add(requestHost);
      allowed.add(`https://${requestHost}`);
      allowed.add(`http://${requestHost}`);
    }
    if (enforceHosts && !hosts.has(requestHost)) fail(403, 'HOST_FORBIDDEN', '不接受此 Host。');
    const origin = req.headers.origin;
    // 邮件链接可以导航到首页；这不是跨源 API 调用，也不会执行签收或其他业务变更。
    const landingNavigation = req.method === 'GET' && req.url.split('?')[0] === '/' && origin === undefined &&
      req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
    if (req.headers['sec-fetch-site'] === 'cross-site' && !landingNavigation) fail(403, 'CSRF_ORIGIN', '不接受跨站请求。');
    if (origin !== undefined && (typeof origin !== 'string' || !allowed.has(origin))) fail(403, 'CSRF_ORIGIN', '请求 Origin 不匹配。');
    if (req.method === 'POST' && !dev && !origin) fail(403, 'CSRF_ORIGIN', '生产状态变更请求必须包含匹配的 Origin。');
    if (req.headers.referer && !landingNavigation) {
      let ref;
      try { ref = new URL(req.headers.referer).origin; } catch { fail(403, 'CSRF_ORIGIN', 'Referer 无效。'); }
      if (!allowed.has(ref)) fail(403, 'CSRF_ORIGIN', '不接受跨站 Referer。');
    }
  }
  async function readBody(req) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'CONTENT_TYPE_REQUIRED', '请使用 application/json。');
    const declared = req.headers['content-length'];
    if (declared && Number(declared) > MAX_BODY) fail(413, 'BODY_TOO_LARGE', '请求内容不能超过 3 MB。');
    let size = 0;
    const chunks = [];
    // 不使用 async iterator 的提前退出，以便超限时仍能返回 JSON 413。
    const buffer = await new Promise((resolve, reject) => {
      let rejected = false;
      req.on('data', chunk => {
        if (rejected) return;
        size += chunk.length;
        if (size > MAX_BODY) {
          rejected = true;
          chunks.length = 0;
          reject(new ApiError(413, 'BODY_TOO_LARGE', '请求内容不能超过 3 MB。'));
        } else chunks.push(chunk);
      });
      req.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
      req.on('error', () => reject(new ApiError(400, 'INVALID_BODY', '请求体读取失败。')));
      req.on('aborted', () => reject(new ApiError(400, 'INVALID_BODY', '请求已中断。')));
    });
    let body;
    try { body = JSON.parse(buffer.toString('utf8')); } catch { fail(400, 'INVALID_JSON', '请求不是有效 JSON。'); }
    return objectInput(body);
  }
  const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2'
  };
  const publicRoot = fs.realpathSync(PUBLIC_DIR);
  function serveStatic(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'METHOD_NOT_ALLOWED', '静态资源只支持 GET 或 HEAD。');
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes('%') || pathname.split('/').some(p => p.startsWith('.'))) fail(404, 'NOT_FOUND', '文件不存在。');
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!Object.hasOwn(mime, path.extname(relative).toLowerCase())) fail(404, 'NOT_FOUND', '文件不存在。');
    let filename;
    let stat;
    try {
      filename = fs.realpathSync(path.resolve(publicRoot, relative));
      if (!filename.startsWith(publicRoot + path.sep) ||
          !Object.hasOwn(mime, path.extname(filename).toLowerCase()) ||
          path.relative(publicRoot, filename).split(path.sep).some(p => p.startsWith('.'))) fail(404, 'NOT_FOUND', '文件不存在。');
      stat = fs.statSync(filename);
    } catch { fail(404, 'NOT_FOUND', '文件不存在。'); }
    if (!stat.isFile()) fail(404, 'NOT_FOUND', '文件不存在。');
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    secureHeaders(res);
    try {
      if (closing) fail(503, 'SHUTTING_DOWN', '服务正在关闭。');
      // 健康检查必须放在 Host / Origin 校验之前：托管平台（Railway、本项目云端沙箱等）
      // 的探针常常带内部主机名而不是公开域名，走校验会被误判为不健康并导致部署失败。
      // 这里只回一个固定的 ok，不泄露任何配置内容。
      if (req.url === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(req.method === 'HEAD' ? undefined : '{"ok":true}');
      }
      checkOrigin(req);
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) fail(405, 'METHOD_NOT_ALLOWED', '不支持此请求方法。');
      if (!req.url.startsWith('/') || req.url.startsWith('//')) fail(400, 'INVALID_PATH', '路径无效。');
      let pathname;
      try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { fail(400, 'INVALID_PATH', '路径编码无效。'); }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p === '..' || p === '.')) fail(404, 'NOT_FOUND', '文件不存在。');
      if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
      if (req.method === 'HEAD') fail(405, 'METHOD_NOT_ALLOWED', 'API 不支持 HEAD。');
      const url = new URL(req.url, 'http://127.0.0.1');
      const ctx = await context(req, res);
      const body = req.method === 'POST' ? await readBody(req) : null;
      let result;
      if (req.method === 'GET' && pathname === '/api/bootstrap') result = null;
      else if (req.method === 'GET' && pathname === '/api/config') result = config();
      else if (req.method === 'GET' && pathname === '/api/claim') result = getClaim(ctx, url.searchParams.get('token'));
      else if (req.method === 'GET' && pathname === '/api/deliveryEstimate') result = estimate(ctx, url.searchParams.get('city'));
      else if (req.method === 'POST' && pathname === '/api/auth/request') result = await requestOTP(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/auth/verify') result = verifyOTP(ctx, res, body);
      else if (req.method === 'POST' && pathname === '/api/auth/logout') result = logout(ctx, res);
      else if (req.method === 'POST' && pathname === '/api/auth/password') result = passwordLogin(ctx, res, body);
      else if (req.method === 'POST' && pathname === '/api/auth/reauth/request') result = await requestReauth(ctx);
      else if (req.method === 'POST' && pathname === '/api/auth/reauth/verify') result = verifyReauth(ctx, body);
      else if (req.method === 'GET' && pathname === '/api/account/sessions') result = listSessions(ctx);
      else if (req.method === 'POST' && pathname === '/api/account/sessions/revoke') result = revokeSessions(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/account/profile') result = updateProfile(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/account/password') result = setPassword(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/account/password/remove') result = removePassword(ctx);
      else if (req.method === 'POST' && pathname === '/api/account/emails/request') result = await requestBind(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/account/emails/verify') result = verifyBind(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/account/emails/primary') result = setPrimaryEmail(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/account/emails/remove') result = removeEmail(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/action') result = action(ctx, body);
      else if (req.method === 'POST' && pathname === '/api/claim') result = claim(ctx, body.token);
      else if (req.method === 'POST' && pathname === '/api/markDelivered') result = markDelivered(ctx, body.letterId);
      else fail(404, 'NOT_FOUND', '接口不存在。');
      json(res, 200, { ok: true, result, bootstrap: bootstrap(ctx) });
    } catch (error) {
      if (error instanceof ApiError) json(res, error.status, { ok: false, error: error.message, code: error.code });
      else if (error.code === 'ERR_SQLITE_ERROR' && /locked|busy/i.test(error.message)) json(res, 409, { ok: false, error: '数据正在更新，请重试。', code: 'DB_BUSY' });
      else json(res, 500, { ok: false, error: '服务器内部错误。', code: 'INTERNAL_ERROR' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  // 监听地址由环境变量决定：默认只绑本机回环，只有显式 HOST=0.0.0.0 才对外监听。
  const nativeListen = server.listen.bind(server);
  server.listen = (...args) => {
    const requestedPort = args.length === 0 || typeof args[0] === 'function' ? port : typeof args[0] === 'object' ? args[0]?.port ?? port : args[0];
    if (typeof requestedPort !== 'number' || !Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('仅支持 TCP 端口监听');
    const callback = args.find(v => typeof v === 'function');
    return nativeListen({ host: bindHost, port: requestedPort }, callback);
  };
  const timer = setInterval(() => { runWorker().catch(() => {}); }, 1000);
  timer.unref();
  function close() {
    if (closePromise) return closePromise;
    closing = true;
    clearInterval(timer);
    closePromise = (async () => {
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      if (workerPromise) await workerPromise;
      await Promise.allSettled([...mailTasks]);
      db.close();
    })();
    return closePromise;
  }
  return { server, db, close, runWorker, config: config(), port };
}

module.exports = { createApp, addBusinessDays, haversine, emailText, imageData, clientIP, cityFromTencent, loadCatalog, deployEnvDefaults };
if (require.main === module) {
  let app;
  try {
    app = createApp();
    app.server.on('error', () => { console.error('服务器启动失败，请检查端口配置。'); app.close().finally(() => { process.exitCode = 1; }); });
    app.server.listen(() => console.log(`PosterPosta API 监听 ${app.config.bindHost}:${app.server.address().port}（${app.config.appEnv}）`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().catch(() => { process.exitCode = 1; }); });
  } catch (error) {
    console.error(error instanceof Error ? error.message : '服务器启动失败');
    process.exitCode = 1;
  }
}
