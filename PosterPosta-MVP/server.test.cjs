'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp, addBusinessDays, haversine, emailText, imageData, clientIP, cityFromTencent, loadCatalog, deployEnvDefaults } = require('./server.cjs');

const PROD = {
  APP_ENV: 'production', PUBLIC_ORIGIN: 'https://posterposta.example.test',
  RESEND_API_KEY: 'test-only-not-a-real-key', MAIL_FROM: '测试发件人 <mail@example.test>',
  TENCENT_LOCATION_KEY: 'test-only-not-a-location-key', TRUST_PROXY: 'loopback'
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const originalFetch = globalThis.fetch;
before(() => { globalThis.fetch = async () => { throw new Error('测试禁止真实外网请求'); }; });
after(() => { globalThis.fetch = originalFetch; });
const digest = value => crypto.createHash('sha256').update(value).digest();

function request(port, pathname, { method = 'GET', headers = {}, body, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    const sentHeaders = { ...headers };
    if (payload !== undefined && !Object.keys(headers).some(k => k.toLowerCase() === 'content-length')) sentHeaders['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers: sentHeaders }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let data;
        try { data = JSON.parse(raw); } catch { data = null; }
        resolve({ status: res.statusCode, headers: res.headers, data, raw });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
function ok(response) {
  assert.equal(response.status, 200, response.raw);
  assert.equal(response.data.ok, true);
  assert.deepEqual(Object.keys(response.data).sort(), ['bootstrap', 'ok', 'result']);
  assert.deepEqual(Object.keys(response.data.bootstrap).sort(), ['cities', 'config', 'products', 'state']);
  return response.data.result;
}
function error(response, status, code) {
  assert.equal(response.status, status, response.raw);
  assert.deepEqual(Object.keys(response.data).sort(), ['code', 'error', 'ok']);
  assert.equal(response.data.ok, false);
  assert.equal(response.data.code, code, response.raw);
  assert.equal(typeof response.data.error, 'string');
}
function browser(fixture, initialCookie = '', defaults = {}) {
  let cookie = initialCookie;
  const baseHeaders = fixture.env.APP_ENV === 'production' ? { Origin: fixture.env.PUBLIC_ORIGIN, 'X-Forwarded-For': '8.8.8.8' } : {};
  return {
    get cookie() { return cookie; },
    async call(pathname, body, options = {}) {
      const headers = { ...baseHeaders, ...defaults, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
      if (cookie) headers.Cookie = cookie;
      for (const key of Object.keys(headers)) if (headers[key] === null) delete headers[key];
      const response = await request(fixture.port, pathname, { method: body === undefined ? 'GET' : 'POST', body, ...options, headers });
      if (response.headers['set-cookie']) cookie = response.headers['set-cookie'][0].split(';')[0];
      return response;
    },
    async action(name, ...args) { return this.call('/api/action', { name, args }); },
    async state() { const response = await this.call('/api/bootstrap'); ok(response); return response.data.bootstrap.state; },
    async login(email, name = '测试用户') {
      const response = await this.call('/api/auth/request', { email });
      const result = ok(response);
      const code = result.devCode || fixture.mails.filter(mail => mail.to === email.trim().toLowerCase()).at(-1)?.text.match(/验证码是 (\d{6})/)?.[1];
      assert.match(code, /^\d{6}$/);
      const verified = await this.call('/api/auth/verify', { email, name, code });
      return ok(verified);
    }
  };
}
async function fixture(t, overrides = {}) {
  let instant = Date.parse('2026-09-14T08:00:00Z');
  const mails = [];
  const locations = [];
  const env = overrides.env || { APP_ENV: 'development' };
  const app = createApp({
    dbPath: ':memory:', env, now: () => instant, rateLimitMs: 0,
    mailTransport: async payload => { mails.push(payload); return { id: `fake-mail-${mails.length}` }; },
    locationTransport: async payload => { locations.push(payload); return { status: 0, result: { ad_info: { city: '深圳市' } } }; },
    ...overrides
  });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, resolve); });
  t.after(() => app.close());
  const f = {
    ...app, env, mails, locations, port: app.server.address().port,
    advance(ms) { instant += ms; }, setTime(value) { instant = new Date(value).getTime(); }
  };
  f.browser = (cookie, defaults) => browser(f, cookie, defaults);
  return f;
}
function work(overrides = {}) {
  return { title: '一页风景', city: 'tokyo', type: 'card', price: 12.34, img: PNG, description: '原创测试', rights: true, ...overrides };
}
async function freePair(actor, productId = 'tokyo-free') {
  const response = await actor.action('acquire', productId);
  ok(response);
  const state = response.data.bootstrap.state;
  return { card: state.assets.find(a => a.source === 'free'), stamp: state.assets.find(a => a.source === 'gift') };
}
function letterInput(pair, overrides = {}) {
  return {
    assetId: pair.card.id, stampAssetId: pair.stamp.id, toName: '收件测试', toEmail: 'recipient@example.test',
    toCity: 'shenzhen', message: '寄来一片晴天', ...overrides
  };
}
async function listedCard(actor, price = 23.45) {
  const asset = ok(await actor.action('sandboxPurchase', 'tokyo-tower'));
  const listing = ok(await actor.action('listAsset', asset.id, price, '真实资产，沙盒交易'));
  return { asset, listing };
}
async function bindEmail(actor, email) {
  const sent = ok(await actor.call('/api/account/emails/request', { email }));
  return ok(await actor.call('/api/account/emails/verify', { email, code: sent.devCode }));
}
async function reauth(actor) {
  const sent = ok(await actor.call('/api/auth/reauth/request', {}));
  return ok(await actor.call('/api/auth/reauth/verify', { code: sent.devCode }));
}
const FIFTEEN_MINUTES = 15 * 60 * 1000;
function temporaryDB(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'posterposta-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'app.sqlite');
}

test('匿名 bootstrap 无样例资产、虚假市场或个人资料；仅复用 engine catalog', async t => {
  const f = await fixture(t);
  const response = await f.browser().call('/api/bootstrap');
  ok(response);
  const { state, cities, products } = response.data.bootstrap;
  assert.equal(state.user, null);
  assert.equal(state.account, null);
  assert.equal(state.location, 'tokyo');
  assert.equal(state.claimedFree, false);
  assert.equal(state.income, 0);
  assert.equal(state.revenue, 0);
  for (const key of ['assets', 'letters', 'creations', 'transactions', 'market', 'community']) assert.deepEqual(state[key], []);
  assert.deepEqual(cities, loadCatalog().cities);
  assert.deepEqual(products, loadCatalog().catalog);
  assert.equal(products.length, 25);
  assert.equal(response.raw.includes('linjian@example.test'), false);
});

test('不同浏览器账号隔离、邮箱归一化、会话旋转且数据库只存 session 哈希', async t => {
  const f = await fixture(t);
  const alice = f.browser();
  ok(await alice.call('/api/bootstrap'));
  const oldCookie = alice.cookie;
  const user = await alice.login(' ALICE@Example.test ', '甲');
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name']);
  assert.equal(user.email, 'alice@example.test');
  assert.notEqual(alice.cookie, oldCookie);
  const token = alice.cookie.split('=')[1];
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  const session = f.db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(digest(token));
  assert.equal(session.user_id, user.id);
  assert.equal(f.db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(digest(oldCookie.split('=')[1])), undefined);
  const pair = await freePair(alice);
  assert.ok(pair.card);
  const bob = f.browser();
  await bob.login('bob@example.test', '乙');
  assert.deepEqual((await bob.state()).assets, []);
  assert.equal((await bob.state()).claimedFree, false);
  const anonymous = await f.browser().call('/api/bootstrap');
  assert.equal(anonymous.raw.includes('alice@example.test'), false);
  assert.equal(anonymous.raw.includes('bob@example.test'), false);
  const aliceAgain = f.browser();
  assert.equal((await aliceAgain.login('alice@example.test', '不覆盖既有昵称')).id, user.id);
  assert.equal((await aliceAgain.state()).user.name, '甲');
  assert.equal((await aliceAgain.state()).assets.length, 2);
  const old = alice.cookie;
  const logout = await alice.call('/api/auth/logout', {});
  ok(logout);
  assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
  assert.equal(logout.data.bootstrap.state.user, null);
  assert.equal((await f.browser(old).state()).user, null);
  assert.equal((await aliceAgain.state()).user.id, user.id);
});

test('会话 30 天到期，不删除账号和资产', async t => {
  const f = await fixture(t);
  const alice = f.browser();
  await alice.login('alice@example.test');
  await freePair(alice);
  f.advance(30 * 24 * 60 * 60 * 1000 + 1);
  assert.equal((await alice.state()).user, null);
  await alice.login('alice@example.test');
  assert.equal((await alice.state()).assets.length, 2);
});

test('邮箱严格校验拒绝控制字符、畸形本地段与域名', async t => {
  const f = await fixture(t);
  const actor = f.browser();
  for (const email of ['a@b', '.a@example.test', 'a..b@example.test', 'a.@example.test', 'a@-example.test', 'a@example-.test', 'a\nX-Test: x@example.test', 'a@@example.test', 'a'.repeat(65) + '@example.test', '中文@example.test', null]) {
    error(await actor.call('/api/auth/request', { email }), 400, 'INVALID_EMAIL');
  }
  assert.equal(emailText(' USER+tag@Example.test '), 'user+tag@example.test');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM otps').get().n, 0);
});

test('OTP 六位随机、哈希存储、一次性消费且开发完全不发送邮件', async t => {
  const f = await fixture(t);
  const actor = f.browser();
  const response = await actor.call('/api/auth/request', { email: 'otp@example.test' });
  const result = ok(response);
  assert.match(result.devCode, /^\d{6}$/);
  assert.equal(result.emailSent, false);
  assert.match(result.note, /未发送/);
  const row = f.db.prepare('SELECT * FROM otps WHERE email=?').get('otp@example.test');
  assert.equal(row.code_hash.length, 32);
  assert.equal(row.salt.length, 16);
  assert.notEqual(Buffer.from(row.code_hash).toString(), result.devCode);
  assert.equal('code' in row, false);
  ok(await actor.call('/api/auth/verify', { email: 'otp@example.test', name: '验证码', code: result.devCode }));
  error(await f.browser().call('/api/auth/verify', { email: 'otp@example.test', name: '重复', code: result.devCode }), 400, 'OTP_INVALID_OR_EXPIRED');
  assert.equal(f.mails.length, 0);
});

test('OTP 十分钟精确过期，五次失败锁定，包括畸形 code', async t => {
  const f = await fixture(t);
  const actor = f.browser();
  let code = ok(await actor.call('/api/auth/request', { email: 'otp@example.test' })).devCode;
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) error(await actor.call('/api/auth/verify', { email: 'otp@example.test', name: '甲', code: i === 0 ? {} : wrong }), 400, 'OTP_INVALID_OR_EXPIRED');
  error(await actor.call('/api/auth/verify', { email: 'otp@example.test', name: '甲', code: wrong }), 429, 'OTP_LOCKED');
  error(await actor.call('/api/auth/verify', { email: 'otp@example.test', name: '甲', code }), 429, 'OTP_LOCKED');
  assert.equal(f.db.prepare('SELECT attempts FROM otps').get().attempts, 5);
  code = ok(await actor.call('/api/auth/request', { email: 'otp@example.test' })).devCode;
  f.advance(10 * 60 * 1000);
  error(await actor.call('/api/auth/verify', { email: 'otp@example.test', name: '甲', code }), 400, 'OTP_INVALID_OR_EXPIRED');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('重新请求使旧 OTP 失效，并发验证只能成功一次', async t => {
  const f = await fixture(t);
  const a = f.browser();
  const old = ok(await a.call('/api/auth/request', { email: 'otp@example.test' })).devCode;
  let current = ok(await a.call('/api/auth/request', { email: 'otp@example.test' })).devCode;
  if (old === current) current = ok(await a.call('/api/auth/request', { email: 'otp@example.test' })).devCode;
  if (old !== current) error(await a.call('/api/auth/verify', { email: 'otp@example.test', name: '甲', code: old }), 400, 'OTP_INVALID_OR_EXPIRED');
  const body = { email: 'otp@example.test', name: '甲', code: current };
  const results = await Promise.all([a.call('/api/auth/verify', body), f.browser().call('/api/auth/verify', body)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
});

test('邮箱和 IP 双重 60 秒速率限制，跨浏览器不能绕过', async t => {
  const f = await fixture(t, { env: PROD, rateLimitMs: 60000 });
  const a = f.browser('', { 'X-Forwarded-For': '8.8.8.8' });
  const b = f.browser('', { 'X-Forwarded-For': '1.1.1.1' });
  ok(await a.call('/api/auth/request', { email: 'same@example.test' }));
  error(await b.call('/api/auth/request', { email: 'SAME@example.test' }), 429, 'RATE_LIMITED');
  error(await a.call('/api/auth/request', { email: 'other@example.test' }), 429, 'RATE_LIMITED');
  f.advance(59999);
  error(await a.call('/api/auth/request', { email: 'same@example.test' }), 429, 'RATE_LIMITED');
  f.advance(1);
  ok(await a.call('/api/auth/request', { email: 'same@example.test' }));
  assert.equal(f.mails.length, 2);
});

test('开发 GET/POST 跨 Origin、null Origin 和跨站 Fetch Metadata 均拒绝', async t => {
  const f = await fixture(t);
  const a = f.browser();
  error(await a.call('/api/bootstrap', undefined, { headers: { Origin: 'https://evil.example.test' } }), 403, 'CSRF_ORIGIN');
  error(await a.call('/api/auth/request', { email: 'a@example.test' }, { headers: { Origin: 'null' } }), 403, 'CSRF_ORIGIN');
  error(await a.call('/api/bootstrap', undefined, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403, 'CSRF_ORIGIN');
  error(await a.call('/api/bootstrap', undefined, { headers: { Referer: 'https://evil.example.test/' } }), 403, 'CSRF_ORIGIN');
  error(await a.call('/api/bootstrap', undefined, { headers: { Host: 'evil.example.test' } }), 403, 'HOST_FORBIDDEN');
  ok(await a.call('/api/bootstrap', undefined, { headers: { Origin: `http://localhost:${f.port}` } }));
  ok(await a.call('/api/auth/request', { email: 'a@example.test' }));
});

test('生产启动依赖强制校验，Origin 必填，Secure cookie，配置不泄漏凭据', async t => {
  for (const env of [
    { APP_ENV: 'production' }, { ...PROD, PUBLIC_ORIGIN: 'http://example.test' },
    { ...PROD, RESEND_API_KEY: '' }, { ...PROD, MAIL_FROM: '' }, { ...PROD, TENCENT_LOCATION_KEY: '' }
  ]) assert.throws(() => createApp({ dbPath: ':memory:', env }), /生产启动需要/);
  assert.throws(() => createApp({ dbPath: ':memory:', env: { APP_ENV: 'test' } }), /APP_ENV/);
  assert.throws(() => createApp({ dbPath: ':memory:', env: { ...PROD, TRUST_PROXY: '*' } }), /TRUST_PROXY/);
  assert.throws(() => createApp({ dbPath: ':memory:', env: { ...PROD, PUBLIC_ORIGIN: 'https://example.test/path' } }), /PUBLIC_ORIGIN/);
  const f = await fixture(t, { env: PROD });
  const a = f.browser();
  error(await a.call('/api/auth/request', { email: 'a@example.test' }, { headers: { Origin: null } }), 403, 'CSRF_ORIGIN');
  error(await a.call('/api/bootstrap', undefined, { headers: { Origin: `http://127.0.0.1:${f.port}` } }), 403, 'CSRF_ORIGIN');
  const response = await a.call('/api/config');
  const config = ok(response);
  assert.equal(config.paymentConfigured, false);
  assert.equal(config.email.configured, true);
  assert.equal(config.location.configured, true);
  assert.equal(config.email.deliveryWebhooksConfigured, false);
  assert.match(response.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  assert.match(response.headers['set-cookie'][0], /; Secure/);
  assert.match(response.headers['set-cookie'][0], /Path=\//);
  assert.equal(response.raw.includes(PROD.RESEND_API_KEY), false);
  assert.equal(response.raw.includes(PROD.TENCENT_LOCATION_KEY), false);
  const auth = ok(await a.call('/api/auth/request', { email: 'a@example.test' }));
  assert.equal(auth.devCode, undefined);
  assert.equal(auth.status, 'accepted');
});

test('默认只监听回环；HOST=0.0.0.0 时仍由 ALLOWED_HOSTS 决定哪些域名可用', async t => {
  const localOnly = createApp({ dbPath: ':memory:', env: { APP_ENV: 'development' } });
  t.after(() => localOnly.close());
  assert.equal(localOnly.port, 4180);
  assert.throws(() => localOnly.server.listen('/tmp/should-not-exist.sock'), /TCP/);
  await new Promise(resolve => localOnly.server.listen({ port: 0, host: '0.0.0.0' }, resolve));
  assert.equal(localOnly.server.address().address, '127.0.0.1');
  assert.equal(localOnly.config.bindHost, '127.0.0.1');
  assert.deepEqual(localOnly.config.allowedHosts, []);

  const exposed = await fixture(t, { env: { APP_ENV: 'development', HOST: '0.0.0.0', ALLOWED_HOSTS: '*.app-tencent.workbuddy.host' } });
  assert.equal(exposed.config.bindHost, '0.0.0.0');
  assert.deepEqual(exposed.config.allowedHosts, ['*.app-tencent.workbuddy.host']);
  error(await request(exposed.port, '/api/bootstrap', { headers: { Host: 'evil.example.test' } }), 403, 'HOST_FORBIDDEN');
  error(await request(exposed.port, '/api/bootstrap', { headers: { Host: 'app-tencent.workbuddy.host.evil.test' } }), 403, 'HOST_FORBIDDEN');
  ok(await request(exposed.port, '/api/bootstrap', { headers: { Host: 'abc.app-tencent.workbuddy.host' } }));
  ok(await request(exposed.port, '/api/bootstrap', { headers: { Host: `127.0.0.1:${exposed.port}` } }));

  // 只绑回环时（默认）Host 是唯一的准入屏障，开发环境也必须严格。
  error(await request(localOnly.server.address().port, '/api/bootstrap', { headers: { Host: 'demo.example.test' } }), 403, 'HOST_FORBIDDEN');
  // 生产环境即使对外监听，也只认 PUBLIC_ORIGIN。
  const locked = await fixture(t, { env: { ...PROD } });
  error(await request(locked.port, '/api/bootstrap', { headers: { Host: 'evil.example.test' } }), 403, 'HOST_FORBIDDEN');

  // 开发环境显式对外监听、又没有配置对外域名时，不再用 Host 卡自己（托管环境常见情形），
  // 但跨站请求仍必须被 Origin 拦下。
  const openDev = await fixture(t, { env: { APP_ENV: 'development', HOST: '0.0.0.0' } });
  const publicHost = '0978b3f98c95477f965d8169479227c9.app-tencent.workbuddy.host';
  ok(await request(openDev.port, '/api/bootstrap', { headers: { Host: publicHost } }));
  error(await request(openDev.port, '/api/auth/request', {
    method: 'POST', body: { email: 'a@example.test' },
    headers: { 'Content-Type': 'application/json', Host: publicHost, Origin: 'https://evil.example.test' }
  }), 403, 'CSRF_ORIGIN');
  const openProd = await fixture(t, { env: { ...PROD, HOST: '0.0.0.0' } });
  error(await request(openProd.port, '/api/bootstrap', { headers: { Host: 'evil.example.test' } }), 403, 'HOST_FORBIDDEN');

  assert.throws(() => createApp({ dbPath: ':memory:', env: { APP_ENV: 'development', HOST: '10.0.0.5' } }), /HOST/);
  assert.throws(() => createApp({ dbPath: ':memory:', env: { APP_ENV: 'development', ALLOWED_HOSTS: 'https://bad.example.test' } }), /ALLOWED_HOSTS/);
});

test('deploy.env.json 只作为默认值，不覆盖显式传入或真实环境变量', async t => {
  const defaults = deployEnvDefaults();
  assert.equal(defaults.APP_ENV, 'development');
  assert.equal(defaults.HOST, '0.0.0.0');
  // 托管环境的反向代理转发的是内部主机名、而不是公开域名，所以两个都要配：
  // ALLOWED_HOSTS 覆盖内部域名（过 Host 校验），PUBLIC_ORIGIN 是公开访问域名（过浏览器 Origin 校验）。
  // 只配 PUBLIC_ORIGIN 会被 HOST_FORBIDDEN 拒绝，只配 ALLOWED_HOSTS 会被 CSRF_ORIGIN 拒绝。
  assert.match(defaults.PUBLIC_ORIGIN, /^https:\/\/[a-z0-9-]+\.app-tencent\.workbuddy\.host$/);
  assert.equal(defaults.ALLOWED_HOSTS, '*.internal.invalid');

  // 显式传入 env 时完全忽略该文件，测试与本地默认行为不被部署参数污染。
  const explicit = createApp({ dbPath: ':memory:', env: { APP_ENV: 'development' } });
  t.after(() => explicit.close());
  assert.equal(explicit.config.bindHost, '127.0.0.1');
  assert.equal(explicit.config.publicOrigin, null);
  assert.deepEqual(explicit.config.allowedHosts, []);
  // 真实环境变量优先于文件里的同名项。
  const overridden = createApp({ dbPath: ':memory:', env: { APP_ENV: 'development', ...defaults, HOST: '127.0.0.1' } });
  t.after(() => overridden.close());
  assert.equal(overridden.config.bindHost, '127.0.0.1');
  assert.equal(overridden.config.publicOrigin, defaults.PUBLIC_ORIGIN);
});

test('开发环境只按邮箱限流，同一出口 IP 的多个访客不会互相卡住', async t => {
  const f = await fixture(t, { rateLimitMs: 60000 });
  const a = f.browser();
  const b = f.browser();
  ok(await a.call('/api/auth/request', { email: 'rate-a@example.test' }));
  // 同一 IP、不同邮箱：开发环境必须放行，否则托管沙箱里同时演示的人会互相挡住。
  ok(await b.call('/api/auth/request', { email: 'rate-b@example.test' }));
  // 同一个邮箱连续请求仍然要被限流。
  error(await a.call('/api/auth/request', { email: 'rate-a@example.test' }), 429, 'RATE_LIMITED');

  // 生产环境保留按来源 IP 的限制，防止单一来源刷验证码。
  const prod = await fixture(t, { env: { ...PROD }, rateLimitMs: 60000 });
  const c = prod.browser();
  const d = prod.browser();
  ok(await c.call('/api/auth/request', { email: 'rate-c@example.test' }));
  error(await d.call('/api/auth/request', { email: 'rate-d@example.test' }), 429, 'RATE_LIMITED');
});

test('开发城市按会话隔离，同一账号的不同浏览器也不互相改变', async t => {
  const f = await fixture(t);
  const a = f.browser();
  const b = f.browser();
  await a.login('a@example.test');
  await b.login('a@example.test');
  ok(await a.action('setLocation', 'paris'));
  assert.equal((await a.state()).location, 'paris');
  assert.equal((await b.state()).location, 'tokyo');
  const aCopy = f.browser(a.cookie);
  assert.equal((await aCopy.state()).location, 'paris');
  error(await a.action('setLocation', '__proto__'), 400, 'INVALID_CITY');
});

test('免费全球一次、原子附赠同城一枚邮票；重复和跨城不能多领', async t => {
  const f = await fixture(t);
  const a = f.browser();
  error(await a.action('acquire', 'tokyo-free'), 401, 'AUTH_REQUIRED');
  await a.login('a@example.test');
  error(await a.action('acquire', 'paris-free'), 403, 'CITY_MISMATCH');
  const results = await Promise.all([a.action('acquire', 'tokyo-free'), a.action('acquire', 'tokyo-free')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const state = await a.state();
  assert.equal(state.assets.length, 2);
  assert.equal(state.assets.filter(row => row.productId === 'tokyo-stamp').length, 1);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.claimedFree, true);
  ok(await a.action('setLocation', 'paris'));
  error(await a.action('acquire', 'paris-free'), 409, 'FREE_ALREADY_CLAIMED');
  error(await a.action('listAsset', state.assets[0].id, 1, ''), 403, 'RESALE_FORBIDDEN');
  error(await a.action('listAsset', state.assets[1].id, 1, ''), 403, 'RESALE_FORBIDDEN');
});

test('付费开发必须显式 sandboxPurchase，不允许客户端伪造 price', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('a@example.test');
  error(await a.action('acquire', 'tokyo-tower'), 409, 'SANDBOX_CONFIRMATION_REQUIRED');
  error(await a.call('/api/action', { name: 'acquire', args: ['tokyo-tower'], price: 0 }), 409, 'SANDBOX_CONFIRMATION_REQUIRED');
  error(await a.action('acquire', 'tokyo-tower', null, { price: 0 }), 400, 'INVALID_ARGUMENTS');
  error(await a.action('sandboxPurchase', 'paris-card'), 403, 'CITY_MISMATCH');
  const asset = ok(await a.action('sandboxPurchase', 'tokyo-tower'));
  assert.equal(asset.sandbox, true);
  assert.equal(asset.charged, false);
  const state = await a.state();
  assert.equal(state.transactions[0].amount, -16);
  assert.equal(state.transactions[0].actualAmount, 0);
  assert.match(state.transactions[0].description, /未产生真实扣款/);
  assert.equal(state.income, 0);
});

test('市场跨城转移同一资产，价格由 listing 决定，双买只有一个赢家', async t => {
  const f = await fixture(t);
  const seller = f.browser();
  const b1 = f.browser();
  const b2 = f.browser();
  await seller.login('seller@example.test', '卖方');
  const { asset, listing } = await listedCard(seller, 7.89);
  await b1.login('b1@example.test', '买方一');
  await b2.login('b2@example.test', '买方二');
  ok(await b1.action('setLocation', 'paris'));
  ok(await b2.action('setLocation', 'london'));
  const results = await Promise.all([b1.action('sandboxPurchase', asset.productId, listing.id), b2.action('sandboxPurchase', asset.productId, listing.id)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? b1 : b2;
  assert.equal(ok(results.find(r => r.status === 200)).id, asset.id);
  assert.equal((await seller.state()).assets.some(row => row.id === asset.id), false);
  assert.equal((await winner.state()).transactions[0].amount, -7.89);
  assert.equal((await seller.state()).transactions.at(-1).amount, 7.89);
  assert.equal((await seller.state()).revenue, 0);
  assert.equal((await winner.state()).market.length, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets WHERE id=?').get(asset.id).n, 1);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM transactions WHERE market_id=?').get(listing.id).n, 2);
});

test('独立 SQLite 连接并发购买仍只有一胜者', async t => {
  const dbPath = temporaryDB(t);
  const one = await fixture(t, { dbPath });
  const two = await fixture(t, { dbPath });
  const seller = one.browser();
  const first = one.browser();
  const second = two.browser();
  await seller.login('seller@example.test');
  const { asset, listing } = await listedCard(seller);
  await first.login('b1@example.test');
  await second.login('b2@example.test');
  const results = await Promise.all([first.action('sandboxPurchase', asset.productId, listing.id), second.action('sandboxPurchase', asset.productId, listing.id)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(one.db.prepare('SELECT active FROM listings WHERE id=?').get(listing.id).active, 0);
});

test('上架资产锁定、价格限制、本人下架及重复下架校验', async t => {
  const f = await fixture(t);
  const a = f.browser();
  const b = f.browser();
  await a.login('a@example.test');
  await b.login('b@example.test');
  const asset = ok(await a.action('sandboxPurchase', 'tokyo-tower'));
  for (const price of [0, -1, 1000, 0.001, '1e2', '1.234', {}, null]) error(await a.action('listAsset', asset.id, price), 400, 'INVALID_PRICE');
  const offer = ok(await a.action('listAsset', asset.id, 0.01));
  error(await a.action('listAsset', asset.id, 1), 409, 'ASSET_NOT_UNUSED');
  error(await b.action('unlistAsset', offer.id), 403, 'FORBIDDEN');
  error(await a.action('sandboxPurchase', asset.productId, offer.id), 403, 'OWN_LISTING');
  assert.equal(ok(await a.action('unlistAsset', offer.id)).status, 'unused');
  error(await a.action('unlistAsset', offer.id), 409, 'LISTING_UNAVAILABLE');
  assert.equal(ok(await a.action('listAsset', asset.id, 999)).price, 999);
});

test('Haversine 范围与 UTC 工作日 ETA', async t => {
  const f = await fixture(t);
  const a = f.browser();
  assert.deepEqual(ok(await a.action('deliveryEstimate', 'tokyo')), { min: 1, max: 3, distance: 0 });
  assert.equal(ok(await a.action('deliveryEstimate', 'shenzhen')).min, 3);
  const far = ok(await a.call('/api/deliveryEstimate?city=paris'));
  assert.equal(far.min, 6);
  assert.equal(far.max, 10);
  assert.equal(addBusinessDays('2026-09-18T08:00:00Z', 1), '2026-09-21T08:00:00.000Z');
  assert.equal(addBusinessDays('2026-09-18T08:00:00Z', 3), '2026-09-23T08:00:00.000Z');
  assert.equal(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  assert.throws(() => addBusinessDays('not-a-date', 1));
  assert.throws(() => addBusinessDays(Date.now(), -1));
  assert.deepEqual((await a.state()).assets, []);
});

test('寄信资产原子消耗：类型、所有权、自己的邮箱和长度失败均不消耗', async t => {
  const f = await fixture(t);
  const a = f.browser();
  const b = f.browser();
  await a.login('sender@example.test');
  await b.login('other@example.test');
  const pair = await freePair(a);
  const other = await freePair(b);
  for (const [input, status, code] of [
    [letterInput(pair, { stampAssetId: pair.card.id }), 400, 'ASSET_TYPE_MISMATCH'],
    [letterInput(pair, { stampAssetId: other.stamp.id }), 404, 'ASSET_NOT_FOUND'],
    [letterInput(pair, { toEmail: ' SENDER@EXAMPLE.TEST ' }), 400, 'SELF_RECIPIENT'],
    [letterInput(pair, { message: '字'.repeat(501) }), 400, 'INVALID_INPUT'],
    [letterInput(pair, { toCity: 'unknown' }), 400, 'INVALID_CITY']
  ]) error(await a.action('sendLetter', input), status, code);
  assert.equal((await a.state()).assets.every(row => row.status === 'unused'), true);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM jobs').get().n, 0);
  const letter = ok(await a.action('sendLetter', letterInput(pair, { message: '字'.repeat(500) })));
  assert.equal(letter.status, 'transit');
  assert.ok(letter.days >= 3 && letter.days <= 6);
  assert.equal(letter.eta, addBusinessDays(letter.sentAt, letter.days));
  const state = await a.state();
  assert.equal(state.assets.find(row => row.id === pair.card.id).status, 'sent');
  assert.equal(state.assets.find(row => row.id === pair.stamp.id).status, 'used');
  error(await a.action('sendLetter', letterInput(pair)), 409, 'ASSET_NOT_UNUSED');
  const another = ok(await a.action('sandboxPurchase', 'tokyo-tower'));
  error(await a.action('sendLetter', letterInput(pair, { assetId: another.id })), 409, 'ASSET_NOT_UNUSED');
  assert.equal((await a.state()).assets.find(row => row.id === another.id).status, 'unused');
  assert.equal((await a.state()).letters[0].eta, letter.eta);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM jobs').get().n, 1);
});

test('事务内任一步骤失败时卡、邮票、信件与任务一起回滚', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('a@example.test');
  const pair = await freePair(a);
  f.db.exec("CREATE TRIGGER reject_test_job BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT,'测试事务回滚'); END;");
  error(await a.action('sendLetter', letterInput(pair)), 500, 'INTERNAL_ERROR');
  assert.equal((await a.state()).assets.every(row => row.status === 'unused'), true);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM letters').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM jobs').get().n, 0);
  f.db.exec('DROP TRIGGER reject_test_job');
  ok(await a.action('sendLetter', letterInput(pair)));
});

test('到期本地队列变为 sandbox_ready，不发邮件也不伪称 delivered，ETA 不重算', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('a@example.test');
  const pair = await freePair(a);
  const letter = ok(await a.action('sendLetter', letterInput(pair)));
  assert.deepEqual(await f.runWorker(), []);
  assert.equal(f.db.prepare('SELECT status FROM jobs').get().status, 'pending');
  f.setTime(letter.eta);
  const [left, right] = await Promise.all([f.runWorker(), f.runWorker()]);
  assert.deepEqual(left, right);
  assert.equal((await a.state()).letters[0].status, 'sandbox_ready');
  assert.equal((await a.state()).letters[0].deliveredAt, null);
  assert.equal((await a.state()).letters[0].eta, letter.eta);
  assert.deepEqual(await f.runWorker(), []);
  assert.equal(f.db.prepare('SELECT status FROM jobs').get().status, 'sandbox_ready');
  assert.equal(f.mails.length, 0);
  error(await a.action('reply', letter.id, '未收不能聊'), 409, 'LETTER_NOT_RECEIVED');
});

test('后台定时 worker 会自动处理到期任务且 close 清理资源', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('a@example.test');
  const letter = ok(await a.action('sendLetter', letterInput(await freePair(a))));
  f.setTime(letter.eta);
  await new Promise(resolve => setTimeout(resolve, 1150));
  assert.equal(f.db.prepare('SELECT status FROM jobs').get().status, 'sandbox_ready');
  await f.close();
  await f.close();
  assert.equal(f.server.listening, false);
  assert.deepEqual(await f.runWorker(), []);
});

test('claim 匿名仅两项脱敏信息；邮箱绑定、并发一次性签收和双方共享信件消息', async t => {
  const f = await fixture(t);
  const sender = f.browser();
  const recipient = f.browser();
  const outsider = f.browser();
  await sender.login('sender@example.test', '发件甲');
  await recipient.login('recipient@example.test', '收件乙');
  await outsider.login('outsider@example.test', '旁观者');
  const pair = await freePair(sender);
  const letter = ok(await sender.action('sendLetter', letterInput(pair, { message: '<img src=x onerror=alert(1)>私密寄语' })));
  const token = letter.sandboxClaimToken;
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  const stored = f.db.prepare('SELECT * FROM letters WHERE id=?').get(letter.id);
  assert.equal(Buffer.from(stored.claim_hash).equals(digest(token)), true);
  assert.equal(JSON.stringify(stored).includes(token), false);
  assert.equal((await sender.call('/api/bootstrap')).raw.includes(token), false);
  const anonymous = await f.browser().call(`/api/claim?token=${token}`);
  assert.deepEqual(Object.keys(ok(anonymous)).sort(), ['fromName', 'maskedEmail']);
  assert.equal(anonymous.raw.includes('私密寄语'), false);
  assert.equal(anonymous.raw.includes('recipient@example.test'), false);
  error(await outsider.call(`/api/claim?token=${token}`), 403, 'CLAIM_EMAIL_MISMATCH');
  error(await sender.call('/api/claim', { token }), 403, 'CLAIM_EMAIL_MISMATCH');
  error(await recipient.call('/api/claim', { token }), 409, 'LETTER_NOT_READY');
  assert.deepEqual((await recipient.state()).letters, []);
  f.setTime(letter.eta);
  await f.runWorker();
  const full = await recipient.call(`/api/claim?token=${token}`);
  assert.equal(ok(full).message, '<img src=x onerror=alert(1)>私密寄语');
  assert.equal(full.raw.includes('<img'), false);
  const claims = await Promise.all([recipient.call('/api/claim', { token }), recipient.call('/api/claim', { token })]);
  assert.deepEqual(claims.map(r => r.status).sort(), [200, 409]);
  assert.equal((await recipient.state()).assets[0].id, pair.card.id);
  assert.equal((await recipient.state()).assets[0].status, 'received');
  assert.equal((await sender.state()).assets.some(row => row.id === pair.card.id), false);
  assert.equal((await sender.state()).letters[0].status, 'received');
  ok(await sender.action('reply', letter.id, '你收到啦'));
  ok(await recipient.action('reply', letter.id, '收到，谢谢'));
  assert.deepEqual((await sender.state()).letters[0].messages, (await recipient.state()).letters[0].messages);
  assert.deepEqual((await sender.state()).letters[0].messages.map(m => m.author), ['发件甲', '收件乙']);
  error(await outsider.action('reply', letter.id, '偷窥'), 404, 'LETTER_NOT_FOUND');
  assert.deepEqual((await outsider.state()).letters, []);
  error(await outsider.call('/api/claim', { token }), 403, 'CLAIM_EMAIL_MISMATCH');
  error(await recipient.call('/api/claim', { token }), 409, 'ALREADY_CLAIMED');
  error(await f.browser().call('/api/claim?token=invalid'), 404, 'CLAIM_NOT_FOUND');
});

test('markDelivered 仅开发发件人可用且明确标注模拟', async t => {
  const f = await fixture(t);
  const a = f.browser();
  const b = f.browser();
  await a.login('a@example.test');
  await b.login('b@example.test');
  const letter = ok(await a.action('sendLetter', letterInput(await freePair(a))));
  error(await b.action('markDelivered', letter.id), 404, 'LETTER_NOT_FOUND');
  const result = ok(await a.call('/api/markDelivered', { letterId: letter.id }));
  assert.equal(result.status, 'delivered');
  assert.equal(result.sandbox, true);
  assert.match(result.deliveryNote, /没有发送邮件/);
  error(await a.action('markDelivered', letter.id), 409, 'LETTER_STATUS_CONFLICT');
  ok(await a.action('reply', letter.id, '仅开发模拟'));
  assert.equal(f.mails.length, 0);
});

test('交易咨询真正买卖双方共享，旁观者和另一买家不可读写', async t => {
  const f = await fixture(t);
  const seller = f.browser();
  const buyer = f.browser();
  const outsider = f.browser();
  await seller.login('s@example.test', '卖方');
  await buyer.login('b@example.test', '买方');
  await outsider.login('o@example.test', '另一个买家');
  const { listing, asset } = await listedCard(seller);
  const thread = ok(await buyer.action('startThread', listing.id, '请问还在吗'));
  ok(await seller.action('comment', thread.id, '在的'));
  assert.deepEqual((await seller.state()).community[0].messages, (await buyer.state()).community[0].messages);
  assert.equal((await seller.state()).community[0].peer, '买方');
  assert.equal((await buyer.state()).community[0].peer, '卖方');
  error(await outsider.action('comment', thread.id, '非法写入'), 404, 'THREAD_NOT_FOUND');
  assert.deepEqual((await outsider.state()).community, []);
  const separate = ok(await outsider.action('startThread', listing.id, '另一个私聊'));
  assert.notEqual(separate.id, thread.id);
  assert.equal((await buyer.state()).community.length, 1);
  assert.equal((await seller.state()).community.length, 2);
  ok(await buyer.action('sandboxPurchase', asset.productId, listing.id));
  ok(await seller.action('comment', thread.id, '成交后可以继续交流'));
  error(await outsider.action('startThread', listing.id, '新开会话'), 409, 'LISTING_UNAVAILABLE');
  assert.equal((await f.browser().state()).community.length, 0);
});

test('原创创建 pending、一份资产；审核后锁定上架，对外作者无邮箱', async t => {
  const f = await fixture(t);
  const author = f.browser();
  const buyer = f.browser();
  await author.login('author@example.test', '原创作者');
  await buyer.login('buyer@example.test');
  const creation = ok(await author.action('createWork', work()));
  assert.equal(creation.status, 'pending');
  const state = await author.state();
  assert.equal(state.assets.length, 1);
  assert.equal(state.assets[0].productId, creation.productId);
  error(await author.action('listAsset', state.assets[0].id, 12.34), 403, 'CREATION_NOT_APPROVED');
  error(await author.action('acquire', creation.productId), 403, 'MARKET_ONLY');
  error(await buyer.action('reviewCreation', creation.id), 404, 'CREATION_NOT_FOUND');
  assert.equal((await buyer.call('/api/bootstrap')).data.bootstrap.products.some(p => p.id === creation.productId), false);
  assert.equal(ok(await author.action('reviewCreation', creation.id)).status, 'approved');
  error(await author.action('reviewCreation', creation.id), 409, 'ALREADY_REVIEWED');
  const reviewed = await author.state();
  assert.equal(reviewed.assets[0].status, 'listed');
  assert.equal(reviewed.market.length, 1);
  const market = await f.browser().call('/api/bootstrap');
  const p = market.data.bootstrap.products.find(row => row.id === creation.productId);
  assert.equal(p.creator, '原创作者');
  assert.equal(market.raw.includes('author@example.test'), false);
  ok(await buyer.action('sandboxPurchase', creation.productId, reviewed.market[0].id));
  assert.equal((await buyer.state()).assets[0].id, state.assets[0].id);
  assert.deepEqual((await buyer.state()).creations, []);
});

test('原创标题、版权、金额、base64、魔数与 2 MB 限制', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('a@example.test');
  for (const [input, code] of [
    [work({ rights: false }), 'RIGHTS_REQUIRED'], [work({ title: '字' }), 'INVALID_INPUT'], [work({ title: '字'.repeat(31) }), 'INVALID_INPUT'],
    [work({ type: 'svg' }), 'INVALID_TYPE'], [work({ price: 1000 }), 'INVALID_PRICE'],
    [work({ img: 'data:image/svg+xml;base64,PHN2Zy8+' }), 'INVALID_IMAGE'],
    [work({ img: 'data:image/png;base64,' + Buffer.from('<svg><script>bad</script></svg>').toString('base64') }), 'INVALID_IMAGE'],
    [work({ img: PNG.replace('image/png', 'image/jpeg') }), 'INVALID_IMAGE'],
    [work({ img: 'data:image/png;base64,abc' }), 'INVALID_IMAGE'],
    [work({ img: 'https://example.test/image.png' }), 'INVALID_IMAGE'],
    [work({ img: 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }), 'INVALID_IMAGE']
  ]) error(await a.action('createWork', input), 400, code);
  assert.deepEqual((await a.state()).assets, []);
  assert.equal(imageData(PNG), PNG);
  ok(await a.action('createWork', work({ title: '字'.repeat(30), price: 0.01 })));
});

test('生产禁止付费和所有开发开关，不能伪造价格获得资产', async t => {
  const f = await fixture(t, { env: { ...PROD, SANDBOX_PURCHASE: 'true', PAYMENT_CONFIGURED: 'true' } });
  const a = f.browser();
  await a.login('a@example.test');
  error(await a.action('acquire', 'shenzhen-card'), 503, 'PAYMENT_NOT_CONFIGURED');
  error(await a.call('/api/action', { name: 'acquire', args: ['shenzhen-card'], price: 0, sandboxPurchase: true }), 503, 'PAYMENT_NOT_CONFIGURED');
  for (const [name, args] of [['sandboxPurchase', ['shenzhen-card']], ['setLocation', ['tokyo']], ['markDelivered', ['letter-fake']], ['reviewCreation', ['creation-fake']], ['reset', []]]) {
    error(await a.action(name, ...args), 403, 'DEVELOPMENT_ONLY');
  }
  error(await a.call('/api/markDelivered', { letterId: 'fake' }), 403, 'DEVELOPMENT_ONLY');
  assert.deepEqual((await a.state()).assets, []);
  const creation = ok(await a.action('createWork', work({ city: 'shenzhen' })));
  assert.equal(creation.status, 'pending');
  error(await a.action('reviewCreation', creation.id), 403, 'DEVELOPMENT_ONLY');
});

test('生产定位只接受 Tencent 六城中文别名，不信 XFF 时绝不回退东京', async t => {
  const f = await fixture(t, { env: { ...PROD, TRUST_PROXY: '' } });
  const a = f.browser();
  const initial = await a.state();
  assert.equal(initial.location, null);
  assert.deepEqual(initial.market, []);
  assert.equal(f.locations.length, 0);
  await a.login('a@example.test');
  error(await a.action('acquire', 'tokyo-free'), 403, 'LOCATION_UNKNOWN');
  error(await a.action('deliveryEstimate', 'tokyo'), 403, 'LOCATION_UNKNOWN');
  const { cities } = loadCatalog();
  for (const [key, city] of Object.entries(cities)) {
    assert.equal(cityFromTencent({ status: 0, result: { ad_info: { city: city.name + '市' } } }, cities), key);
    assert.equal(cityFromTencent({ status: 0, result: { ad_info: { city: city.name } } }, cities), key);
  }
  for (const city of ['Tokyo', '东京都', '广州市', '']) assert.equal(cityFromTencent({ status: 0, result: { ad_info: { city } } }, cities), null);
  assert.equal(cityFromTencent({ status: 1, result: { ad_info: { city: '东京' } } }, cities), null);
});

test('生产单层本机代理校验 XFF；城市由服务端定位而非客户端提交', async t => {
  const f = await fixture(t, { env: PROD });
  const a = f.browser();
  await a.login('a@example.test');
  assert.equal((await a.state()).location, 'shenzhen');
  assert.equal(f.locations[0].ip, '8.8.8.8');
  error(await a.call('/api/action', { name: 'acquire', args: ['tokyo-free'], location: 'tokyo' }), 403, 'CITY_MISMATCH');
  await freePair(a, 'shenzhen-free');
  for (const ip of ['8.8.8.8, 1.1.1.1', 'garbage', '8.8.8.8:123']) error(await a.call('/api/bootstrap', undefined, { headers: { 'X-Forwarded-For': ip } }), 400, 'INVALID_FORWARDED_IP');
  const req = { socket: { remoteAddress: '203.0.113.10' }, headers: { 'x-forwarded-for': '8.8.8.8' } };
  assert.equal(clientIP(req, 'loopback'), '203.0.113.10');
  assert.equal(clientIP({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '8.8.8.8' } }, ''), '127.0.0.1');
});

test('Tencent 查询失败或城市未识别时 unknown，仍可匿名浏览', async t => {
  for (const locationTransport of [async () => { throw new Error('网络异常'); }, async () => ({ status: 0, result: { ad_info: { city: '广州市' } } })]) {
    const f = await fixture(t, { env: PROD, locationTransport });
    const a = f.browser();
    assert.equal((await a.state()).location, null);
    await a.login('a@example.test');
    error(await a.action('acquire', 'shenzhen-free'), 403, 'LOCATION_UNKNOWN');
  }
});

test('生产队列 Resend accepted 不等于 delivered，收件验证签收后才能聊天', async t => {
  const f = await fixture(t, { env: PROD });
  const sender = f.browser();
  const recipient = f.browser();
  await sender.login('sender@example.test', '生产发件人');
  await recipient.login('recipient@example.test', '生产收件人');
  const pair = await freePair(sender, 'shenzhen-free');
  const sent = await sender.action('sendLetter', letterInput(pair));
  const letter = ok(sent);
  assert.equal(letter.sandbox, false);
  assert.equal(letter.sandboxClaimToken, undefined);
  assert.equal(f.mails.length, 2);
  assert.deepEqual(await f.runWorker(), []);
  f.setTime(letter.eta);
  await Promise.all([f.runWorker(), f.runWorker()]);
  assert.equal(f.mails.length, 3);
  const mail = f.mails.at(-1);
  assert.equal(mail.to, 'recipient@example.test');
  assert.equal(mail.text.includes(letter.message), false);
  const match = mail.text.match(/https:\/\/posterposta\.example\.test\/\?claim=([A-Za-z0-9_-]{43})/);
  assert.ok(match);
  const token = match[1];
  const state = await sender.state();
  assert.equal(state.letters[0].status, 'accepted');
  assert.equal(state.letters[0].deliveredAt, null);
  assert.ok(state.letters[0].acceptedAt);
  error(await sender.action('reply', letter.id, '不能伪装已送达'), 409, 'LETTER_NOT_RECEIVED');
  error(await recipient.action('reply', letter.id, '尚未签收'), 404, 'LETTER_NOT_FOUND');
  const preview = ok(await recipient.call(`/api/claim?token=${token}`));
  assert.equal(preview.message, letter.message);
  assert.deepEqual((await recipient.state()).letters, []);
  error(await sender.call('/api/claim', { token }), 403, 'CLAIM_EMAIL_MISMATCH');
  assert.equal(ok(await recipient.call('/api/claim', { token })).status, 'received');
  ok(await recipient.action('reply', letter.id, '真实打开并签收'));
  ok(await sender.action('reply', letter.id, '收到回复'));
  assert.deepEqual((await sender.state()).letters[0].messages, (await recipient.state()).letters[0].messages);
  assert.equal((await recipient.state()).assets[0].status, 'received');
  assert.equal(f.db.prepare('SELECT status FROM jobs').get().status, 'accepted');
  assert.equal((await sender.call('/api/bootstrap')).raw.includes(token), false);
  assert.equal(f.mails.length, 3);
});

test('邮件传输结果不确定时不自动重发，也不解锁信件', async t => {
  const mails = [];
  const f = await fixture(t, {
    env: PROD,
    mailTransport: async payload => {
      mails.push(payload);
      if (payload.subject.includes('验证码')) return { id: 'fake-otp-id' };
      throw new Error('可能已发送后连接超时，包含机密信息');
    }
  });
  const a = f.browser();
  const sent = ok(await a.call('/api/auth/request', { email: 'sender@example.test' }));
  assert.equal(sent.devCode, undefined);
  const code = mails[0].text.match(/验证码是 (\d{6})/)[1];
  ok(await a.call('/api/auth/verify', { email: 'sender@example.test', name: '发送者', code }));
  const letter = ok(await a.action('sendLetter', letterInput(await freePair(a, 'shenzhen-free'))));
  f.setTime(letter.eta);
  assert.equal((await f.runWorker())[0].status, 'uncertain');
  assert.equal(f.db.prepare('SELECT status FROM jobs').get().status, 'uncertain');
  assert.equal((await a.state()).letters[0].status, 'transit');
  await f.runWorker();
  assert.equal(mails.length, 2);
  error(await a.action('reply', letter.id, '不应解锁'), 409, 'LETTER_NOT_RECEIVED');
});

test('生产验证码邮件失败返回脱敏 503 并作废 OTP', async t => {
  const f = await fixture(t, { env: PROD, mailTransport: async () => { throw new Error('token=secret-provider-detail'); } });
  const response = await f.browser().call('/api/auth/request', { email: 'a@example.test' });
  error(response, 503, 'MAIL_UNAVAILABLE');
  assert.equal(response.raw.includes('secret-provider-detail'), false);
  assert.ok(f.db.prepare('SELECT consumed_at FROM otps').get().consumed_at);
});

test('SQLite 关闭重启保留账号、会话、资产、领取额度、信件 ETA 和队列', async t => {
  const dbPath = temporaryDB(t);
  const first = await fixture(t, { dbPath });
  const a = first.browser();
  const user = await a.login('persist@example.test', '持久账号');
  const pair = await freePair(a);
  const letter = ok(await a.action('sendLetter', letterInput(pair)));
  ok(await a.action('setLocation', 'paris'));
  const cookie = a.cookie;
  await first.close();
  assert.equal(fs.readFileSync(dbPath).subarray(0, 16).toString(), 'SQLite format 3\0');
  const second = await fixture(t, { dbPath });
  const resumed = second.browser(cookie);
  const state = await resumed.state();
  assert.equal(state.user.id, user.id);
  assert.equal(state.location, 'paris');
  assert.equal(state.claimedFree, true);
  assert.equal(state.assets.length, 2);
  assert.equal(state.letters[0].eta, letter.eta);
  error(await resumed.action('acquire', 'paris-free'), 409, 'FREE_ALREADY_CLAIMED');
  assert.equal(second.db.prepare('SELECT status FROM jobs').get().status, 'pending');
  second.setTime(letter.eta);
  await second.runWorker();
  assert.equal((await resumed.state()).letters[0].status, 'sandbox_ready');
  assert.equal(second.mails.length, 0);
});

test('生产可看全局市场但付费始终 503；切换模式不会发送历史沙盒邮件', async t => {
  const dbPath = temporaryDB(t);
  const dev = await fixture(t, { dbPath });
  const seller = dev.browser();
  await seller.login('seller@example.test');
  const { listing, asset } = await listedCard(seller);
  const letter = ok(await seller.action('sendLetter', letterInput(await freePair(seller))));
  await dev.close();
  const prod = await fixture(t, { dbPath, env: { ...PROD, TRUST_PROXY: '' } });
  const anonymous = prod.browser();
  const initial = await anonymous.state();
  assert.equal(initial.location, null);
  assert.equal(initial.market[0].id, listing.id);
  const buyer = prod.browser();
  await buyer.login('buyer@example.test');
  error(await buyer.action('acquire', asset.productId, listing.id), 503, 'PAYMENT_NOT_CONFIGURED');
  assert.deepEqual((await buyer.state()).assets, []);
  prod.setTime(letter.eta);
  await prod.runWorker();
  assert.equal(prod.mails.length, 1);
  assert.equal(prod.db.prepare('SELECT status FROM jobs').get().status, 'sandbox_ready');
  error(await buyer.call('/api/claim', { token: letter.sandboxClaimToken }), 403, 'CLAIM_EMAIL_MISMATCH');
});

test('静态路径防遍历，不暴露 .env、数据库、服务器源码或 public 外文件', async t => {
  const f = await fixture(t);
  for (const pathname of ['/../server.cjs', '/%2e%2e/server.cjs', '/%2e%2e%2fserver.cjs', '/%252e%252e/server.cjs', '/public/../server.cjs', '/.env', '/.env.example', '/server.cjs', '/server.test.cjs', '/package.json', '/data/app.sqlite', '/public/engine.js', '/assets/../../.env', '/%5c..%5cserver.cjs', '/%00index.html']) {
    error(await request(f.port, pathname), 404, 'NOT_FOUND');
  }
  const source = await request(f.port, '/engine.js');
  assert.equal(source.status, 200);
  assert.match(source.headers['content-type'], /javascript/);
  assert.equal(source.headers['x-content-type-options'], 'nosniff');
  assert.equal(source.headers['referrer-policy'], 'no-referrer');
  assert.equal(source.headers['x-frame-options'], 'DENY');
  assert.match(source.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal((await request(f.port, '/')).status, 200);
  error(await request(f.port, '/%zz'), 400, 'INVALID_PATH');
});

test('3 MB 请求限制、JSON 语法、方法与动作白名单', async t => {
  const f = await fixture(t);
  const a = f.browser();
  error(await a.call('/api/action', { name: '__proto__', args: [] }), 404, 'ACTION_NOT_FOUND');
  error(await a.call('/api/action', { name: 'constructor', args: [] }), 404, 'ACTION_NOT_FOUND');
  error(await a.call('/api/action', { name: 'register', args: [] }), 404, 'ACTION_NOT_FOUND');
  error(await a.call('/api/action', { name: 'acquire', args: 'tokyo-free' }), 400, 'INVALID_ARGUMENTS');
  error(await a.call('/api/action', []), 400, 'INVALID_INPUT');
  error(await request(f.port, '/api/auth/request', { method: 'POST', rawBody: '{', headers: { 'Content-Type': 'application/json' } }), 400, 'INVALID_JSON');
  error(await request(f.port, '/api/action', { method: 'POST', body: {} }), 415, 'CONTENT_TYPE_REQUIRED');
  error(await request(f.port, '/api/action', { method: 'DELETE' }), 405, 'METHOD_NOT_ALLOWED');
  error(await a.call('/api/action', { name: 'setLocation', args: ['x'.repeat(3 * 1024 * 1024)] }), 413, 'BODY_TOO_LARGE');
  error(await a.action('reset'), 403, 'RESET_DISABLED');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('默认传输只访问固定 Resend/Tencent HTTPS 地址且不会跟随重定向', async t => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://apis.map.qq.com/ws/location/v1/ip?')) return { ok: true, json: async () => ({ status: 0, result: { ad_info: { city: '上海市' } } }) };
    assert.equal(String(url), 'https://api.resend.com/emails');
    return { ok: true, json: async () => ({ id: 'fake-fixed-endpoint-id' }) };
  };
  t.after(() => { globalThis.fetch = previous; });
  const f = await fixture(t, { env: { ...PROD, MAIL_URL: 'http://evil.example.test', TENCENT_URL: 'http://evil.example.test' }, mailTransport: undefined, locationTransport: undefined });
  const response = await f.browser().call('/api/auth/request', { email: 'a@example.test' });
  ok(response);
  assert.equal(response.data.bootstrap.state.location, 'shanghai');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    assert.ok(call.options.signal);
  }
  const location = new URL(calls[0].url);
  assert.equal(location.searchParams.get('ip'), '8.8.8.8');
  assert.equal(location.searchParams.get('key'), PROD.TENCENT_LOCATION_KEY);
  const mail = calls[1];
  assert.equal(mail.options.method, 'POST');
  assert.equal(mail.options.headers.Authorization, `Bearer ${PROD.RESEND_API_KEY}`);
  assert.deepEqual(JSON.parse(mail.options.body).to, ['a@example.test']);
});

test('邮件来源只可导航首页，不可借导航头绕过 API Origin 防护', async t => {
  const f = await fixture(t, { env: PROD });
  const headers = {
    'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document',
    Referer: 'https://webmail.example.test/'
  };
  assert.equal((await request(f.port, '/?claim=opaque-test-value', { headers })).status, 200);
  error(await request(f.port, '/api/bootstrap', { headers }), 403, 'CSRF_ORIGIN');
  error(await request(f.port, '/api/claim?token=opaque-test-value', { headers }), 403, 'CSRF_ORIGIN');
  error(await request(f.port, '/', { headers: { ...headers, Origin: 'https://webmail.example.test' } }), 403, 'CSRF_ORIGIN');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
});

test('赠票失败回滚免费额度；市场过户失败回滚 listing 和全部交易', async t => {
  const f = await fixture(t);
  const seller = f.browser();
  const buyer = f.browser();
  await seller.login('seller@example.test');
  await buyer.login('buyer@example.test');
  f.db.exec("CREATE TRIGGER reject_gift BEFORE INSERT ON assets WHEN NEW.source='gift' BEGIN SELECT RAISE(ABORT,'测试赠票失败'); END;");
  error(await seller.action('acquire', 'tokyo-free'), 500, 'INTERNAL_ERROR');
  const unchanged = await seller.state();
  assert.equal(unchanged.claimedFree, false);
  assert.deepEqual(unchanged.assets, []);
  assert.deepEqual(unchanged.transactions, []);
  f.db.exec('DROP TRIGGER reject_gift');
  await freePair(seller);
  const { asset, listing } = await listedCard(seller);
  f.db.exec("CREATE TRIGGER reject_transfer BEFORE UPDATE OF owner_id ON assets BEGIN SELECT RAISE(ABORT,'测试过户失败'); END;");
  error(await buyer.action('sandboxPurchase', asset.productId, listing.id), 500, 'INTERNAL_ERROR');
  assert.equal(f.db.prepare('SELECT active FROM listings WHERE id=?').get(listing.id).active, 1);
  assert.equal((await seller.state()).assets.find(a => a.id === asset.id).status, 'listed');
  assert.deepEqual((await buyer.state()).assets, []);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM transactions WHERE market_id=?').get(listing.id).n, 0);
  f.db.exec('DROP TRIGGER reject_transfer');
  ok(await buyer.action('sandboxPurchase', asset.productId, listing.id));
});

test('签收回滚保证卡片不丢失；收件方保留必要的原创邮票产品资料', async t => {
  const f = await fixture(t);
  const sender = f.browser();
  const recipient = f.browser();
  await sender.login('sender@example.test');
  await recipient.login('recipient@example.test');
  const pair = await freePair(sender);
  const stampWork = ok(await sender.action('createWork', work({ type: 'stamp', title: '原创邮票' })));
  const stamp = (await sender.state()).assets.find(a => a.productId === stampWork.productId);
  const letter = ok(await sender.action('sendLetter', letterInput(pair, { stampAssetId: stamp.id })));
  f.setTime(letter.eta);
  await f.runWorker();
  f.db.exec("CREATE TRIGGER reject_claim BEFORE UPDATE OF status ON letters WHEN NEW.status='received' BEGIN SELECT RAISE(ABORT,'测试签收失败'); END;");
  error(await recipient.call('/api/claim', { token: letter.sandboxClaimToken }), 500, 'INTERNAL_ERROR');
  assert.equal((await sender.state()).assets.find(a => a.id === pair.card.id).status, 'sent');
  assert.deepEqual((await recipient.state()).assets, []);
  assert.equal(f.db.prepare('SELECT claimed_at FROM letters WHERE id=?').get(letter.id).claimed_at, null);
  f.db.exec('DROP TRIGGER reject_claim');
  const response = await recipient.call('/api/claim', { token: letter.sandboxClaimToken });
  ok(response);
  assert.ok(response.data.bootstrap.products.find(p => p.id === stampWork.productId));
  assert.deepEqual(response.data.bootstrap.state.creations, []);
  error(await recipient.call('/api/claim', { token: letter.sandboxClaimToken }), 409, 'ALREADY_CLAIMED');
});

// ---------------- 账号体系：登录、绑定邮箱、密码、二次验证、设备 ----------------

test('两步登录：新邮箱缺昵称时不消耗验证码，老账号免填昵称；昵称可修改且校验', async t => {
  const f = await fixture(t);
  const a = f.browser();
  const code = ok(await a.call('/api/auth/request', { email: 'fresh@example.test' })).devCode;
  error(await a.call('/api/auth/verify', { email: 'fresh@example.test', code }), 400, 'NAME_REQUIRED');
  error(await a.call('/api/auth/verify', { email: 'fresh@example.test', code, name: '   ' }), 400, 'NAME_REQUIRED');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  assert.equal(f.db.prepare('SELECT consumed_at FROM otps').get().consumed_at, null);
  const user = ok(await a.call('/api/auth/verify', { email: 'fresh@example.test', code, name: '新朋友' }));
  assert.equal(user.name, '新朋友');
  const b = f.browser();
  const again = ok(await b.call('/api/auth/request', { email: 'fresh@example.test' })).devCode;
  assert.equal(ok(await b.call('/api/auth/verify', { email: 'fresh@example.test', code: again })).id, user.id);
  error(await b.call('/api/account/profile', { name: '' }), 400, 'INVALID_INPUT');
  error(await b.call('/api/account/profile', { name: 'a\tb' }), 400, 'INVALID_INPUT');
  assert.equal(ok(await b.call('/api/account/profile', { name: '改名后' })).name, '改名后');
  assert.equal((await a.state()).user.name, '改名后');
  error(await f.browser().call('/api/account/profile', { name: 'x' }), 401, 'AUTH_REQUIRED');
  const account = (await a.state()).account;
  assert.deepEqual(Object.keys(account).sort(), ['createdAt', 'email', 'emails', 'hasPassword', 'id', 'maxEmails', 'name', 'passwordChangedAt', 'verifiedUntil']);
  assert.equal(account.verifiedUntil, new Date(Date.parse('2026-09-14T08:00:00Z') + FIFTEEN_MINUTES).toISOString());
});

test('一个账号绑定多个邮箱：任一邮箱可登录与签收，邮箱全局唯一，主邮箱可换不可解绑', async t => {
  const f = await fixture(t);
  const me = f.browser();
  const other = f.browser();
  const sender = f.browser();
  const user = await me.login('home@example.test', '我');
  await other.login('other@example.test', '别人');
  await sender.login('sender@example.test', '寄件人');
  error(await me.call('/api/account/emails/request', { email: 'home@example.test' }), 409, 'EMAIL_ALREADY_BOUND');
  error(await me.call('/api/account/emails/request', { email: 'other@example.test' }), 409, 'EMAIL_TAKEN');
  const sent = ok(await me.call('/api/account/emails/request', { email: 'Work@Example.test' }));
  assert.match(sent.devCode, /^\d{6}$/);
  assert.equal(sent.sentTo, 'w***@e***.test');
  error(await me.call('/api/account/emails/verify', { email: 'work@example.test', code: sent.devCode === '000000' ? '111111' : '000000' }), 400, 'CODE_INVALID_OR_EXPIRED');
  // 验证码按账号隔离：别人拿到这个码也不能把邮箱绑到自己名下。
  error(await other.call('/api/account/emails/verify', { email: 'work@example.test', code: sent.devCode }), 400, 'CODE_INVALID_OR_EXPIRED');
  const account = ok(await me.call('/api/account/emails/verify', { email: 'work@example.test', code: sent.devCode }));
  assert.deepEqual(account.emails.map(e => [e.email, e.primary]), [['home@example.test', true], ['work@example.test', false]]);
  assert.equal((await f.browser().login('work@example.test')).id, user.id);

  const pair = await freePair(sender);
  const letter = ok(await sender.action('sendLetter', letterInput(pair, { toEmail: 'work@example.test' })));
  assert.equal(letter.role, 'sender');
  f.setTime(letter.eta);
  await f.runWorker();
  const claimed = ok(await me.call('/api/claim', { token: letter.sandboxClaimToken }));
  assert.equal(claimed.role, 'recipient');
  assert.equal((await me.state()).letters[0].role, 'recipient');
  assert.equal((await sender.state()).letters[0].role, 'sender');
  const mine = await freePair(me);
  error(await me.action('sendLetter', letterInput(mine, { toEmail: 'work@example.test' })), 400, 'SELF_RECIPIENT');

  // 寄信 ETA 已过去好几天，换主邮箱、解绑都要先二次验证。
  error(await me.call('/api/account/emails/primary', { email: 'work@example.test' }), 403, 'REAUTH_REQUIRED');
  ok(await me.call('/api/auth/reauth/request', {}));
  error(await me.call('/api/auth/reauth/verify', { code: 'abc' }), 400, 'CODE_INVALID_OR_EXPIRED');
  await reauth(me);
  assert.equal(ok(await me.call('/api/account/emails/primary', { email: 'work@example.test' })).email, 'work@example.test');
  assert.equal((await me.state()).user.email, 'work@example.test');
  error(await me.call('/api/account/emails/remove', { email: 'work@example.test' }), 409, 'PRIMARY_EMAIL');
  error(await me.call('/api/account/emails/primary', { email: 'other@example.test' }), 404, 'EMAIL_NOT_BOUND');
  const stale = ok(await f.browser().call('/api/auth/request', { email: 'home@example.test' })).devCode;
  assert.deepEqual(ok(await me.call('/api/account/emails/remove', { email: 'home@example.test' })).emails.map(e => e.email), ['work@example.test']);
  error(await f.browser().call('/api/auth/verify', { email: 'home@example.test', code: stale, name: '抢注' }), 400, 'OTP_INVALID_OR_EXPIRED');
  await reauth(other);
  await bindEmail(other, 'home@example.test');
  assert.equal((await me.state()).letters[0].status, 'received');
  assert.equal((await me.state()).assets.find(a => a.id === pair.card.id).status, 'received');
});

test('每个账号最多绑定 5 个邮箱；绑定验证码 10 分钟过期、5 次错误锁定', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('a0@example.test', '甲');
  for (let i = 1; i < 5; i++) await bindEmail(a, `a${i}@example.test`);
  assert.equal((await a.state()).account.emails.length, 5);
  error(await a.call('/api/account/emails/request', { email: 'a5@example.test' }), 409, 'EMAIL_LIMIT');
  ok(await a.call('/api/account/emails/remove', { email: 'a4@example.test' }));
  const sent = ok(await a.call('/api/account/emails/request', { email: 'a5@example.test' }));
  const wrong = sent.devCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) error(await a.call('/api/account/emails/verify', { email: 'a5@example.test', code: wrong }), 400, 'CODE_INVALID_OR_EXPIRED');
  error(await a.call('/api/account/emails/verify', { email: 'a5@example.test', code: wrong }), 429, 'CODE_LOCKED');
  error(await a.call('/api/account/emails/verify', { email: 'a5@example.test', code: sent.devCode }), 429, 'CODE_LOCKED');
  const resent = ok(await a.call('/api/account/emails/request', { email: 'a5@example.test' }));
  f.advance(10 * 60 * 1000);
  error(await a.call('/api/account/emails/verify', { email: 'a5@example.test', code: resent.devCode }), 400, 'CODE_INVALID_OR_EXPIRED');
  assert.equal((await a.state()).account.emails.length, 4);
});

test('可选密码：须近期验证才能设置，scrypt 存储，五次错误锁定 15 分钟且不暴露账号是否存在', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('pw@example.test', '密码用户');
  error(await a.call('/api/account/password', { password: 'short1' }), 400, 'INVALID_PASSWORD');
  error(await a.call('/api/account/password', { password: 'onlyletters' }), 400, 'INVALID_PASSWORD');
  f.advance(FIFTEEN_MINUTES + 1);
  error(await a.call('/api/account/password', { password: 'Postcard2026' }), 403, 'REAUTH_REQUIRED');
  await reauth(a);
  const other = f.browser();
  await other.login('pw@example.test');
  const set = ok(await a.call('/api/account/password', { password: 'Postcard2026' }));
  assert.equal(set.hasPassword, true);
  assert.equal(set.revokedSessions, 1);
  assert.equal((await other.state()).user, null);
  const stored = f.db.prepare('SELECT password_hash FROM users').get().password_hash;
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(stored.includes('Postcard2026'), false);

  const b = f.browser();
  const user = ok(await b.call('/api/auth/password', { email: 'PW@example.test', password: 'Postcard2026' }));
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name']);
  assert.ok((await b.state()).account.verifiedUntil);

  const c = f.browser();
  const unknown = await c.call('/api/auth/password', { email: 'nobody@example.test', password: 'Postcard2026' });
  const wrong = () => c.call('/api/auth/password', { email: 'pw@example.test', password: 'Wrong20260' });
  const right = () => c.call('/api/auth/password', { email: 'pw@example.test', password: 'Postcard2026' });
  error(unknown, 400, 'INVALID_CREDENTIALS');
  const first = await wrong();
  error(first, 400, 'INVALID_CREDENTIALS');
  assert.equal(unknown.data.error, first.data.error);
  error(await c.call('/api/auth/password', { email: 'pw@example.test', password: { toString: 1 } }), 400, 'INVALID_CREDENTIALS');
  for (let i = 0; i < 2; i++) error(await wrong(), 400, 'INVALID_CREDENTIALS');
  error(await wrong(), 429, 'LOGIN_LOCKED');
  error(await right(), 429, 'LOGIN_LOCKED');
  f.advance(LOCK_MINUTES_MS());
  ok(await right());

  f.advance(FIFTEEN_MINUTES + 1);
  error(await c.call('/api/account/password', { password: 'Another2027', currentPassword: 'bad-password1' }), 400, 'INVALID_CREDENTIALS');
  assert.equal(ok(await c.call('/api/account/password', { password: 'Another2027', currentPassword: 'Postcard2026' })).revokedSessions, 2);
  assert.equal((await a.state()).user, null);
  assert.equal((await b.state()).user, null);
  error(await f.browser().call('/api/auth/password', { email: 'pw@example.test', password: 'Postcard2026' }), 400, 'INVALID_CREDENTIALS');
  ok(await c.call('/api/account/password/remove', {}));
  assert.equal((await c.state()).account.hasPassword, false);
  error(await f.browser().call('/api/auth/password', { email: 'pw@example.test', password: 'Another2027' }), 400, 'INVALID_CREDENTIALS');
  error(await c.call('/api/auth/reauth/verify', { password: 'Another2027' }), 409, 'NO_PASSWORD');
});
function LOCK_MINUTES_MS() { return 15 * 60 * 1000 + 1; }

test('邮箱验证码登录会清掉该邮箱的密码失败计数；二次验证也可以用密码', async t => {
  const f = await fixture(t);
  const a = f.browser();
  await a.login('mix@example.test', '混合');
  ok(await a.call('/api/account/password', { password: 'Mixed12345' }));
  const c = f.browser();
  for (let i = 0; i < 4; i++) error(await c.call('/api/auth/password', { email: 'mix@example.test', password: 'Nope123456' }), 400, 'INVALID_CREDENTIALS');
  await c.login('mix@example.test');
  error(await f.browser().call('/api/auth/password', { email: 'mix@example.test', password: 'Nope123456' }), 400, 'INVALID_CREDENTIALS');
  f.advance(FIFTEEN_MINUTES + 1);
  error(await a.call('/api/account/emails/request', { email: 'mix2@example.test' }), 403, 'REAUTH_REQUIRED');
  error(await a.call('/api/auth/reauth/verify', { password: 'Wrong123456' }), 400, 'INVALID_CREDENTIALS');
  ok(await a.call('/api/auth/reauth/verify', { password: 'Mixed12345' }));
  ok(await a.call('/api/account/emails/request', { email: 'mix2@example.test' }));
});

test('登录设备：识别设备、标记当前，可单独下线或下线其他全部，当前设备不能自踢', async t => {
  const f = await fixture(t);
  const phone = f.browser('', { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
  const laptop = f.browser('', { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' });
  const tablet = f.browser('', { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36' });
  await phone.login('device@example.test', '设备');
  f.advance(1000);
  await laptop.login('device@example.test');
  f.advance(1000);
  await tablet.login('device@example.test');
  const list = ok(await laptop.call('/api/account/sessions'));
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(s => s.device).sort(), ['Chrome · Android', 'Chrome · macOS', 'Safari · iOS']);
  assert.deepEqual(list.filter(s => s.current).map(s => s.device), ['Chrome · macOS']);
  assert.equal(JSON.stringify(list).includes(laptop.cookie.split('=')[1]), false);
  error(await laptop.call('/api/account/sessions/revoke', { id: list.find(s => s.current).id }), 400, 'CURRENT_SESSION');
  error(await laptop.call('/api/account/sessions/revoke', { id: 'zz' }), 400, 'INVALID_INPUT');
  const phoneId = list.find(s => s.device === 'Safari · iOS').id;
  assert.equal(ok(await laptop.call('/api/account/sessions/revoke', { id: phoneId })).sessions.length, 2);
  assert.equal((await phone.state()).user, null);
  error(await laptop.call('/api/account/sessions/revoke', { id: phoneId }), 404, 'SESSION_NOT_FOUND');
  error(await f.browser().call('/api/account/sessions'), 401, 'AUTH_REQUIRED');
  f.advance(FIFTEEN_MINUTES + 1);
  error(await laptop.call('/api/account/sessions/revoke', { others: true }), 403, 'REAUTH_REQUIRED');
  await reauth(laptop);
  assert.equal(ok(await laptop.call('/api/account/sessions/revoke', { others: true })).revoked, 1);
  assert.equal((await tablet.state()).user, null);
  assert.equal((await laptop.state()).user.email, 'device@example.test');
});

test('生产环境绑定与二次验证码只走邮件、不回传明文', async t => {
  const f = await fixture(t, { env: PROD });
  const a = f.browser();
  await a.login('prod@example.test', '生产');
  const sent = ok(await a.call('/api/account/emails/request', { email: 'second@example.test' }));
  assert.equal(sent.devCode, undefined);
  assert.equal(sent.emailSent, true);
  const mail = f.mails.at(-1);
  assert.equal(mail.to, 'second@example.test');
  assert.match(mail.subject, /绑定邮箱/);
  ok(await a.call('/api/account/emails/verify', { email: 'second@example.test', code: mail.text.match(/验证码是 (\d{6})/)[1] }));
  const re = ok(await a.call('/api/auth/reauth/request', {}));
  assert.equal(re.devCode, undefined);
  assert.equal(f.mails.at(-1).to, 'prod@example.test');
  assert.match(f.mails.at(-1).subject, /身份验证/);
});

test('旧版数据库启动即迁移：补列、主邮箱进入绑定表，原会话可用但敏感操作需先验证', async t => {
  const dbPath = temporaryDB(t);
  const { DatabaseSync } = require('node:sqlite');
  const legacyDB = new DatabaseSync(dbPath);
  legacyDB.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      claimed_free INTEGER NOT NULL DEFAULT 0 CHECK(claimed_free IN (0,1)), created_at TEXT NOT NULL) STRICT;
    CREATE TABLE sessions (token_hash BLOB PRIMARY KEY, user_id TEXT REFERENCES users(id), location TEXT,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT;`);
  const token = crypto.randomBytes(32).toString('base64url');
  const at = Date.parse('2026-09-14T08:00:00Z');
  legacyDB.prepare('INSERT INTO users VALUES(?,?,?,0,?)').run('user-legacy', 'legacy@example.test', '老用户', '2026-09-01T00:00:00.000Z');
  legacyDB.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(digest(token), 'user-legacy', 'tokyo', at, at + 86400000);
  legacyDB.close();
  const first = await fixture(t, { dbPath });
  const columns = new Set(first.db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name));
  for (const name of ['verified_at', 'user_agent', 'last_seen_at']) assert.ok(columns.has(name), name);
  const legacy = first.browser(`pp_session=${token}`);
  const state = await legacy.state();
  assert.equal(state.user.id, 'user-legacy');
  assert.deepEqual(state.account.emails.map(e => [e.email, e.primary]), [['legacy@example.test', true]]);
  assert.equal(state.account.hasPassword, false);
  assert.equal(state.account.verifiedUntil, null);
  error(await legacy.call('/api/account/emails/request', { email: 'new@example.test' }), 403, 'REAUTH_REQUIRED');
  assert.equal((await first.browser().login('legacy@example.test')).id, 'user-legacy');
  await first.close();
  const second = await fixture(t, { dbPath });
  assert.equal(second.db.prepare('SELECT count(*) AS n FROM user_emails').get().n, 1);
  assert.equal((await second.browser(`pp_session=${token}`).state()).user.id, 'user-legacy');
});
