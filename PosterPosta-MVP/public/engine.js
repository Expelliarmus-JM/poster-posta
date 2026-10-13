(function (root) {
  'use strict';

  const STORAGE_KEY = 'posterposta-v1';
  const cities = Object.freeze({
    tokyo: { name: '东京', en: 'TOKYO', country: '日本', lat: 35.68, lng: 139.69 },
    shenzhen: { name: '深圳', en: 'SHENZHEN', country: '中国', lat: 22.54, lng: 114.06 },
    paris: { name: '巴黎', en: 'PARIS', country: '法国', lat: 48.86, lng: 2.35 },
    kyoto: { name: '京都', en: 'KYOTO', country: '日本', lat: 35.01, lng: 135.77 },
    london: { name: '伦敦', en: 'LONDON', country: '英国', lat: 51.51, lng: -0.13 },
    shanghai: { name: '上海', en: 'SHANGHAI', country: '中国', lat: 31.23, lng: 121.47 }
  });
  Object.values(cities).forEach(Object.freeze);

  const catalog = [
    ['tokyo-free', '把东京的晚风寄给你', '街灯亮起，晚风刚好', 'tokyo', 'card', 0, 'tokyo-street.jpg', '青禾', '初见礼'],
    ['tokyo-tower', '东京塔下', '把夜色折进一封信', 'tokyo', 'card', 16, 'tokyo-rain.jpg', '青禾', '城市珍藏'],
    ['tokyo-sakura', '樱花落在信纸上', '替你留住短暂的春天', 'tokyo', 'card', 18, 'tokyo-sakura.jpg', '小满', '季节限定'],
    ['tokyo-night', '夜行东京', '末班车经过温柔的灯海', 'tokyo', 'card', 20, 'tokyo-night.jpg', '远山', '夜色'],
    ['tokyo-temple', '庭院里的片刻', '听风穿过安静的屋檐', 'tokyo', 'card', 14, 'tokyo-temple.jpg', '小满', '慢时光'],
    ['tokyo-rain', '雨后，东京', '在湿润的街角等一束光', 'tokyo', 'card', 16, 'tokyo-tower.jpg', '远山', '雨日来信'],
    ['tokyo-cafe', '秋叶原，漫游日', '在热闹街头遇见新的故事', 'tokyo', 'card', 12, 'tokyo-cafe.jpg', '南枝', '街角散步'],
    ['paris-card', '塞纳河的清晨', '晨光轻轻掠过水面', 'paris', 'card', 24, 'paris.jpg', '林间', '河畔散步'],
    ['paris-free', '一封巴黎来信', '把午后留在这一页', 'paris', 'card', 0, 'paris.jpg', '林间', '初见礼'],
    ['kyoto-card', '京都小巷', '走慢一点，风景还在', 'kyoto', 'card', 18, 'kyoto.jpg', '小满', '巷陌'],
    ['kyoto-free', '京都的风声', '一叶青绿，一纸问候', 'kyoto', 'card', 0, 'kyoto.jpg', '小满', '初见礼'],
    ['london-card', '伦敦薄雾', '雾散之前，先说想念', 'london', 'card', 22, 'london.jpg', '远山', '城市珍藏'],
    ['london-free', '伦敦慢慢晴', '愿你的窗前也有阳光', 'london', 'card', 0, 'london.jpg', '远山', '初见礼'],
    ['shenzhen-card', '深圳向晚', '在忙碌的城里停一小会儿', 'shenzhen', 'card', 12, 'shenzhen.jpg', '南枝', '日常诗意'],
    ['shenzhen-free', '来自深圳的晴天', '寄去一片明亮的日常', 'shenzhen', 'card', 0, 'shenzhen.jpg', '南枝', '初见礼'],
    ['shanghai-card', '上海的旧时光', '沿着街角，遇见温暖的灯', 'shanghai', 'card', 16, 'shanghai.jpg', '林间', '街角故事'],
    ['shanghai-free', '上海，见字如面', '把一段散步寄给远方', 'shanghai', 'card', 0, 'shanghai.jpg', '林间', '初见礼'],
    ['tokyo-stamp', '东京街灯邮票', '给晚风盖一枚小小的印记', 'tokyo', 'stamp', 4, 'tokyo-street.jpg', '青禾', '城市邮票'],
    ['tokyo-stamp-sakura', '东京樱花邮票', '把一整个春天贴在信封上', 'tokyo', 'stamp', 6, 'tokyo-sakura.jpg', '小满', '季节邮票'],
    ['tokyo-stamp-tower', '东京塔纪念邮票', '这座城市为想念点亮的灯', 'tokyo', 'stamp', 8, 'tokyo-rain.jpg', '青禾', '珍藏邮票'],
    ['paris-stamp', '巴黎晨光邮票', '让河畔的光陪信远行', 'paris', 'stamp', 6, 'paris.jpg', '林间', '城市邮票'],
    ['kyoto-stamp', '京都青叶邮票', '一寸纸上的安静风景', 'kyoto', 'stamp', 4, 'kyoto.jpg', '小满', '城市邮票'],
    ['london-stamp', '伦敦晴窗邮票', '把云后的晴天一并寄出', 'london', 'stamp', 5, 'london.jpg', '远山', '城市邮票'],
    ['shenzhen-stamp', '深圳向阳邮票', '愿每一次启程都明亮', 'shenzhen', 'stamp', 2, 'shenzhen.jpg', '南枝', '城市邮票'],
    ['shanghai-stamp', '上海街角邮票', '把熟悉的路留在信上', 'shanghai', 'stamp', 3, 'shanghai.jpg', '林间', '城市邮票']
  ].map(([id, title, subtitle, city, type, price, image, creator, tag]) =>
    Object.freeze({ id, title, subtitle, city, type, price, img: 'assets/' + image, creator, tag }));
  const products = [];
  const assetStatuses = ['unused', 'listed', 'used', 'sent', 'received'];

  function now() { return new Date().toISOString(); }

  function workdayETA(sentAt, days) {
    const date = new Date(sentAt);
    let remaining = days;
    while (remaining > 0) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1;
    }
    return date.toISOString();
  }

  function seed() {
    const createdAt = now();
    const earlier = (days) => {
      const date = new Date(createdAt);
      date.setDate(date.getDate() - days);
      return date.toISOString();
    };
    const sampleAsset = (id, productId, status) => ({ id, productId, status, source: 'sample', createdAt });
    const sampleLetter = (data) => ({
      ...data, eta: workdayETA(data.sentAt, data.days), sample: true, demo: true
    });
    return {
      user: null,
      account: null,
      location: 'tokyo',
      claimedFree: false,
      assets: [
        sampleAsset('sample-tower', 'tokyo-tower', 'unused'),
        sampleAsset('sample-stamp-1', 'tokyo-stamp', 'unused'),
        sampleAsset('sample-stamp-2', 'tokyo-stamp', 'unused'),
        sampleAsset('sample-paris', 'paris-card', 'received'),
        sampleAsset('sample-sent-card', 'tokyo-night', 'sent'),
        sampleAsset('sample-transit-card', 'tokyo-sakura', 'sent'),
        sampleAsset('sample-used-stamp-1', 'tokyo-stamp', 'used'),
        sampleAsset('sample-used-stamp-2', 'tokyo-stamp', 'used')
      ],
      letters: [
        sampleLetter({
          id: 'sample-letter-paris', productId: 'paris-card', stampId: 'paris-stamp',
          assetId: 'sample-paris', fromName: '林间', fromEmail: 'linjian@example.test',
          toName: '我', toEmail: 'demo@example.test', fromCity: 'paris', toCity: 'tokyo',
          message: '今天沿着塞纳河走了很久。水面很亮，想把这份平静分给你。',
          days: 8, sentAt: earlier(20), status: 'received',
          messages: [{ id: 'sample-message-paris', author: '林间', text: '愿这张小卡片，为你留下一段安静的午后。', time: earlier(5) }]
        }),
        sampleLetter({
          id: 'sample-letter-delivered', productId: 'tokyo-night', stampId: 'tokyo-stamp',
          assetId: 'sample-sent-card', stampAssetId: 'sample-used-stamp-1',
          fromName: '我', fromEmail: 'demo@example.test', toName: '南枝', toEmail: 'nanzhi@example.test',
          fromCity: 'tokyo', toCity: 'shenzhen', message: '东京的街灯亮了。忙碌之余，也记得给自己留一盏温柔的灯。',
          days: 4, sentAt: earlier(12), status: 'delivered',
          messages: [{ id: 'sample-message-delivered', author: '南枝', text: '示例回信：夜色收到了，谢谢你记得。', time: earlier(3) }]
        }),
        sampleLetter({
          id: 'sample-letter-transit', productId: 'tokyo-sakura', stampId: 'tokyo-stamp',
          assetId: 'sample-transit-card', stampAssetId: 'sample-used-stamp-2',
          fromName: '我', fromEmail: 'demo@example.test', toName: '远山', toEmail: 'yuanshan@example.test',
          fromCity: 'tokyo', toCity: 'london', message: '花期很短，想念却可以走得很远。把路过的春天寄给你。',
          days: 8, sentAt: earlier(1), status: 'transit', messages: []
        })
      ],
      market: [
        { id: 'market-paris', productId: 'paris-card', price: 19, seller: '林间', sellerInitial: '林', description: '一张河畔清晨，等一个喜欢散步的人。', active: true, own: false, source: 'sample' },
        { id: 'market-kyoto', productId: 'kyoto-card', price: 15, seller: '小满', sellerInitial: '小', description: '小巷深处的绿意，想与你分享。', active: true, own: false, source: 'sample' },
        { id: 'market-london-stamp', productId: 'london-stamp', price: 3, seller: '远山', sellerInitial: '远', description: '留给下一封即将出发的信。', active: true, own: false, source: 'sample' },
        { id: 'market-shanghai', productId: 'shanghai-card', price: 13, seller: '南枝', sellerInitial: '南', description: '街角灯亮的时候，也有人在想你。', active: true, own: false, source: 'sample' }
      ],
      community: [
        { id: 'community-paris', title: '你会把清晨寄给谁', peer: '林间', productId: 'paris-card', messages: [
          { id: 'community-message-paris', author: '林间', text: '有时不必写很多字，一句平安就很好。', time: earlier(2) }
        ] },
        { id: 'community-kyoto', title: '慢下来，看一条小巷', peer: '小满', productId: 'kyoto-card', messages: [
          { id: 'community-message-kyoto', author: '小满', text: '收集散步时遇见的颜色，也收集那些普通而温暖的日子。', time: earlier(1) }
        ] }
      ],
      creations: [], transactions: [], revenue: 0
    };
  }

  function storage() {
    try { return root.localStorage || null; }
    catch (_) { throw new Error('无法访问本地存储，请允许此浏览器保存演示数据。'); }
  }

  function load() {
    const store = storage();
    let raw;
    try { raw = store ? store.getItem(STORAGE_KEY) : null; }
    catch (_) { throw new Error('无法读取本地演示数据，请检查浏览器存储权限。'); }
    if (raw === null) return seed();
    try {
      const saved = JSON.parse(raw);
      const arrays = ['assets', 'letters', 'market', 'community', 'creations', 'transactions'];
      if (!saved || !Object.hasOwn(cities, saved.location) ||
          arrays.some((key) => !Array.isArray(saved[key])) ||
          typeof saved.claimedFree !== 'boolean' || !Number.isFinite(saved.revenue)) throw new Error();
      saved.account = saved.account || (saved.user ? { ...saved.user } : null);
      if (saved.user && saved.account.email !== saved.user.email) throw new Error();
      return saved;
    } catch (_) {
      throw new Error('本地演示数据损坏，请清除此站点的 posterposta-v1 数据后重试。');
    }
  }

  let state = load();
  let changing = false;
  let sequence = 0;
  const knownIds = new Set();
  for (const list of [state.assets, state.letters, state.market, state.community, state.creations, state.transactions]) {
    for (const item of list) {
      knownIds.add(item.id);
      if (item.productId) knownIds.add(item.productId);
      for (const message of item.messages || []) knownIds.add(message.id);
    }
  }
  if (state.account) knownIds.add(state.account.id);

  function id(prefix) {
    let value;
    do { value = prefix + '-' + new Date().getTime().toString(36) + '-' + (++sequence).toString(36); }
    while (knownIds.has(value));
    knownIds.add(value);
    return value;
  }

  function syncProducts() {
    products.splice(0, products.length, ...catalog, ...state.creations.map((work) => ({
      id: work.productId, title: work.title, subtitle: work.description || '把自己的风景寄给远方',
      city: work.city, type: work.type, price: work.price, img: work.img,
      creator: state.account ? state.account.name : '我的创作', tag: '原创作品'
    })));
  }

  function save() {
    const store = storage();
    try { if (store) store.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { throw new Error('演示数据保存失败，请检查本地存储空间后重试；本次操作未完成。'); }
    return state;
  }

  // 审核会复用上架流程；只在最外层保存，失败则整笔回滚。
  function change(action) {
    if (changing) return action();
    const before = JSON.stringify(state);
    changing = true;
    try {
      const result = action();
      syncProducts();
      save();
      return result;
    } catch (error) {
      state = JSON.parse(before);
      syncProducts();
      throw error;
    } finally { changing = false; }
  }

  function login() {
    if (!state.user) throw new Error('请先完成演示注册或登录。');
    return state.user;
  }

  function cityKey(city) {
    if (typeof city !== 'string' || !Object.hasOwn(cities, city)) throw new Error('请选择有效的城市。');
    return city;
  }

  function typeKey(type) {
    if (type !== 'card' && type !== 'stamp') throw new Error('作品类型只能是明信片或邮票。');
    return type;
  }

  function text(value, label, min = 1, max = 500) {
    if (typeof value !== 'string') throw new Error(label + '须为文字。');
    const result = value.trim();
    const length = Array.from(result).length;
    if (length < min || length > max) throw new Error(label + '须为 ' + min + '–' + max + ' 个字符。');
    return result;
  }

  function nameText(value, label) {
    const result = text(value, label, 1, 50);
    if (/[\u0000-\u001f\u007f]/.test(result)) throw new Error(label + '不能包含控制字符或换行。');
    return result;
  }

  function emailText(value) {
    if (typeof value !== 'string') throw new Error('请输入有效的邮箱地址。');
    const email = value.trim().toLowerCase();
    const parts = email.split('@');
    const local = parts[0];
    const domain = parts[1];
    if (email.length > 254 || parts.length !== 2 || !local || local.length > 64 ||
        !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
        !domain || !domain.includes('.') || domain.split('.').some((part) =>
          !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) {
      throw new Error('请输入有效的邮箱地址。');
    }
    return email;
  }

  function money(value, max = Number.MAX_SAFE_INTEGER / 100) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))) {
      throw new Error('价格须为有效金额，最多保留两位小数。');
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > max ||
        !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      throw new Error(max === 999 ? '作品价格须为 0.01–999 元，最多保留两位小数。' : '上架价格须至少为 0.01 元，最多保留两位小数。');
    }
    return Math.round(amount * 100) / 100;
  }

  function product(productId) {
    const found = products.find((item) => item.id === productId);
    if (!found) throw new Error('未找到这件作品。');
    return found;
  }

  function asset(assetId) {
    const found = state.assets.find((item) => item.id === assetId);
    if (!found) throw new Error('未找到你拥有的这份资产。');
    return found;
  }

  function unused(item) {
    if (item.status === 'listed' || state.market.some((listing) => listing.active && listing.own && listing.assetId === item.id)) {
      throw new Error('已上架的资产已锁定，请先下架。');
    }
    if (item.status !== 'unused') throw new Error('只有未使用的资产可以进行此操作。');
  }

  function listing(marketId) {
    const found = state.market.find((item) => item.id === marketId);
    if (!found) throw new Error('未找到这条市场记录。');
    return found;
  }

  function newAsset(productId, source, createdAt) {
    const item = { id: id('asset'), productId, status: 'unused', source, createdAt };
    state.assets.push(item);
    return item;
  }

  function register(email, name, code) {
    const address = emailText(email);
    const displayName = nameText(name, '昵称');
    if (code !== '246810') throw new Error('验证码仅用于演示，请输入 246810；不会发送真实验证邮件。');
    const account = state.account || state.user;
    if (account && account.email !== address) throw new Error('当前浏览器已绑定其他邮箱，不能换绑已有数据；如需重新演示，请先重置。');
    return change(() => {
      state.account = { id: account ? account.id : id('user'), email: address, name: displayName, createdAt: account ? account.createdAt : now(), demo: true };
      state.user = { ...state.account };
      return state.user;
    });
  }

  function acquire(productId, marketId) {
    login();
    const item = product(productId);
    const offer = marketId === undefined || marketId === null ? null : listing(marketId);
    if (offer) {
      if (!offer.active) throw new Error('这件市场作品已成交或已下架。');
      if (offer.own) throw new Error('不能购买自己上架的作品。');
      if (offer.productId !== productId) throw new Error('市场记录与所选作品不一致。');
    } else {
      if (item.city !== state.location) throw new Error('当地商店仅能领取或购买当前城市的作品，请切换演示城市或前往市场。');
      if (state.creations.some((work) => work.productId === productId)) throw new Error('原创作品不属于当地商店，请通过演示审核后的市场记录交易。');
    }
    const price = offer ? offer.price : item.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new Error('这件作品的价格无效。');
    if (price === 0 && item.type !== 'card') throw new Error('免费名额仅适用于明信片，赠送邮票会随卡片领取。');
    if (price === 0 && state.claimedFree) throw new Error('全球免费明信片仅可领取一次，你已使用本次演示的免费名额。');
    const gift = price === 0 ? product(item.city + '-stamp') : null;
    return change(() => {
      const createdAt = now();
      const acquired = newAsset(productId, price === 0 ? 'free' : offer ? 'market' : 'shop', createdAt);
      if (price === 0) {
        state.claimedFree = true;
        newAsset(gift.id, 'gift', createdAt);
      }
      if (offer) offer.active = false;
      state.transactions.push({
        id: id('transaction'), type: price === 0 ? 'free' : 'purchase', productId, assetId: acquired.id,
        marketId: offer ? offer.id : null, amount: price === 0 ? 0 : -price,
        description: price === 0 ? '演示免费领取，附赠同城邮票一枚' : '演示购买，未产生真实扣款', createdAt, demo: true
      });
      return acquired;
    });
  }

  function deliveryEstimate(city) {
    cityKey(city);
    cityKey(state.location);
    const from = cities[state.location];
    const to = cities[city];
    const radians = (degrees) => degrees * Math.PI / 180;
    const a = Math.sin(radians(to.lat - from.lat) / 2) ** 2 +
      Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(radians(to.lng - from.lng) / 2) ** 2;
    const distance = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
    const range = distance <= 1000 ? [1, 3] : distance <= 5000 ? [3, 6] : [6, 10];
    return { min: range[0], max: range[1], distance: Math.round(distance) };
  }

  function sendLetter(input) {
    const user = login();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写完整的寄信信息。');
    const card = asset(input.assetId);
    const stamp = asset(input.stampAssetId);
    unused(card);
    unused(stamp);
    if (product(card.productId).type !== 'card') throw new Error('寄出的资产必须是明信片。');
    if (product(stamp.productId).type !== 'stamp') throw new Error('请使用一枚未使用的邮票。');
    const toName = nameText(input.toName, '收信人姓名');
    const toEmail = emailText(input.toEmail);
    if (toEmail === user.email) throw new Error('不能寄给自己的邮箱，请填写另一位收信人。');
    const toCity = cityKey(input.toCity);
    const message = text(input.message, '寄语');
    const estimate = deliveryEstimate(toCity);
    return change(() => {
      const sentAt = now();
      const days = estimate.min + Math.floor(Math.random() * (estimate.max - estimate.min + 1));
      const letter = {
        id: id('letter'), productId: card.productId, stampId: stamp.productId,
        assetId: card.id, stampAssetId: stamp.id, fromName: user.name, fromEmail: user.email,
        toName, toEmail, fromCity: state.location, toCity, message, days, sentAt,
        eta: workdayETA(sentAt, days), status: 'transit', messages: [], demo: true
      };
      card.status = 'sent';
      stamp.status = 'used';
      state.letters.push(letter);
      return letter;
    });
  }

  function letterById(letterId) {
    const letter = state.letters.find((item) => item.id === letterId);
    if (!letter) throw new Error('未找到这封信。');
    return letter;
  }

  function markDelivered(letterId) {
    login();
    const letter = letterById(letterId);
    if (letter.status === 'delivered') return letter;
    if (letter.status !== 'transit') throw new Error('只有寄送中的信件可以演示投递完成。');
    return change(() => {
      letter.status = 'delivered';
      letter.deliveredAt = now();
      letter.deliveryNote = '演示投递完成：未发送真实邮件，也未通知收信人。';
      return letter;
    });
  }

  function reply(letterId, value) {
    login();
    const letter = letterById(letterId);
    if (letter.status !== 'received' && letter.status !== 'delivered') throw new Error('信件仍在寄送中，请先点击演示投递完成，再开始聊天。');
    const content = text(value, '回复');
    return change(() => {
      const message = { id: id('message'), author: '我', text: content, time: now() };
      letter.messages.push(message);
      return message;
    });
  }

  function comment(threadId, value) {
    login();
    const thread = state.community.find((item) => item.id === threadId);
    if (!thread) throw new Error('未找到这个社区话题。');
    const content = text(value, '评论');
    return change(() => {
      const message = { id: id('message'), author: '我', text: content, time: now() };
      thread.messages.push(message);
      return message;
    });
  }

  function startThread(marketId, value) {
    login();
    const offer = listing(marketId);
    if (!offer.active) throw new Error('这件作品已不在售，可在已有话题中继续交流。');
    if (offer.own) throw new Error('不能向自己的卖品发起交易咨询。');
    const content = text(value, '咨询内容');
    return change(() => {
      let thread = state.community.find((item) => item.marketId === marketId);
      if (!thread) {
        thread = { id: id('thread'), title: '关于「' + product(offer.productId).title + '」的交易咨询', peer: offer.seller, productId: offer.productId, marketId, messages: [] };
        state.community.push(thread);
      }
      thread.messages.push({ id: id('message'), author: '我', text: content, time: now() });
      return thread;
    });
  }

  function listAsset(assetId, price, description = '') {
    const user = login();
    const item = asset(assetId);
    unused(item);
    const workProduct = product(item.productId);
    typeKey(workProduct.type);
    if (item.source === 'free' || item.source === 'gift' || workProduct.price === 0) throw new Error('0 元领取的卡片和赠送邮票不可转售。');
    const creation = state.creations.find((work) => work.productId === item.productId);
    if (creation && creation.status !== 'approved') throw new Error('原创作品须先完成演示审核，才能上架。');
    const amount = money(price);
    const details = text(description, '上架说明', 0, 500);
    return change(() => {
      const offer = {
        id: id('market'), productId: item.productId, price: amount, seller: user.name,
        sellerInitial: Array.from(user.name)[0], description: details, active: true, own: true,
        assetId: item.id, source: item.source, createdAt: now(), demo: true
      };
      item.status = 'listed';
      state.market.push(offer);
      return offer;
    });
  }

  function unlistAsset(marketId) {
    login();
    const offer = listing(marketId);
    if (!offer.own) throw new Error('只能下架自己的卖品。');
    if (!offer.active) throw new Error('这件卖品已经下架或成交。');
    const item = asset(offer.assetId);
    if (item.status !== 'listed') throw new Error('这份资产当前不在上架状态。');
    return change(() => {
      offer.active = false;
      item.status = 'unused';
      return item;
    });
  }

  function imageData(value) {
    if (typeof value !== 'string' || value.length > 2800000) throw new Error('请提供不超过 2 MB 的 PNG、JPEG 或 WebP 图片。');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new Error('图片仅支持 PNG、JPEG 或 WebP 的 base64 数据，不接受 SVG 或远程地址。');
    const payload = match[2];
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    const bytes = payload.length / 4 * 3 - padding;
    if (payload.length % 4 !== 0 || bytes < 1) throw new Error('图片 base64 数据无效。');
    if (bytes > 2 * 1024 * 1024) throw new Error('图片大小不能超过 2 MB。');
    return value;
  }

  function createWork(input) {
    login();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写完整的作品信息。');
    if (input.rights !== true) throw new Error('请确认你拥有图片版权或已获得授权，勾选版权声明后再提交。');
    const title = text(input.title, '作品标题', 2, 30);
    const city = cityKey(input.city);
    const type = typeKey(input.type);
    const price = money(input.price, 999);
    const img = imageData(input.img);
    const description = text(input.description === undefined ? '' : input.description, '作品说明', 0, 500);
    return change(() => {
      const createdAt = now();
      const creation = { id: id('creation'), productId: id('work'), title, city, type, price, img, description, status: 'pending', createdAt };
      state.creations.push(creation);
      newAsset(creation.productId, 'creation', createdAt);
      return creation;
    });
  }

  function reviewCreation(creationId) {
    login();
    const creation = state.creations.find((item) => item.id === creationId);
    if (!creation) throw new Error('未找到这件原创作品。');
    if (creation.status !== 'pending') throw new Error('这件作品已经完成演示审核，请勿重复审核。');
    const item = state.assets.find((entry) => entry.productId === creation.productId && entry.source === 'creation');
    if (!item) throw new Error('未找到这件原创作品对应的资产。');
    return change(() => {
      creation.status = 'approved';
      creation.reviewNote = '演示审核通过：仅在本地演示市场上架，不代表真实审核或成交。';
      listAsset(item.id, creation.price, creation.description);
      return creation;
    });
  }

  syncProducts();
  const PP = {
    cities, products,
    get state() { return state; },
    product, save,
    reset() { return change(() => { state = seed(); return state; }); },
    cityProducts(type = 'card') {
      typeKey(type);
      return products.filter((item) => item.city === state.location && item.type === type && !state.creations.some((work) => work.productId === item.id));
    },
    ownAssets(status) {
      if (status !== undefined && !assetStatuses.includes(status)) throw new Error('请选择有效的资产状态。');
      return state.assets.filter((item) => status === undefined || item.status === status);
    },
    setLocation(city) {
      cityKey(city);
      return change(() => { state.location = city; return city; });
    },
    register,
    logout() { return change(() => { state.user = null; return null; }); },
    acquire, sendLetter, deliveryEstimate, markDelivered, reply, comment, startThread,
    listAsset, unlistAsset, createWork, reviewCreation
  };
  if (typeof window !== 'undefined') window.PP = PP;
  if (typeof module !== 'undefined' && module.exports) module.exports = PP;
})(typeof window !== 'undefined' ? window : globalThis);
