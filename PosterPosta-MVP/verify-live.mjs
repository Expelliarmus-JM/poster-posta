// 线上验收脚本：跑通「发件人寄信 → 模拟投递 → 收件人用领取凭据签收 → 双向聊天」。
// 只对开发沙盒有效：真实投递依赖邮件服务与 webhook，这里不会发送任何邮件。
// 用法：node verify-live.mjs <origin>
const BASE = process.argv[2] || 'https://0978b3f98c95477f965d8169479227c9.app-tencent.workbuddy.host';
const SENDER = 'phone-check@example.test';
const RECEIVER = 'recipient-check@example.test';
const log = [];
const note = (label, value) => { log.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); };

async function api(pathname, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { data = raw.slice(0, 200); }
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const rawCookie = list[0] || res.headers.get('set-cookie');
  return { status: res.status, data, cookie: rawCookie ? rawCookie.split(';')[0] : null };
}
function fail(label, response) {
  throw new Error(`${label} -> ${response.status} ${JSON.stringify(response.data)}`);
}
async function login(email, name) {
  let info = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    info = await api('/api/auth/request', { method: 'POST', body: { email } });
    if (info.status === 200) break;
    if (info.status === 429) { console.log(`  验证码限流，等待 61 秒后重试（${attempt}/3）`); await new Promise(r => setTimeout(r, 61000)); continue; }
    fail(`requestCode(${email})`, info);
  }
  if (info.status !== 200) fail(`requestCode(${email})`, info);
  const verify = await api('/api/auth/verify', { method: 'POST', body: { email, name, code: info.data.result.devCode } });
  if (verify.status !== 200) fail(`verify(${email})`, verify);
  return verify.cookie;
}
async function action(cookie, name, ...args) {
  const res = await api('/api/action', { method: 'POST', cookie, body: { name, args } });
  if (res.status !== 200) fail(name, res);
  return res.data.result;
}
async function bootstrap(cookie) {
  const res = await api('/api/bootstrap', { cookie });
  if (res.status !== 200) fail('bootstrap', res);
  return res.data.bootstrap.state;
}

(async () => {
  console.log('== 1. 发件人登录并存一封新信 ==');
  const senderCookie = await login(SENDER, '手机体验');
  const senderState = await bootstrap(senderCookie);
  note('发件人资产', senderState.assets.map(a => `${a.productId}/${a.status}`));

  const card = await action(senderCookie, 'sandboxPurchase', 'tokyo-night');
  const stamp = await action(senderCookie, 'sandboxPurchase', 'tokyo-stamp-tower');
  note('沙盒购买', `${card.productId}/${card.status} + ${stamp.productId}/${stamp.status}`);

  const letter = await action(senderCookie, 'sendLetter', {
    assetId: card.id, stampAssetId: stamp.id,
    toName: '收件人', toEmail: RECEIVER, toCity: 'paris',
    message: '这段话应该只对验证了收件邮箱的人可见。'
  });
  note('寄出', `${letter.status} / ${letter.days}个工作日 / eta ${letter.eta}`);
  const token = letter.sandboxClaimToken;
  note('领取凭据已发放', Boolean(token));

  console.log('== 2. 未投递前不能签收 ==');
  const early = await api(`/api/claim?token=${encodeURIComponent(token)}`, { cookie: senderCookie });
  note('发件人读取（邮箱不匹配）', `${early.status} ${early.data.code}`);

  console.log('== 3. 匿名预览必须脱敏 ==');
  const anon = await api(`/api/claim?token=${encodeURIComponent(token)}`);
  if (anon.status !== 200) fail('匿名预览', anon);
  note('匿名可见字段', Object.keys(anon.data.result));
  note('匿名预览内容', anon.data.result);
  note('匿名是否泄露全文', JSON.stringify(anon.data).includes('收件邮箱的人可见'));

  console.log('== 4. 发件人模拟投递（开发沙盒，不发邮件）==');
  const delivered = await api('/api/markDelivered', { method: 'POST', cookie: senderCookie, body: { letterId: letter.id } });
  if (delivered.status !== 200) fail('markDelivered', delivered);
  note('模拟投递后状态', delivered.data.result.status);

  console.log('== 5. 收件人登录后签收 ==');
  const receiverCookie = await login(RECEIVER, '收件人');
  const before = await bootstrap(receiverCookie);
  note('收件人签收前资产数', before.assets.length);
  const detail = await api(`/api/claim?token=${encodeURIComponent(token)}`, { cookie: receiverCookie });
  if (detail.status !== 200) fail('收件人读取信件', detail);
  note('收件人可见全文', JSON.stringify(detail.data.result.message).slice(0, 40));
  const claimed = await api('/api/claim', { method: 'POST', cookie: receiverCookie, body: { token } });
  if (claimed.status !== 200) fail('签收', claimed);
  const after = await bootstrap(receiverCookie);
  note('签收后信件状态', claimed.data.result.status);
  note('收件人资产', after.assets.map(a => `${a.productId}/${a.status}`));
  const repeat = await api('/api/claim', { method: 'POST', cookie: receiverCookie, body: { token } });
  note('重复签收', `${repeat.status} ${repeat.data.code}`);

  console.log('== 6. 双方共享同一段对话 ==');
  await action(receiverCookie, 'reply', claimed.data.result.id, '收到了，这张明信片比想象中好看。');
  const senderView = await bootstrap(senderCookie);
  const shared = senderView.letters.find(l => l.id === letter.id);
  note('发件人看到的信件状态', shared.status);
  note('发件人看到的消息', shared.messages.map(m => `${m.author}: ${m.text}`));
  const received = after.assets.find(a => a.status === 'received');
  let blocked;
  try {
    await action(receiverCookie, 'listAsset', received.id, 5, '尝试转售刚收到的信');
    blocked = '意外允许了转售';
  } catch (error) { blocked = error.message; }
  note('签收后的卡片能否再次转售', blocked);

  console.log('\n---- 验收结果 ----');
  log.forEach(line => console.log('• ' + line));
})().catch(error => {
  console.error('验收失败：' + error.message);
  process.exitCode = 1;
});
