'use strict';

const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ENGINE = path.join(__dirname, 'engine.js');
const SOURCE = readFileSync(ENGINE, 'utf8');
const KEY = 'posterposta-v1';
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=';
const clone = (value) => JSON.parse(JSON.stringify(value));

function mockStorage() {
  const data = new Map();
  return {
    writes: 0,
    failWrites: false,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) {
      if (this.failWrites) throw new Error('模拟存储空间不足');
      data.set(String(key), String(value));
      this.writes += 1;
    },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); },
    key(index) { return Array.from(data.keys())[index] || null; },
    get length() { return data.size; }
  };
}

function fresh(store = mockStorage()) {
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  delete require.cache[require.resolve(ENGINE)];
  return require(ENGINE);
}

function browser(store = mockStorage(), instant = '2026-09-11T09:15:00.000Z', random = 0) {
  let time = instant;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { assert.fail('业务时间应使用 new Date，而非 Date.now'); }
  }
  const math = Object.create(Math);
  math.random = () => random;
  const forbidden = () => assert.fail('演示引擎不应调用网络、计时器或真实定位');
  const context = {
    window: { localStorage: store }, Date: Clock, Math: math,
    fetch: forbidden, XMLHttpRequest: forbidden, setTimeout: forbidden, setInterval: forbidden,
    navigator: { geolocation: { getCurrentPosition: forbidden } }
  };
  vm.runInNewContext(SOURCE, context, { filename: ENGINE });
  return { PP: context.window.PP, advance(value) { time = value; } };
}

function login(PP = fresh()) {
  PP.register('me@example.test', '青禾', '246810');
  return PP;
}

function draft(overrides = {}) {
  return {
    assetId: 'sample-tower', stampAssetId: 'sample-stamp-1',
    toName: '小满', toEmail: 'friend@example.test', toCity: 'paris',
    message: '愿你在忙碌的日子里，也能听见风声。', ...overrides
  };
}

function work(overrides = {}) {
  return { title: '窗边的晨光', city: 'tokyo', type: 'card', price: 12.5, img: PNG, description: '把散步时遇见的光留在纸上。', rights: true, ...overrides };
}

function unchanged(PP, action, message = /[\u3400-\u9fff]/) {
  const before = JSON.stringify(PP.state);
  assert.throws(action, { name: 'Error', message });
  assert.equal(JSON.stringify(PP.state), before, '失败操作不得改变资产或其他状态');
}

function persisted(PP, store = globalThis.localStorage) {
  assert.deepEqual(JSON.parse(store.getItem(KEY)), clone(PP.state));
}

function owned(PP, productId, status = 'unused') {
  const result = PP.ownAssets(status).find((item) => item.productId === productId);
  assert.ok(result, '应当拥有指定状态的资产：' + productId);
  return result;
}

function countWeekdays(sentAt, eta) {
  const cursor = new Date(sentAt);
  const end = new Date(eta);
  let count = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) count += 1;
  }
  assert.equal(cursor.toISOString(), end.toISOString());
  return count;
}

afterEach(() => {
  delete require.cache[require.resolve(ENGINE)];
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

test('CommonJS 导出完整同步 API，state 使用 getter', () => {
  const PP = fresh();
  for (const name of ['product', 'save', 'reset', 'cityProducts', 'ownAssets', 'setLocation', 'register', 'logout', 'acquire', 'sendLetter', 'deliveryEstimate', 'markDelivered', 'reply', 'comment', 'startThread', 'listAsset', 'unlistAsset', 'createWork', 'reviewCreation']) {
    assert.equal(typeof PP[name], 'function', name);
  }
  assert.equal(typeof Object.getOwnPropertyDescriptor(PP, 'state').get, 'function');
  assert.ok(Array.isArray(PP.products));
  assert.equal(PP.product('tokyo-free').title, '把东京的晚风寄给你');
  assert.equal(PP.product('tokyo-tower').title, '东京塔下');
  unchanged(PP, () => PP.product('不存在'));
});

test('浏览器 IIFE 导出 window.PP，不使用网络、计时器或真实定位', () => {
  const store = mockStorage();
  const { PP } = browser(store);
  login(PP);
  const letter = PP.sendLetter(draft());
  assert.equal(letter.status, 'transit');
  PP.markDelivered(letter.id);
  PP.reply(letter.id, '本地演示中的一句问候。');
  persisted(PP, store);
});

test('六座城市及固定产品完整，每城至少两张卡和一枚摄影邮票', () => {
  const PP = fresh();
  assert.deepEqual(Object.keys(PP.cities).sort(), ['tokyo', 'shenzhen', 'paris', 'kyoto', 'london', 'shanghai'].sort());
  assert.deepEqual(PP.cities.tokyo, { name: '东京', en: 'TOKYO', country: '日本', lat: 35.68, lng: 139.69 });
  const expected = ['tokyo-free', 'tokyo-tower', 'tokyo-sakura', 'tokyo-night', 'tokyo-temple', 'tokyo-rain', 'paris-card', 'kyoto-card', 'london-card', 'shenzhen-free', 'paris-free', 'london-free', 'kyoto-free', 'shanghai-free'];
  expected.forEach((id) => assert.equal(PP.product(id).id, id));
  assert.equal(PP.product('tokyo-free').img, 'assets/tokyo-street.jpg');
  assert.equal(new Set(PP.products.map((item) => item.id)).size, PP.products.length);
  for (const item of PP.products) {
    for (const key of ['id', 'title', 'subtitle', 'city', 'type', 'price', 'img', 'creator', 'tag']) assert.ok(Object.hasOwn(item, key));
    assert.match(item.img, /^assets\/.+\.jpg$/);
    assert.ok(Object.hasOwn(PP.cities, item.city));
  }
  for (const city of Object.keys(PP.cities)) {
    const items = PP.products.filter((item) => item.city === city);
    assert.ok(items.filter((item) => item.type === 'card').length >= 2);
    assert.equal(items.filter((item) => item.type === 'stamp').length, city === 'tokyo' ? 3 : 1);
    const stamp = PP.product(city + '-stamp');
    assert.ok(stamp.price >= 2 && stamp.price <= 8);
    assert.ok(items.some((item) => item.type === 'card' && item.img === stamp.img));
    assert.equal(PP.product(city + '-free').price, 0);
  }
});

test('种子资产、三种信件状态、市场与社区满足约定字段', () => {
  const PP = fresh();
  assert.equal(PP.state.user, null);
  assert.equal(PP.state.location, 'tokyo');
  assert.equal(PP.state.claimedFree, false);
  assert.equal(PP.state.revenue, 0);
  for (const key of ['assets', 'letters', 'market', 'community', 'creations', 'transactions']) assert.ok(Array.isArray(PP.state[key]));
  owned(PP, 'tokyo-tower');
  assert.ok(PP.ownAssets('unused').filter((item) => item.productId === 'tokyo-stamp').length >= 2);
  owned(PP, 'paris-card', 'received');
  assert.ok(PP.state.market.length >= 4);
  assert.ok(PP.state.market.every((item) => item.active === true && item.own === false));
  for (const item of PP.state.market) {
    for (const key of ['id', 'productId', 'price', 'seller', 'sellerInitial', 'description', 'active', 'own']) assert.ok(Object.hasOwn(item, key));
  }
  for (const status of ['received', 'delivered', 'transit']) assert.ok(PP.state.letters.some((letter) => letter.status === status));
  for (const letter of PP.state.letters) {
    assert.equal(letter.sample, true);
    for (const key of ['id', 'productId', 'stampId', 'fromName', 'fromEmail', 'toName', 'toEmail', 'fromCity', 'toCity', 'message', 'days', 'sentAt', 'eta', 'status', 'messages']) assert.ok(Object.hasOwn(letter, key));
    PP.product(letter.productId);
    PP.product(letter.stampId);
    assert.ok(![0, 6].includes(new Date(letter.eta).getDay()));
  }
  assert.ok(PP.state.community.length >= 2);
  PP.state.community.forEach((thread) => {
    for (const key of ['id', 'title', 'peer', 'productId', 'messages']) assert.ok(Object.hasOwn(thread, key));
    thread.messages.forEach((message) => {
      for (const key of ['id', 'author', 'text', 'time']) assert.ok(Object.hasOwn(message, key));
    });
  });
});

test('城市过滤与资产状态查询准确，市场不受位置限制', () => {
  const PP = fresh();
  const market = clone(PP.state.market);
  for (const city of Object.keys(PP.cities)) {
    PP.setLocation(city);
    assert.ok(PP.cityProducts().length >= 2);
    assert.ok(PP.cityProducts().every((item) => item.city === city && item.type === 'card'));
    assert.equal(PP.cityProducts('stamp').length, city === 'tokyo' ? 3 : 1);
    assert.ok(PP.cityProducts('stamp').every((item) => item.city === city && item.type === 'stamp'));
    assert.deepEqual(PP.state.market, market);
  }
  assert.equal(PP.ownAssets().length, PP.state.assets.length);
  for (const status of ['unused', 'listed', 'used', 'sent', 'received']) assert.ok(PP.ownAssets(status).every((item) => item.status === status));
  unchanged(PP, () => PP.cityProducts('other'));
  unchanged(PP, () => PP.ownAssets('other'));
});

test('切换位置只修改 location，拒绝无效城市及原型属性名', () => {
  const PP = login();
  const before = clone(PP.state);
  assert.equal(PP.setLocation('shenzhen'), 'shenzhen');
  assert.deepEqual(PP.state, { ...before, location: 'shenzhen' });
  persisted(PP);
  for (const value of ['', 'unknown', '__proto__', 'constructor', null, {}]) unchanged(PP, () => PP.setLocation(value));
});

test('所有涉及个人业务的接口都要求登录', () => {
  const PP = fresh();
  const actions = [
    () => PP.acquire('tokyo-free'), () => PP.sendLetter(draft()),
    () => PP.markDelivered('sample-letter-transit'), () => PP.reply('sample-letter-paris', '你好'),
    () => PP.comment('community-paris', '你好'), () => PP.startThread('market-paris', '你好'),
    () => PP.listAsset('sample-tower', 10), () => PP.unlistAsset('market-paris'),
    () => PP.createWork(work()), () => PP.reviewCreation('none')
  ];
  actions.forEach((action) => unchanged(PP, action, /登录|注册/));
});

test('演示注册规范化邮箱昵称，不保存验证码或密码', () => {
  const PP = fresh();
  const user = PP.register('  ME@Example.Test  ', '  青禾  ', '246810');
  assert.equal(user.email, 'me@example.test');
  assert.equal(user.name, '青禾');
  assert.equal(user.demo, true);
  assert.ok(!('password' in user));
  assert.ok(!JSON.stringify(PP.state).includes('246810'));
  assert.ok(!JSON.stringify(PP.state).includes('password'));
  assert.equal(globalThis.localStorage.length, 1);
  assert.equal(globalThis.localStorage.key(0), KEY);
  persisted(PP);
});

test('注册拒绝非法邮箱、空昵称与错误演示验证码', () => {
  const PP = fresh();
  for (const email of ['', 'a', 'a@b', '@example.test', 'a@@example.test', 'a b@example.test', '.a@example.test', 'a..b@example.test', 'a@-bad.test', 'a@example..test', 'a@exam_ple.test', 123, null]) {
    unchanged(PP, () => PP.register(email, '青禾', '246810'), /邮箱/);
  }
  for (const name of ['', '  ', 'a'.repeat(51), '青\n禾', null]) unchanged(PP, () => PP.register('me@example.test', name, '246810'));
  for (const code of ['', '000000', 246810, null]) unchanged(PP, () => PP.register('me@example.test', '青禾', code), /演示.*246810/);
});

test('已登录不可换绑；退出及刷新仍保留浏览器账号绑定', () => {
  const store = mockStorage();
  let PP = login(fresh(store));
  const userId = PP.state.user.id;
  PP.acquire('tokyo-tower');
  const assets = clone(PP.state.assets);
  unchanged(PP, () => PP.register('other@example.test', '远山', '246810'), /绑定|换绑/);
  PP.register('ME@example.test', '青禾的新昵称', '246810');
  assert.equal(PP.state.user.id, userId);
  assert.deepEqual(PP.state.assets, assets);
  PP.logout();
  assert.equal(PP.state.user, null);
  persisted(PP, store);
  PP = fresh(store);
  assert.equal(PP.state.user, null);
  unchanged(PP, () => PP.register('other@example.test', '远山', '246810'), /绑定|换绑/);
  PP.register('me@example.test', '青禾', '246810');
  assert.equal(PP.state.user.id, userId);
  assert.deepEqual(PP.state.assets, assets);
});

test('save 可同步保存，刷新完整恢复业务状态', () => {
  const store = mockStorage();
  let PP = login(fresh(store));
  PP.setLocation('kyoto');
  PP.acquire('kyoto-card');
  const before = clone(PP.state);
  assert.equal(PP.save(), PP.state);
  PP = fresh(store);
  assert.deepEqual(PP.state, before);
});

test('reset 更新 state getter、清除创作与账号，但保持 products 数组引用', () => {
  const PP = login();
  const oldState = PP.state;
  const products = PP.products;
  const creation = PP.createWork(work());
  PP.acquire('tokyo-free');
  assert.ok(PP.products.some((item) => item.id === creation.productId));
  assert.equal(PP.reset(), PP.state);
  assert.notEqual(PP.state, oldState);
  assert.equal(PP.products, products);
  assert.equal(PP.state.user, null);
  assert.equal(PP.state.account, null);
  assert.equal(PP.state.claimedFree, false);
  assert.equal(PP.state.creations.length, 0);
  assert.ok(!products.some((item) => item.id === creation.productId));
  persisted(PP);
  PP.register('new@example.test', '新访客', '246810');
  assert.equal(PP.state.user.email, 'new@example.test');
});

test('当地商店严格限制卡片与邮票城市，切换后可购买', () => {
  const PP = login();
  for (const city of ['paris', 'kyoto', 'london', 'shenzhen', 'shanghai']) {
    unchanged(PP, () => PP.acquire(city + '-free'), /城市/);
    unchanged(PP, () => PP.acquire(city + '-stamp'), /城市/);
  }
  PP.setLocation('paris');
  assert.equal(PP.acquire('paris-card').productId, 'paris-card');
  assert.equal(PP.acquire('paris-stamp').productId, 'paris-stamp');
  persisted(PP);
});

test('全球免费仅一次，领取附赠同城独立邮票且记账为正零', () => {
  const PP = login();
  const before = PP.state.assets.length;
  const card = PP.acquire('tokyo-free');
  assert.equal(card.source, 'free');
  assert.equal(card.status, 'unused');
  assert.equal(PP.state.assets.length, before + 2);
  const stamp = PP.state.assets.find((item) => item.source === 'gift');
  assert.equal(stamp.productId, 'tokyo-stamp');
  assert.notEqual(stamp.id, card.id);
  assert.equal(stamp.createdAt, card.createdAt);
  assert.equal(PP.state.claimedFree, true);
  assert.equal(PP.state.transactions.at(-1).amount, 0);
  assert.ok(!Object.is(PP.state.transactions.at(-1).amount, -0));
  unchanged(PP, () => PP.acquire('tokyo-free'), /仅可领取一次/);
  PP.setLocation('shenzhen');
  unchanged(PP, () => PP.acquire('shenzhen-free'), /仅可领取一次/);
  persisted(PP);
});

test('六个城市的免费卡都赠送正确城市邮票', () => {
  for (const city of ['tokyo', 'shenzhen', 'paris', 'kyoto', 'london', 'shanghai']) {
    const PP = login();
    PP.setLocation(city);
    PP.acquire(city + '-free');
    const gifts = PP.state.assets.filter((item) => item.source === 'gift');
    assert.equal(gifts.length, 1);
    assert.equal(gifts[0].productId, city + '-stamp');
    assert.equal(PP.state.transactions.length, 1);
  }
});

test('免费名额跨退出与刷新保留，不会因重复登录再次发放', () => {
  const store = mockStorage();
  let PP = login(fresh(store));
  PP.acquire('tokyo-free');
  PP.logout();
  PP = login(fresh(store));
  PP.setLocation('london');
  unchanged(PP, () => PP.acquire('london-free'), /仅可领取一次/);
  assert.equal(PP.state.assets.filter((item) => item.source === 'gift').length, 1);
});

test('重复购买同款产生独立资产与负金额演示流水', () => {
  const PP = login();
  const purchases = ['tokyo-tower', 'tokyo-tower', 'tokyo-stamp', 'tokyo-stamp'].map((id) => PP.acquire(id));
  assert.equal(new Set(purchases.map((item) => item.id)).size, 4);
  assert.deepEqual(PP.state.transactions.map((item) => item.amount), [-16, -16, -4, -4]);
  assert.ok(PP.state.transactions.every((item) => item.demo === true && /未产生真实扣款/.test(item.description)));
  assert.equal(PP.state.revenue, 0);
  persisted(PP);
});

test('市场跨城购买使用 listing.price，成交关闭且不可重复购买', () => {
  const PP = login();
  assert.notEqual(PP.product('paris-card').price, PP.state.market.find((item) => item.id === 'market-paris').price);
  const card = PP.acquire('paris-card', 'market-paris');
  assert.equal(card.source, 'market');
  assert.equal(PP.state.location, 'tokyo');
  assert.equal(PP.state.transactions.at(-1).amount, -19);
  assert.equal(PP.state.market.find((item) => item.id === 'market-paris').active, false);
  unchanged(PP, () => PP.acquire('paris-card', 'market-paris'), /成交|下架/);
  unchanged(PP, () => PP.acquire('paris-card', 'market-kyoto'), /不一致/);
  unchanged(PP, () => PP.acquire('paris-card', '不存在'));
  persisted(PP);
});

test('市场邮票可跨城购买，价款与原产品价格分离', () => {
  const PP = login();
  PP.setLocation('shenzhen');
  const stamp = PP.acquire('london-stamp', 'market-london-stamp');
  assert.equal(stamp.productId, 'london-stamp');
  assert.equal(PP.state.transactions.at(-1).amount, -3);
  assert.equal(PP.product('london-stamp').price, 5);
});

test('市场零价按成交价消耗免费名额，不按原产品价格判断', () => {
  const PP = login();
  PP.state.market.find((item) => item.id === 'market-paris').price = 0;
  const card = PP.acquire('paris-card', 'market-paris');
  assert.equal(card.source, 'free');
  assert.equal(PP.state.claimedFree, true);
  assert.equal(PP.state.transactions.at(-1).amount, 0);
  assert.equal(PP.state.assets.find((item) => item.source === 'gift').productId, 'paris-stamp');
  unchanged(PP, () => PP.acquire('tokyo-free'), /仅可领取一次/);
});

test('存放草稿不消耗；发送成功同时消耗卡片和一枚邮票', () => {
  const PP = login();
  const input = draft();
  const before = clone(PP.state);
  const localDraft = { ...input, message: '先保存到界面草稿，尚未提交。' };
  assert.equal(localDraft.assetId, input.assetId);
  assert.deepEqual(PP.state, before);
  const letter = PP.sendLetter(input);
  assert.equal(PP.state.assets.find((item) => item.id === input.assetId).status, 'sent');
  assert.equal(PP.state.assets.find((item) => item.id === input.stampAssetId).status, 'used');
  assert.equal(PP.state.assets.find((item) => item.id === 'sample-stamp-2').status, 'unused');
  assert.equal(letter.assetId, input.assetId);
  assert.equal(letter.stampAssetId, input.stampAssetId);
  assert.equal(letter.productId, 'tokyo-tower');
  assert.equal(letter.stampId, 'tokyo-stamp');
  assert.equal(letter.fromName, PP.state.user.name);
  assert.equal(letter.fromEmail, PP.state.user.email);
  assert.equal(letter.fromCity, 'tokyo');
  assert.equal(letter.status, 'transit');
  assert.equal(letter.demo, true);
  assert.deepEqual(letter.messages, []);
  assert.equal(PP.state.letters.at(-1), letter);
  assert.deepEqual(PP.state.transactions, before.transactions);
  persisted(PP);
});

test('收件人、城市、寄语及资产校验失败时不消耗任何资产', () => {
  const PP = login();
  const overrides = [
    { assetId: 'none' }, { stampAssetId: 'none' },
    { assetId: 'sample-stamp-1' }, { stampAssetId: 'sample-tower' },
    { assetId: 'sample-paris' }, { stampAssetId: 'sample-used-stamp-1' },
    { toName: '' }, { toName: '  ' }, { toName: '小\n满' }, { toName: null },
    { toEmail: 'wrong' }, { toEmail: 'a@b' }, { toEmail: 'a@@example.test' }, { toEmail: null },
    { toCity: '' }, { toCity: undefined }, { toCity: 'invalid' }, { toCity: '__proto__' },
    { message: '' }, { message: '  ' }, { message: '字'.repeat(501) }, { message: null }
  ];
  overrides.forEach((value) => unchanged(PP, () => PP.sendLetter(draft(value))));
  for (const value of [null, undefined, []]) unchanged(PP, () => PP.sendLetter(value));
  persisted(PP);
});

test('收件邮箱大小写及首尾空格归一化，禁止自寄', () => {
  const PP = login();
  unchanged(PP, () => PP.sendLetter(draft({ toEmail: '  ME@EXAMPLE.TEST  ' })), /自己/);
  const letter = PP.sendLetter(draft({ toEmail: '  Friend@Example.Test  ', toName: ' 小满 ', message: ' 好 ' }));
  assert.equal(letter.toEmail, 'friend@example.test');
  assert.equal(letter.toName, '小满');
  assert.equal(letter.message, '好');
});

test('寄语支持一至五百字符，发送过的卡与邮票均不可复用', () => {
  const PP = login();
  const input = draft({ message: '字'.repeat(500) });
  PP.sendLetter(input);
  unchanged(PP, () => PP.sendLetter(input), /未使用/);
  unchanged(PP, () => PP.sendLetter(draft({ stampAssetId: 'sample-stamp-2' })), /未使用/);
  const secondCard = PP.acquire('tokyo-tower');
  unchanged(PP, () => PP.sendLetter(draft({ assetId: secondCard.id })), /未使用/);
  const second = PP.sendLetter(draft({ assetId: secondCard.id, stampAssetId: 'sample-stamp-2', message: '好' }));
  assert.equal(second.message, '好');
  assert.equal(PP.state.letters.filter((item) => !item.sample).length, 2);
});

test('已上架卡片不能寄出，下架后才可发送', () => {
  const PP = login();
  const offer = PP.listAsset('sample-tower', 15, '留给喜欢夜色的人。');
  unchanged(PP, () => PP.sendLetter(draft()), /上架.*锁定/);
  assert.equal(PP.state.assets.find((item) => item.id === 'sample-stamp-1').status, 'unused');
  PP.unlistAsset(offer.id);
  assert.equal(PP.sendLetter(draft()).status, 'transit');
});

test('已上架邮票也不能消耗，卡片不会因失败变成 sent', () => {
  const PP = login();
  const offer = PP.listAsset('sample-stamp-1', 2.5, '一枚东京街灯。');
  unchanged(PP, () => PP.sendLetter(draft()), /上架.*锁定/);
  assert.equal(PP.state.assets.find((item) => item.id === 'sample-tower').status, 'unused');
  PP.unlistAsset(offer.id);
  PP.sendLetter(draft());
  persisted(PP);
});

test('市场异地卡与异地邮票可以寄出，邮戳来自当前城市而非产地', () => {
  const PP = login();
  const card = PP.acquire('paris-card', 'market-paris');
  const stamp = PP.acquire('london-stamp', 'market-london-stamp');
  PP.setLocation('shenzhen');
  const letter = PP.sendLetter(draft({ assetId: card.id, stampAssetId: stamp.id, toCity: 'tokyo' }));
  assert.equal(letter.productId, 'paris-card');
  assert.equal(letter.stampId, 'london-stamp');
  assert.equal(letter.fromCity, 'shenzhen');
  assert.equal(letter.toCity, 'tokyo');
  assert.ok(letter.days >= 3 && letter.days <= 6);
  PP.setLocation('shanghai');
  assert.equal(letter.fromCity, 'shenzhen');
  assert.equal(PP.state.assets.find((item) => item.id === stamp.id).status, 'used');
});

test('Haversine 距离分档覆盖同城、近程、中程与远程', () => {
  const PP = fresh();
  assert.deepEqual(PP.deliveryEstimate('tokyo'), { min: 1, max: 3, distance: 0 });
  const kyoto = PP.deliveryEstimate('kyoto');
  assert.ok(kyoto.distance > 300 && kyoto.distance < 500);
  assert.deepEqual([kyoto.min, kyoto.max], [1, 3]);
  const shenzhen = PP.deliveryEstimate('shenzhen');
  assert.ok(shenzhen.distance > 2500 && shenzhen.distance < 3500);
  assert.deepEqual([shenzhen.min, shenzhen.max], [3, 6]);
  const paris = PP.deliveryEstimate('paris');
  assert.ok(paris.distance > 9000 && paris.distance < 11000);
  assert.deepEqual([paris.min, paris.max], [6, 10]);
  PP.setLocation('paris');
  assert.equal(PP.deliveryEstimate('tokyo').distance, paris.distance);
  unchanged(PP, () => PP.deliveryEstimate('unknown'));
});

test('随机天数包含各档最小最大值；ETA 只计算工作日且不会落周末', () => {
  for (const toCity of ['tokyo', 'kyoto', 'shenzhen', 'shanghai', 'paris', 'london']) {
    for (const random of [0, 0.999999999]) {
      const { PP } = browser(mockStorage(), '2026-09-11T09:15:00.000Z', random);
      login(PP);
      const estimate = PP.deliveryEstimate(toCity);
      const letter = PP.sendLetter(draft({ toCity }));
      assert.equal(letter.days, random === 0 ? estimate.min : estimate.max);
      assert.ok(![0, 6].includes(new Date(letter.eta).getDay()));
      assert.equal(countWeekdays(letter.sentAt, letter.eta), letter.days);
      assert.equal(new Date(letter.eta).getHours(), new Date(letter.sentAt).getHours());
      if (toCity === 'tokyo' && random === 0) assert.equal(new Date(letter.eta).getDay(), 1);
    }
  }
});

test('周末发信、跨月及跨夏令时也只排除周末', () => {
  for (const instant of ['2026-09-12T09:15:00.000Z', '2026-09-13T09:15:00.000Z', '2026-09-30T09:15:00.000Z', '2026-10-30T09:15:00.000Z']) {
    const { PP } = browser(mockStorage(), instant, 0.9999999);
    login(PP);
    const letter = PP.sendLetter(draft({ toCity: 'london' }));
    assert.equal(letter.days, 10);
    assert.equal(countWeekdays(letter.sentAt, letter.eta), 10);
    assert.ok(![0, 6].includes(new Date(letter.eta).getDay()));
  }
});

test('ETA 只保存一次，时间推进和刷新不会自动送达或重算', () => {
  const store = mockStorage();
  const session = browser(store);
  login(session.PP);
  const letter = session.PP.sendLetter(draft());
  const eta = letter.eta;
  session.advance('2027-01-11T09:15:00.000Z');
  session.PP.deliveryEstimate('london');
  session.PP.save();
  assert.equal(letter.eta, eta);
  assert.equal(letter.status, 'transit');
  const { PP } = browser(store, '2027-02-11T09:15:00.000Z', 0.9999999);
  const restored = PP.state.letters.find((item) => item.id === letter.id);
  assert.equal(restored.eta, eta);
  assert.equal(restored.days, letter.days);
  assert.equal(restored.status, 'transit');
  unchanged(PP, () => PP.reply(restored.id, '仍未演示投递'), /寄送中/);
});

test('transit 禁聊，只有显式演示送达后才能回复，重复送达不重复消耗', () => {
  const PP = login();
  const letter = PP.sendLetter(draft());
  unchanged(PP, () => PP.reply(letter.id, '你好'), /寄送中/);
  const assets = clone(PP.state.assets);
  const eta = letter.eta;
  const delivered = PP.markDelivered(letter.id);
  assert.equal(delivered, letter);
  assert.equal(letter.status, 'delivered');
  assert.match(letter.deliveryNote, /演示.*未发送真实邮件/);
  const firstDeliveredAt = letter.deliveredAt;
  PP.markDelivered(letter.id);
  assert.equal(letter.deliveredAt, firstDeliveredAt);
  assert.equal(letter.eta, eta);
  assert.deepEqual(PP.state.assets, assets);
  const message = PP.reply(letter.id, '  谢谢你的来信。  ');
  assert.equal(message.author, '我');
  assert.equal(message.text, '谢谢你的来信。');
  assert.equal(letter.messages.length, 1);
  assert.equal(letter.messages[0], message);
  persisted(PP);
});

test('received 可聊天；聊天文本限制及未知信件返回中文错误', () => {
  const PP = login();
  assert.equal(PP.reply('sample-letter-paris', '收到').author, '我');
  assert.equal(PP.reply('sample-letter-delivered', '字'.repeat(500)).text.length, 500);
  for (const value of ['', ' ', '字'.repeat(501), null]) unchanged(PP, () => PP.reply('sample-letter-paris', value));
  unchanged(PP, () => PP.reply('unknown', '你好'));
  unchanged(PP, () => PP.markDelivered('unknown'));
  unchanged(PP, () => PP.markDelivered('sample-letter-paris'));
  assert.equal(PP.state.letters.find((item) => item.id === 'sample-letter-paris').status, 'received');
});

test('社区评论持久化；交易咨询创建后按 marketId 追加同一线程', () => {
  const PP = login();
  const comment = PP.comment('community-paris', '  愿你今天也有好天气。 ');
  assert.equal(comment.author, '我');
  assert.equal(comment.text, '愿你今天也有好天气。');
  const count = PP.state.community.length;
  const thread = PP.startThread('market-paris', '你好，想了解这张卡。');
  assert.equal(PP.state.community.length, count + 1);
  assert.equal(thread.marketId, 'market-paris');
  assert.equal(thread.peer, '林间');
  assert.equal(thread.productId, 'paris-card');
  assert.equal(thread.messages.length, 1);
  assert.equal(PP.startThread('market-paris', '我很喜欢这片晨光。'), thread);
  assert.equal(thread.messages.length, 2);
  assert.equal(PP.state.community.length, count + 1);
  assert.ok(thread.messages.every((message) => message.author === '我'));
  persisted(PP);
});

test('评论与咨询拒绝非法文本、自己的卖品和已结束的市场记录', () => {
  const PP = login();
  for (const value of ['', '  ', '字'.repeat(501), null]) {
    unchanged(PP, () => PP.comment('community-paris', value));
    unchanged(PP, () => PP.startThread('market-paris', value));
  }
  unchanged(PP, () => PP.comment('unknown', '你好'));
  unchanged(PP, () => PP.startThread('unknown', '你好'));
  const offer = PP.listAsset('sample-tower', 10);
  unchanged(PP, () => PP.startThread(offer.id, '你好'), /自己/);
  const thread = PP.startThread('market-paris', '你好');
  PP.acquire('paris-card', 'market-paris');
  unchanged(PP, () => PP.startThread('market-paris', '还在吗'), /不在售/);
  PP.comment(thread.id, '在原话题中继续交流。');
});

test('卡片和邮票都可上架，锁定独立资产且不能购买自己的卖品', () => {
  const PP = login();
  for (const assetId of ['sample-tower', 'sample-stamp-1']) {
    const offer = PP.listAsset(assetId, '5.25', '  留给下一段旅程。  ');
    assert.equal(offer.own, true);
    assert.equal(offer.active, true);
    assert.equal(offer.assetId, assetId);
    assert.equal(offer.price, 5.25);
    assert.equal(offer.source, 'sample');
    assert.equal(offer.seller, '青禾');
    assert.equal(offer.sellerInitial, '青');
    assert.equal(offer.description, '留给下一段旅程。');
    assert.equal(PP.state.assets.find((item) => item.id === assetId).status, 'listed');
    unchanged(PP, () => PP.acquire(offer.productId, offer.id), /自己/);
    unchanged(PP, () => PP.listAsset(assetId, 6), /上架.*锁定/);
  }
  assert.equal(PP.state.revenue, 0);
  assert.equal(PP.state.transactions.length, 0);
  persisted(PP);
});

test('只能下架本人卖品，下架解锁原资产且不生成收入', () => {
  const PP = login();
  unchanged(PP, () => PP.unlistAsset('market-paris'), /自己/);
  const offer = PP.listAsset('sample-tower', 12);
  const result = PP.unlistAsset(offer.id);
  assert.equal(result.id, 'sample-tower');
  assert.equal(result.status, 'unused');
  assert.equal(offer.active, false);
  unchanged(PP, () => PP.unlistAsset(offer.id), /下架|成交/);
  const newOffer = PP.listAsset(result.id, 13);
  assert.notEqual(newOffer.id, offer.id);
  assert.equal(PP.state.revenue, 0);
  persisted(PP);
});

test('免费卡、赠送邮票、收到或用过的资产一律不可转售', () => {
  const PP = login();
  const free = PP.acquire('tokyo-free');
  const gift = PP.state.assets.find((item) => item.source === 'gift');
  unchanged(PP, () => PP.listAsset(free.id, 5), /不可转售/);
  unchanged(PP, () => PP.listAsset(gift.id, 5), /不可转售/);
  for (const assetId of ['sample-paris', 'sample-sent-card', 'sample-transit-card', 'sample-used-stamp-1']) {
    unchanged(PP, () => PP.listAsset(assetId, 5), /未使用/);
  }
  assert.equal(PP.sendLetter(draft({ assetId: free.id, stampAssetId: gift.id })).status, 'transit');
});

test('上架拒绝无效金额和过长说明，失败后资产仍 unused', () => {
  const PP = login();
  for (const price of [0, -1, NaN, Infinity, '', 'abc', true, null, 0.001, '1.001', '1e2']) {
    unchanged(PP, () => PP.listAsset('sample-tower', price), /价格|金额/);
  }
  unchanged(PP, () => PP.listAsset('sample-tower', 10, '字'.repeat(501)));
  unchanged(PP, () => PP.listAsset('sample-tower', 10, null));
  owned(PP, 'tokyo-tower');
});

test('创建原创需严格勾选版权声明，并验证标题、城市、类型、价格', () => {
  const PP = login();
  const invalid = [
    { rights: false }, { rights: 'true' }, { rights: 1 }, { rights: undefined },
    { title: '一' }, { title: '字'.repeat(31) }, { title: '  ' }, { title: null },
    { city: '' }, { city: 'unknown' }, { city: '__proto__' }, { type: 'other' },
    { price: 0 }, { price: 1000 }, { price: NaN }, { price: Infinity }, { price: true }, { price: '1.001' },
    { description: '字'.repeat(501) }
  ];
  const count = PP.products.length;
  invalid.forEach((value) => unchanged(PP, () => PP.createWork(work(value))));
  for (const value of [null, undefined, []]) unchanged(PP, () => PP.createWork(value));
  assert.equal(PP.products.length, count);
  assert.equal(PP.state.creations.length, 0);
});

test('图片拒绝 SVG、远程地址、错误 MIME 和非法 base64', () => {
  const PP = login();
  const invalid = [
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/svg+xml,<svg/>',
    'https://example.test/image.png', 'assets/tokyo-street.jpg',
    'data:text/html;base64,PHNjcmlwdD4=', 'data:image/gif;base64,R0lGODlh',
    'data:image/jpg;base64,YQ==', 'data:image/png;base64,',
    'data:image/png;base64,abc', 'data:image/png;base64,a===',
    'data:image/png;base64,****', 'data:image/png;base64,YQ==\n', null
  ];
  invalid.forEach((img) => unchanged(PP, () => PP.createWork(work({ img })), /图片/));
});

test('图片允许 PNG/JPEG/WebP base64，解码大小上限恰为 2 MiB', () => {
  const PP = login();
  for (const mime of ['png', 'jpeg', 'webp']) {
    const img = PNG.replace('image/png', 'image/' + mime);
    assert.equal(PP.createWork(work({ img })).img, img);
  }
  const maximum = 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024).toString('base64');
  assert.equal(PP.createWork(work({ img: maximum })).img, maximum);
  const oversized = 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
  unchanged(PP, () => PP.createWork(work({ img: oversized })), /2 MB/);
});

test('创建两种作品得到 pending 创作和独立资产，不立即进入市场或当地商店', () => {
  const PP = login();
  const marketCount = PP.state.market.length;
  const initialProducts = PP.products.length;
  for (const [type, price] of [['card', 0.01], ['stamp', 999]]) {
    const creation = PP.createWork(work({ type, price, city: 'london' }));
    for (const key of ['id', 'productId', 'title', 'city', 'type', 'price', 'img', 'description', 'status', 'createdAt']) assert.ok(Object.hasOwn(creation, key));
    assert.equal(creation.status, 'pending');
    assert.equal(PP.product(creation.productId).type, type);
    assert.equal(PP.product(creation.productId).creator, '青禾');
    assert.equal(owned(PP, creation.productId).source, 'creation');
    unchanged(PP, () => PP.listAsset(owned(PP, creation.productId).id, price), /演示审核/);
    PP.setLocation('london');
    assert.ok(!PP.cityProducts(type).some((item) => item.id === creation.productId));
    unchanged(PP, () => PP.acquire(creation.productId), /市场|审核/);
  }
  assert.equal(PP.products.length, initialProducts + 2);
  assert.equal(PP.state.market.length, marketCount);
  assert.equal(PP.state.transactions.length, 0);
  assert.equal(PP.state.revenue, 0);
  persisted(PP);
});

test('刷新后从 creations 恢复产品、图片与可审核资产', () => {
  const store = mockStorage();
  let PP = login(fresh(store));
  const creation = PP.createWork(work({ title: '写给明天的光', city: 'shanghai', type: 'stamp' }));
  const assetId = owned(PP, creation.productId).id;
  PP.logout();
  PP = fresh(store);
  assert.equal(PP.product(creation.productId).title, creation.title);
  assert.equal(PP.product(creation.productId).img, PNG);
  assert.equal(PP.product(creation.productId).creator, '青禾');
  assert.equal(owned(PP, creation.productId).id, assetId);
  unchanged(PP, () => PP.reviewCreation(creation.id), /登录|注册/);
  login(PP);
  assert.equal(PP.reviewCreation(creation.id).status, 'approved');
  persisted(PP, store);
});

test('演示审核通过后复用上架流程，仅一次持久化，不虚构成交收入', () => {
  const store = mockStorage();
  const PP = login(fresh(store));
  for (const type of ['card', 'stamp']) {
    const creation = PP.createWork(work({ type }));
    const assetId = owned(PP, creation.productId).id;
    const writes = store.writes;
    const approved = PP.reviewCreation(creation.id);
    assert.equal(store.writes, writes + 1, '审核与上架必须是同一次持久化');
    assert.equal(approved.status, 'approved');
    assert.match(approved.reviewNote, /演示.*不代表真实审核或成交/);
    const offer = PP.state.market.find((item) => item.assetId === assetId && item.active);
    assert.ok(offer);
    assert.equal(offer.own, true);
    assert.equal(offer.source, 'creation');
    assert.equal(offer.price, creation.price);
    assert.equal(owned(PP, creation.productId, 'listed').id, assetId);
    unchanged(PP, () => PP.reviewCreation(creation.id), /重复审核/);
    unchanged(PP, () => PP.acquire(creation.productId, offer.id), /自己/);
    PP.unlistAsset(offer.id);
    assert.equal(PP.listAsset(assetId, 15).active, true);
  }
  assert.equal(PP.state.revenue, 0);
  assert.equal(PP.state.transactions.length, 0);
  assert.equal(PP.withdraw, undefined);
  persisted(PP, store);
});

test('存储失败时发送整体回滚，卡片和邮票均未消耗', () => {
  const store = mockStorage();
  const PP = login(fresh(store));
  const saved = store.getItem(KEY);
  store.failWrites = true;
  unchanged(PP, () => PP.sendLetter(draft()), /保存失败/);
  assert.equal(store.getItem(KEY), saved);
  assert.equal(owned(PP, 'tokyo-tower').status, 'unused');
  assert.equal(PP.ownAssets('unused').filter((item) => item.productId === 'tokyo-stamp').length, 2);
  store.failWrites = false;
  assert.equal(PP.sendLetter(draft()).status, 'transit');
  persisted(PP, store);
});

test('存储失败时免费领取、市场购买和创作均无半成品', () => {
  const store = mockStorage();
  const PP = login(fresh(store));
  const productIds = PP.products.map((item) => item.id);
  const saved = store.getItem(KEY);
  store.failWrites = true;
  for (const action of [() => PP.acquire('tokyo-free'), () => PP.acquire('paris-card', 'market-paris'), () => PP.createWork(work())]) {
    unchanged(PP, action, /保存失败/);
    assert.equal(store.getItem(KEY), saved);
    assert.deepEqual(PP.products.map((item) => item.id), productIds);
  }
  assert.equal(PP.state.claimedFree, false);
  assert.equal(PP.state.market.find((item) => item.id === 'market-paris').active, true);
  assert.equal(PP.state.creations.length, 0);
});

test('审核保存失败时退回 pending、资产 unused，并且没有新市场记录', () => {
  const store = mockStorage();
  const PP = login(fresh(store));
  const creation = PP.createWork(work());
  const beforeMarket = PP.state.market.length;
  const saved = store.getItem(KEY);
  store.failWrites = true;
  unchanged(PP, () => PP.reviewCreation(creation.id), /保存失败/);
  assert.equal(PP.state.creations.find((item) => item.id === creation.id).status, 'pending');
  assert.equal(owned(PP, creation.productId).status, 'unused');
  assert.equal(PP.state.market.length, beforeMarket);
  assert.equal(store.getItem(KEY), saved);
  store.failWrites = false;
  assert.equal(PP.reviewCreation(creation.id).status, 'approved');
  persisted(PP, store);
});

test('审核遇到已使用原创资产时整体失败，不留下虚假的 approved', () => {
  const PP = login();
  const creation = PP.createWork(work());
  const card = owned(PP, creation.productId);
  PP.sendLetter(draft({ assetId: card.id }));
  unchanged(PP, () => PP.reviewCreation(creation.id), /未使用/);
  assert.equal(PP.state.creations.find((item) => item.id === creation.id).status, 'pending');
  persisted(PP);
});

test('存储失败时位置、登录态、上架及重置也不会部分提交', () => {
  const store = mockStorage();
  const PP = login(fresh(store));
  const creation = PP.createWork(work());
  store.failWrites = true;
  for (const action of [() => PP.setLocation('paris'), () => PP.logout(), () => PP.register('me@example.test', '新昵称', '246810'), () => PP.listAsset('sample-tower', 10), () => PP.reset()]) unchanged(PP, action, /保存失败/);
  assert.equal(PP.product(creation.productId).title, creation.title);
  persisted(PP, store);
});

test('浏览器刷新且时钟相同时，新增资产、信件、消息仍使用唯一 ID', () => {
  const store = mockStorage();
  let PP = browser(store).PP;
  login(PP);
  const card1 = PP.acquire('tokyo-tower');
  const letter1 = PP.sendLetter(draft({ assetId: card1.id }));
  PP.markDelivered(letter1.id);
  PP.reply(letter1.id, '第一封');
  PP = browser(store).PP;
  const card2 = PP.acquire('tokyo-tower');
  const letter2 = PP.sendLetter(draft({ assetId: card2.id, stampAssetId: 'sample-stamp-2' }));
  PP.markDelivered(letter2.id);
  PP.reply(letter2.id, '第二封');
  const ids = [];
  for (const list of [PP.state.assets, PP.state.letters, PP.state.market, PP.state.community, PP.state.creations, PP.state.transactions]) {
    list.forEach((item) => { ids.push(item.id); (item.messages || []).forEach((message) => ids.push(message.id)); });
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.notEqual(card1.id, card2.id);
  assert.notEqual(letter1.id, letter2.id);
  persisted(PP, store);
});

test('损坏或不可读的存储明确报中文错误，不静默覆盖旧数据', () => {
  const store = mockStorage();
  store.setItem(KEY, '{broken');
  assert.throws(() => fresh(store), /本地演示数据损坏/);
  assert.equal(store.getItem(KEY), '{broken');
  store.setItem(KEY, JSON.stringify({ location: '__proto__' }));
  assert.throws(() => fresh(store), /本地演示数据损坏/);
  const inaccessible = { getItem() { throw new Error('模拟禁止读取'); } };
  assert.throws(() => fresh(inaccessible), /无法读取本地演示数据/);
});

test('未提供 storage 的 CommonJS 环境也能作为纯内存引擎使用', () => {
  const PP = login(fresh(null));
  assert.equal(PP.acquire('tokyo-tower').status, 'unused');
  assert.equal(PP.save(), PP.state);
  assert.equal(PP.sendLetter(draft()).status, 'transit');
});
