(() => {
'use strict';
const $ = (s, root = document) => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
 post:'<path d="M4 8h16M5 8V5h14v3M6 8v13h12V8M9 12h6M9 16h6M3 21h18"/><path d="M10 3h4"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c6 6 6 12 0 18-6-6-6-12 0-18Z"/>',
 chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 1 1 19 0Z"/><path d="M7 9h9M7 13h6"/>',
 collection:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M7 5V3h10v2M7 10h10M7 14h6"/>',
 pin:'<path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2.5"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 back:'<path d="m14 5-7 7 7 7M7 12h14"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 heart:'<path d="M20.5 4.5c-2.2-2.2-6-1.7-8.5 1.3-2.5-3-6.3-3.5-8.5-1.3S1.7 10.8 5 14l7 7 7-7c3.3-3.2 3.7-7.3 1.5-9.5Z"/>',
 stamp:'<path d="M4 3h16v3l-1 1 1 1v3l-1 1 1 1v3l-1 1 1 1v3H4v-3l1-1-1-1v-3l1-1-1-1V8l1-1-1-1V3Z"/><rect x="8" y="7" width="8" height="10" rx="1"/>',
 plane:'<path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
 check:'<path d="m5 12 4 4L20 5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 pen:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-7 5 5 3-3 4 5"/>',
 settings:'<path d="m9 3-.6 2.5L6 7 3.5 6.5 2 9l2 2v2l-2 2 1.5 2.5L6 17l2.4 1.5L9 21h6l.6-2.5L18 17l2.5.5L22 15l-2-2v-2l2-2-1.5-2.5L18 7l-2.4-1.5L15 3H9Z"/><circle cx="12" cy="12" r="3"/>',
 shield:'<path d="m12 2 8 4v6c0 6-8 10-8 10S4 18 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
 wallet:'<path d="M20 7V4H5a2 2 0 0 0 0 4h16v12H5a2 2 0 0 1-2-2V6M21 12h-5v4h5M17 14h.01"/>',
 logout:'<path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/>',
 flag:'<path d="M5 21V3c4-4 10 4 14 0v11c-4 4-10-4-14 0"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.5 7a7 7 0 0 1 11.7-2L20 8M4 16l2.8 3A7 7 0 0 0 18.5 17"/>'
};
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[n] || paths.mail}</svg>`;
const development = () => PP.config.development === true;
const city = id => PP.cities[id] || {name:'定位未确认',en:'UNKNOWN',country:'城市未知'};
const hasLocation = () => Boolean(PP.cities[PP.state.location]);
const canChat = l => l.status === 'received' || (development() && l.sandbox && l.status === 'delivered');
// 收发方身份由服务器按账号判定：账号可绑定多个邮箱、主邮箱也能更换，不能再拿邮箱字符串比较。
const isRecipient = l => Boolean(PP.state.user && l.role === 'recipient');
const isSender = l => Boolean(PP.state.user && l.role === 'sender');
const ownsEmail = email => Boolean(PP.account?.emails?.some(e => e.email === String(email || '').trim().toLowerCase()));
const fresh = () => Boolean(PP.account?.verifiedUntil && Date.parse(PP.account.verifiedUntil) > Date.now());
const dateTime = s => new Date(s).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const landingURL = new URL(location.href);
const claimToken = landingURL.searchParams.get('claim');
if(landingURL.searchParams.has('claim')){
 landingURL.searchParams.delete('claim');
 history.replaceState(null,'',landingURL.pathname+landingURL.search+landingURL.hash);
}
const fmt = n => Number(n).toLocaleString('zh-CN', {maximumFractionDigits:2});
const date = s => new Date(s).toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
const statusText = {unused:'未使用',listed:'上架中',used:'已使用',sent:'已寄出',received:'已签收',delivered:'投递状态待核验',accepted:'邮件服务已接受',sandbox_ready:'沙盒队列已到期 · 未发邮件',transit:'排队待发送',pending:'待审核',approved:'已通过'};
const badge = s => `<span class="status ${esc(s)}">${s==='delivered'&&development()?'沙盒模拟投递':statusText[s] || esc(s)}</span>`;
// 不读取旧的共享存储键；换号后只加载当前 user.id 下的本地偏好。
const storage = {
 get(k,f){if(!PP.state.user)return f;try{return JSON.parse(localStorage.getItem(`${k}:${PP.state.user.id}`)) ?? f;}catch{return f;}},
 set(k,v){if(!PP.state.user || localUserId!==PP.state.user.id)return false;try{localStorage.setItem(`${k}:${PP.state.user.id}`,JSON.stringify(v));return true;}catch{toast('浏览器存储不可用，此项未保存');return false;}}
};
let view = ['postoffice','messages','market','profile','creator'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'postoffice';
let filter='all', marketType='all', marketCity='all', marketSort='new', marketSearch='', messageTab='letters', profileType='cards', assetTab='unused';
let localUserId=PP.state.user?.id || null;
let favorites=storage.get('posterposta-favorites',[]), compose=null, creationImage='', afterLogin=null, activeModal=null, toastTimer=null, lastFocus=null;
let busy=false, claimState={loading:true}, uploadVersion=0;
// 账号体系的页面状态：登录方式、新邮箱补昵称、绑定草稿、二次验证后要续做的动作、待确认的危险操作。
let loginMode='code', loginNeedName=false, bindDraft=null, reauthMode='code', pendingReauth=null, reauthBack=null, pendingConfirm=null;
const cooldowns={};let cooldownTimer=null;
function startCooldown(key,ms=60000){cooldowns[key]=Date.now()+ms;setTimeout(tickCooldowns,0);if(!cooldownTimer)cooldownTimer=setInterval(tickCooldowns,1000);}
function tickCooldowns(){
 document.querySelectorAll('[data-cooldown]').forEach(b=>{
  if(!b.dataset.label)b.dataset.label=b.textContent;
  const left=Math.ceil(((cooldowns[b.dataset.cooldown]||0)-Date.now())/1000);
  if(left>0){b.disabled=true;b.textContent=`${left}s 后可重发`;}
  else if(b.textContent!==b.dataset.label){b.disabled=false;b.textContent=b.dataset.label;}
 });
 if(cooldownTimer&&Object.values(cooldowns).every(t=>t<=Date.now())){clearInterval(cooldownTimer);cooldownTimer=null;}
}
if(claimToken!==null)view='claim';
const main=$('#main');
function syncIdentity(){
 const id=PP.state.user?.id || null;
 if(id===localUserId)return;
 localUserId=id;compose=null;creationImage='';uploadVersion++;
 favorites=storage.get('posterposta-favorites',[]);claimState={loading:true};
}
async function withBusy(target,fn){
 if(busy)return;
 busy=true;
 const controls=[...document.querySelectorAll('form input,form textarea,form select,form button')];
 if(target instanceof HTMLButtonElement&&!controls.includes(target))controls.push(target);
 const prior=controls.map(el=>[el,el.disabled]);
 controls.forEach(el=>{el.disabled=true;});
 target?.setAttribute('aria-busy','true');target?.classList.add('button-loading');
 try{return await fn();}finally{
  prior.forEach(([el,disabled])=>{el.disabled=disabled;});
  target?.removeAttribute('aria-busy');target?.classList.remove('button-loading');busy=false;
 }
}

function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3300);}
function error(e){const el=$('#modal-root #form-error') || $('#form-error');if(el){el.textContent=e.message || String(e);el.classList.add('show');el.scrollIntoView({block:'nearest',behavior:'smooth'});}else toast(e.message || String(e));}
function empty(title,sub,action='nav',id='postoffice',label='去当地邮局逛逛'){return `<div class="empty">${icon('mail')}<h3>${title}</h3><p>${sub}</p><button class="secondary" data-action="${action}" data-id="${id}">${label} ${icon('arrow')}</button></div>`;}
function seal(id){return `<div class="postal-seal"><span>POSTERPOSTA</span><strong>${city(id).en}</strong><small>MEMORIES · DELIVERED</small></div>`;}
function stamp(p){return `<div class="stamp-mini"><img src="${esc(p.img)}" alt="${esc(p.title)}"><small>${city(p.city).en} · POSTA</small></div>`;}
function citySelect(name,value,blank=false){return `<select name="${name}" id="${name}" required>${blank?'<option value="">选择收信城市</option>':''}${Object.entries(PP.cities).map(([id,c])=>`<option value="${id}" ${id===value?'selected':''}>${c.name} · ${c.country}</option>`).join('')}</select>`;}
function heading(en,title,sub,right=''){return `<div class="page-heading"><div><div class="eyebrow">${en}</div><h1>${title}</h1><p class="subtitle">${sub}</p></div>${right}</div>`;}
function syncChrome(){
 const nav=[['postoffice','post','当地邮局'],['messages','chat','来往信件'],['market','globe','世界市集'],['profile','collection','我的收藏']];
 const html=nav.map(([id,ic,label])=>`<button class="nav-item ${view===id||(view==='creator'&&id==='profile')?'active':''}" data-action="nav" data-id="${id}" ${view===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span>${id==='messages'?`<span class="nav-count">${PP.state.letters.length}</span>`:''}</button>`).join('');
 $('#desktop-nav').innerHTML=html;$('#mobile-nav').innerHTML=html;
 $('#brand-icon').innerHTML=icon('mail');$('#sidebar-sketch').innerHTML='<svg viewBox="0 0 100 70"><rect x="12" y="14" width="67" height="43" rx="2"/><path d="m12 15 34 27 33-27M12 57l25-24M79 57 55 34M73 5l16-3-5 13M79 11 90 0M5 26l-4 2M5 36H0"/><rect x="63" y="19" width="11" height="13" stroke-dasharray="1.5 1.5"/><path d="m66 27 3-5 3 5"/></svg>';
 $('#location-pill').innerHTML=`${icon('pin')}<span>${hasLocation()?`${city(PP.state.location).name}，${city(PP.state.location).country}`:'定位未确认'}</span>${development()?'<span class="mini-demo">开发沙盒</span>'+icon('down'):''}`;
 $('.demo-indicator').innerHTML=`<span></span> ${development()?'开发沙盒 · 未发邮件':'服务说明 · 支付未开通'} <span>↗</span>`;
 if(!$('#refresh-state'))$('.topbar-actions').insertAdjacentHTML('afterbegin',`<button id="refresh-state" class="icon-button" data-action="refresh" aria-label="刷新服务器数据" title="刷新服务器数据">${icon('refresh')}</button>`);
 $('#notification-icon').innerHTML=icon('bell');
 const u=PP.state.user;$('#top-avatar').textContent=u?Array.from(u.name)[0]:'P';
 $('#user-entry').innerHTML=`<span class="avatar">${u?esc(Array.from(u.name)[0]):'P'}</span><span><strong>${u?esc(u.name):'你好，旅行者'}</strong><small>${u?'你的私人小邮局':'用邮箱开启旅程'}</small></span>`;
 $('#breadcrumb').textContent=({postoffice:'当地邮局',messages:'来往信件',market:'世界市集',profile:'我的收藏',creator:'创作中心',claim:'领取来信'})[view];
}
function render(){syncIdentity();syncChrome();main.innerHTML=({postoffice:home,messages:messages,market:market,profile:profile,creator:creator,claim:claimPage})[view]();main.style.animation='none';void main.offsetWidth;main.style.animation='';}
function navigate(id){closeModal(true);view=id;history.replaceState(null,'','#'+id);render();window.scrollTo({top:0,behavior:'smooth'});}
function cardTile(p,opts={}){
 const m=opts.market, asset=opts.asset;const action=asset?'asset-detail':'detail';const target=asset?asset.id:p.id;
 let media=p.type==='stamp'?`<div class="stamp-large"><img src="${esc(p.img)}" alt="${esc(p.title)}"><span>${city(p.city).en}<b>${fmt(p.price)}</b></span></div>`:`<img src="${esc(p.img)}" alt="${esc(p.title)}" loading="lazy"><span class="card-tag">${esc(m?city(p.city).name:p.tag)}</span><span class="card-bottom-label">${city(p.city).en} ${p.id.includes('sakura')?'IN BLOOM':'MOMENTS'}</span>`;
 let actions='';
 if(asset){
  if(asset.status==='unused')actions=`<div class="asset-actions"><button data-action="${p.type==='card'?'compose':'use-stamp'}" data-id="${asset.id}">${p.type==='card'?'写张明信片':'挑一张卡片'}</button><button class="secondary-action" data-action="list-asset" data-id="${asset.id}">转售</button></div>`;
  if(asset.status==='listed'){const offer=PP.state.market.find(m=>m.assetId===asset.id&&m.active);actions=`<div class="asset-actions"><button data-action="unlist" data-id="${offer?.id || ''}">下架，放回收藏</button></div>`;}
 }
 return `<article class="postcard ${p.type==='stamp'?'stamp-product':''}"><button class="postcard-art" data-action="${action}" data-id="${target}" ${m?`data-market="${m.id}"`:''} aria-label="查看${esc(p.title)}">${media}</button>${!asset?`<button class="like-btn ${favorites.includes(p.id)?'liked':''}" data-action="favorite" data-id="${p.id}" aria-label="${favorites.includes(p.id)?'取消喜欢':'喜欢'}${esc(p.title)}" aria-pressed="${favorites.includes(p.id)}">${icon('heart')}</button>`:''}<div class="card-info"><div><h3>${esc(p.title)}</h3><p class="card-meta">${icon('pin')}${city(p.city).name}<span>·</span>${esc(p.creator)}</p></div>${asset?badge(asset.status):`<span class="card-price ${!m&&!p.price?'free':''}">${!m&&!p.price?'免费':`<span class="price-unit">¥</span>${fmt(m?m.price:p.price)}`}</span>`}</div>${m?`<div class="seller-line"><span class="avatar ${m.seller==='小满'?'peach':''}">${esc(m.sellerInitial)}</span>${esc(m.seller)}<button class="text-link" data-action="${m.own?'unlist':'consult'}" data-id="${m.id}">${m.own?'下架作品':'聊一聊'} ↗</button></div>`:''}${actions}</article>`;
}
function home(){
 const c=city(PP.state.location),free=PP.cityProducts().find(p=>p.price===0),all=PP.cityProducts().filter(p=>p.price>0);
 if(!hasLocation() || !free)return heading('YOUR LOCAL POST OFFICE',hasLocation()?'当地作品暂未开放。':'定位未确认，先看看世界。','当地领取与购买暂停；世界市集仍可浏览。')+`<section class="location-empty"><div class="success-icon">${icon('pin')}</div><h2>${hasLocation()?'这座邮局还在准备风景':'还不能确认你所在的城市'}</h2><p>不会用默认城市代替实际定位。${development()?'开发沙盒可手动选择测试城市。':'位置由服务器识别；当前无法匹配已开放城市。'}<br>已有收藏仍保留在服务器，寄信需先确认寄出城市。</p><div class="modal-actions">${development()?'<button class="secondary" data-action="location">选择沙盒城市</button>':'<button class="secondary" data-action="refresh">重新确认位置</button>'}<button class="primary" data-action="nav" data-id="market">浏览世界市集 ${icon('arrow')}</button></div></section>`;
 let cards=filter==='stamps'?PP.cityProducts('stamp'):filter==='favorites'?PP.cityProducts().filter(p=>favorites.includes(p.id)):filter==='nature'?all.filter(p=>/sakura|temple/.test(p.id)):filter==='night'?all.filter(p=>/tower|night|rain/.test(p.id)):all;
 const dateNow=new Date();const dateEN=dateNow.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase();
 const claimed=PP.state.claimedFree;
 return heading('YOUR LOCAL POST OFFICE',`把${c.name}，寄给某个人。`,'只有亲自路过的风景，才有属于你的故事。',`<div class="date-note">${dateEN}<span>A GOOD DAY TO SEND A LITTLE LOVE</span></div>`)+
 `<section class="hero"><div class="hero-copy"><div class="hero-topline"><span class="dot"></span>${claimed?'把旅途留在一张卡片里':'旅行的第一张，送给你'}</div><h2>${PP.state.location==='tokyo'?'把东京的晚风，<br>寄给你。':`来自${c.name}的此刻，<br>见字如面。`}</h2><p class="hero-desc">${PP.state.location==='tokyo'?'走过街角的便利店，听见远处的电车。<br>这一刻，我想起了你。':'在陌生的街角停一停，把眼前的风景，<br>交给一封慢慢抵达的信。'}</p><button class="primary" data-action="${claimed?'my-free':'claim'}" data-id="${free.id}">${claimed?'去写一张明信片':'免费领取，写下此刻'} ${icon('arrow')}</button><p class="hero-smallprint">${claimed?'免费礼已领取 · 收藏里的风景正等你提笔':'每个账号首张免费 · 附赠一枚当地邮票 · 无需付费'}</p></div><button class="hero-photo" data-action="detail" data-id="${free.id}" aria-label="查看${c.name}免费明信片"><img src="${free.img}" alt="${c.name}的城市风景"><span class="hero-photo-badge">${c.name}限定 · FIRST POSTCARD</span>${seal(PP.state.location)}<span class="hero-photo-title"><strong>${c.en}</strong><small>A LITTLE PIECE OF NOW</small></span></button><div class="hero-perforation"></div></section>
 <section class="how-strip" aria-label="使用方式"><div class="how-item"><span class="how-icon">${icon('pin')}</span><div><strong>一座城市，一份记忆</strong><p>只在你所在的城市，发现当地明信片</p></div></div><div class="how-item"><span class="how-icon">${icon('pen')}</span><div><strong>一张卡片，一点想念</strong><p>选枚邮票，写给那个想起的人</p></div></div><div class="how-item"><span class="how-icon">${icon('clock')}</span><div><strong>慢慢抵达，刚刚好</strong><p>按距离安排发送，不保证邮件到达时间</p></div></div></section>
 <div class="notice">${icon('info')}<span>目录图片为展示素材，商用授权尚待核验，不代表已获授权的可售图库。${development()?'当前为开发沙盒，购买仅生成测试记录、不扣款。':'真实支付未开通，付费购买已禁用。'}</span></div>
 <div class="section-heading"><div class="section-title"><h2>${c.name}的小小切片</h2><small>COLLECT A MOMENT</small></div><button class="text-link" data-action="location">${icon('pin')} 来自你的当前城市</button></div>
 <div class="filter-row">${[['all','全部风景'],['nature','自然与季节'],['night','城市夜色'],['stamps','当地邮票']].map(([id,label])=>`<button class="chip ${filter===id?'active':''}" data-action="filter" data-id="${id}">${label}</button>`).join('')}<span class="filter-hint">${icon('lock')} 仅限${c.name}领取与购买</span></div>
 <div class="postcard-grid">${cards.length?cards.map(p=>cardTile(p)).join(''):empty('这一页，等待新的风景','这个分类暂时没有作品，换个分类逛逛吧。','filter','all','查看全部风景')}</div>
 <section class="collection-banner">${stamp(PP.product(PP.state.location+'-stamp'))}<div><h3>小小邮票，也装得下大大的世界。</h3><p>收集城市的独特印记，为下一封信挑一枚邮票。</p></div><button class="text-link" data-action="filter" data-id="stamps">去集邮 <span>↗</span></button></section>`;
}
function market(){
 let offers=PP.state.market.filter(m=>m.active).filter(m=>{const p=PP.product(m.productId);return (marketType==='all'||p.type===marketType)&&(marketCity==='all'||p.city===marketCity)&&(!marketSearch||[p.title,p.creator,m.seller,city(p.city).name].some(t=>t.toLowerCase().includes(marketSearch.toLowerCase())));});
 if(marketSort==='low')offers.sort((a,b)=>a.price-b.price);if(marketSort==='high')offers.sort((a,b)=>b.price-a.price);if(marketSort==='new')offers.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 return heading('THE WORLD, IN LITTLE PIECES','世界很大，风景可以交换。','这里不设距离。收藏一份别人路过的美好，也分享你的。',`<button class="primary" data-action="create">${icon('plus')} 发布创作</button>`)+
 `<div class="market-banner"><div><div class="eyebrow">A PASSPORT TO SOMEWHERE ELSE</div><h2>没有去过，也可以珍藏。</h2><p>全球明信片与邮票自由流转。产地被保留，新的故事由你续写。</p></div>${icon('globe')}</div>
 <div class="market-bar"><div class="filter-row">${[['all','全部作品'],['card','明信片'],['stamp','邮票']].map(([id,label])=>`<button class="chip ${marketType===id?'active':''}" data-action="market-type" data-id="${id}">${label}</button>`).join('')}</div><label class="searchbox">${icon('search')}<input id="market-search" aria-label="搜索市集" placeholder="寻找城市、风景或创作者" value="${esc(marketSearch)}"></label><select class="select-small" id="market-city" aria-label="筛选产地"><option value="all">所有城市</option>${Object.entries(PP.cities).map(([id,c])=>`<option value="${id}" ${marketCity===id?'selected':''}>${c.name}</option>`).join('')}</select><select class="select-small" id="market-sort" aria-label="排序"><option value="new" ${marketSort==='new'?'selected':''}>最近上架</option><option value="low" ${marketSort==='low'?'selected':''}>价格从低到高</option><option value="high" ${marketSort==='high'?'selected':''}>价格从高到低</option></select></div>
 <div class="postcard-grid">${offers.length?offers.map(m=>cardTile(PP.product(m.productId),{market:m})).join(''):empty('还没有遇见这一份风景','换个关键词，或者发布你自己的第一件作品。','clear-market','','重新看看')}</div>
 <div class="notice">${icon('shield')}<span>市集仅展示服务器中的有效上架记录，不放置假商品。上架锁定对应资产，版权不转移；咨询保存在服务器，双方刷新可见。${development()?'当前购买仅为开发沙盒测试，不会扣款。':'真实支付未开通，付费购买已禁用。'}素材授权与生产审核流程仍待完善。</span></div>`;
}
function messages(){
 const letters=PP.state.letters.slice().reverse(),threads=PP.state.community.slice().reverse();
 return heading('LETTERS & LITTLE CONVERSATIONS','让想念，有来有往。','一张明信片是故事的开始，而不是结束。',`<button class="secondary" data-action="choose-card">${icon('pen')} 写一张</button>`)+
 `<div class="tabs"><button class="tab ${messageTab==='letters'?'active':''}" data-action="message-tab" data-id="letters">明信片来往<span class="tab-count">${letters.length}</span></button><button class="tab ${messageTab==='community'?'active':''}" data-action="message-tab" data-id="community">市集交流<span class="tab-count">${threads.length}</span></button></div><p class="inbox-subtitle">${messageTab==='letters'?'收信人验证邮箱并签收后才能聊天；邮件服务接受发送不等于送达。':'与卖家聊过的作品、在市集留下的话，都收在这里。'} ${!PP.state.user?'登录后查看你参与的信件与交流。':''}</p>
 <div class="message-layout"><div class="message-list">${messageTab==='letters'?(letters.length?letters.map(l=>{const p=PP.product(l.productId);return `<button class="message-row" data-action="letter" data-id="${l.id}"><img class="message-thumb" src="${p.img}" alt="${esc(p.title)}"><div class="message-body"><div class="message-top"><strong>${isRecipient(l)?esc(l.fromName)+' → 我':'我 → '+esc(l.toName)}</strong>${badge(l.status)}</div><p>${esc(l.messages.length?l.messages[l.messages.length-1].text:l.message)}</p><small>${l.status==='transit'?`预计 ${date(l.eta)} 进入发送处理 · 聊天待开启`:`${date(l.sentAt)} · 数字明信片`}</small></div></button>`;}).join(''):empty('邮筒里，还很安静','寄出第一张明信片，等一段故事开始。')):threads.map(t=>`<button class="message-row" data-action="thread" data-id="${t.id}"><img class="message-thumb" src="${PP.product(t.productId).img}" alt="${esc(PP.product(t.productId).title)}"><div class="message-body"><div class="message-top"><strong>${esc(t.peer)}</strong><span class="status">${t.marketId?'交易咨询':'社区交流'}</span></div><p>${esc(t.messages.at(-1)?.text || t.title)}</p><small>${esc(t.title)}</small></div></button>`).join('')}</div><aside class="message-aside">${seal(PP.state.location)}<h3>有些话，<br>慢一点也没关系。</h3><p>按城市距离安排 1–10 个工作日后处理。<br>${development()?'开发队列到期也不会发送邮件。':'邮件服务接受发送，不代表真实送达。'}<br>签收后，这段对话才正式开始。</p><button class="primary" data-action="choose-card">寄出一个新的故事 ${icon('arrow')}</button></aside></div>`;
}
function profile(){
 const u=PP.state.user,assets=PP.ownAssets();
 const visible=profileType==='favorites'?favorites.map(id=>PP.products.find(p=>p.id===id)).filter(Boolean):assets.filter(a=>PP.product(a.productId).type===(profileType==='stamps'?'stamp':'card')&&(profileType==='stamps'?a.status==='unused':a.status===assetTab));
 return `<div class="eyebrow">YOUR PERSONAL POST OFFICE</div><div class="profile-header"><div class="profile-avatar">${u?esc(Array.from(u.name)[0]):'P'}</div><div><h1>${u?esc(u.name):'你好，旅行者。'}</h1><p>${u?esc(u.email):'用一个邮箱，收藏你的整个世界。'}</p>${!u?'<button class="text-link" data-action="login">注册 / 登录 ↗</button>':'<button class="text-link" data-action="account-center">账号与安全 ↗</button>'}</div><button class="icon-button" data-action="settings" aria-label="设置">${icon('settings')}</button></div>
 <div class="profile-stats"><div class="profile-stat"><strong>${assets.filter(a=>PP.product(a.productId).type==='card'&&['unused','received','listed'].includes(a.status)).length}</strong><span>珍藏的明信片</span></div><div class="profile-stat"><strong>${assets.filter(a=>PP.product(a.productId).type==='stamp'&&a.status==='unused').length}</strong><span>未使用邮票</span></div><div class="profile-stat"><strong>${PP.state.letters.filter(isSender).length}</strong><span>寄出的心意</span></div><div class="profile-stat"><strong>${new Set(assets.filter(a=>['unused','received','listed'].includes(a.status)).map(a=>PP.product(a.productId).city)).size}</strong><span>收集的城市</span></div></div>
 <div class="tabs">${[['cards','明信片'],['stamps','邮票册'],['favorites','我喜欢的']].map(([id,label])=>`<button class="tab ${profileType===id?'active':''}" data-action="profile-type" data-id="${id}">${label}${id==='favorites'?`<span class="tab-count">${favorites.length}</span>`:''}</button>`).join('')}</div>
 <div class="profile-controls">${profileType==='cards'?`<div class="filter-row">${[['unused','未使用'],['received','已签收'],['listed','上架中'],['sent','已寄出']].map(([id,label])=>`<button class="chip ${assetTab===id?'active':''}" data-action="asset-tab" data-id="${id}">${label}</button>`).join('')}</div>`:`<p class="inbox-subtitle" style="margin:0">${profileType==='stamps'?'邮票册只展示未使用邮票；已贴用的邮票保存在寄信记录里。':'喜欢不代表拥有，点开作品即可查看获取方式。'}</p>`}<button class="tip-button" data-action="rules">${icon('info')} 数字资产规则</button></div>
 <div class="postcard-grid">${visible.length?visible.map(item=>profileType==='favorites'?cardTile(item):cardTile(PP.product(item.productId),{asset:item})).join(''):empty('这一格，留给下一段旅程','去邮局发现风景，或去市集交换一份新的记忆。')}</div>
 <section class="creator-entry">${icon('pen')}<div><h3>每个人，都可以是一座城市的作者。</h3><p>把你的画、照片和灵感，变成有人珍藏的作品。</p></div><button class="text-link" data-action="nav" data-id="creator">创作中心 ↗</button></section>
 <button class="tip-button" data-action="transactions">${icon('wallet')} 查看${development()?'沙盒订单与记录':'领取与订单记录'}</button><p class="layout-note">${u?'收藏、信件与作品真实保存在服务器数据库。喜欢和草稿仅保存在当前账号的浏览器空间。':'登录后加载你的真实收藏；不会自动放入示例资产。'}</p>`;
}
function creator(){
 return `<button class="back-button" data-action="nav" data-id="profile">${icon('back')} 返回我的收藏</button>`+heading('THE CREATOR STUDIO','让你的风景，被世界珍藏。','从一张照片、一幅画开始，做一个为城市写信的人。',`<button class="primary" data-action="create">${icon('plus')} 新建作品</button>`)+
 `<div class="creator-stats"><div class="stat-card"><span>累计创作</span><strong>${PP.state.creations.length}</strong><small>每件作品，独立的使用权</small></div><div class="stat-card"><span>在售作品</span><strong>${PP.state.market.filter(m=>m.own&&m.active).length}</strong><small>上架即锁定对应资产</small></div><div class="stat-card"><span>可结算收入</span><strong>¥${fmt(PP.state.revenue)}</strong><small>暂无真实交易与结算</small></div></div>
 <div class="section-heading"><div class="section-title"><h2>我的创作</h2><small>MADE BY YOU</small></div><button class="text-link" data-action="creator-rules">创作与收益说明 ↗</button></div>
 ${PP.state.creations.length?PP.state.creations.slice().reverse().map(w=>{const a=PP.ownAssets().find(a=>a.productId===w.productId);const offer=PP.state.market.find(m=>m.assetId===a?.id&&m.active);return `<article class="creator-work"><img src="${esc(w.img)}" alt="${esc(w.title)}"><div><h3>${esc(w.title)}</h3><p>${city(w.city).name} · ${w.type==='card'?'明信片':'邮票'} · ¥${fmt(w.price)} · ${date(w.createdAt)}</p></div><div class="creation-actions">${badge(w.status==='pending'?'pending':a?.status==='listed'?'listed':'approved')}${w.status==='pending'?(development()?`<button class="secondary" data-action="review" data-id="${w.id}">沙盒模拟审核</button>`:'<small>生产审核流程未开通</small>'):a?`<button class="secondary" data-action="${offer?'unlist':'asset-detail'}" data-id="${offer?offer.id:a.id}">${offer?'下架':'查看作品'}</button>`:'<small>资产已转出</small>'}</div></article>`;}).join(''):empty('第一件作品，会是什么样子？','上传你拥有版权的图片，选择所属城市，再为它起个名字。','create','','开始创作')}
 <div class="notice">${icon('shield')}<span>你保留作品版权。当前每次创作生成 1 份可寄送、可转售的数字使用权；不是 NFT，也不承诺保值。上架后不可同时寄出。真实支付与结算未接入，成交测试也不产生真实收入。</span></div>`;
}

function modal(title,html,wide=false,kind='generic',id=null){
 lastFocus=document.activeElement;activeModal={kind,id};document.body.style.overflow='hidden';
 $('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div><div class="eyebrow">POSTERPOSTA</div><h2 id="modal-title">${title}</h2></div><button class="icon-button" data-action="close" aria-label="关闭弹窗">${icon('close')}</button></header><div class="modal-body">${html}</div></section></div>`;
 tickCooldowns();
 setTimeout(()=>{const target=$('.modal input:not([type="checkbox"]):not([type="file"]):not(:disabled)') || $('.modal .icon-button');target?.focus({preventScroll:true});},60);
}
function closeModal(force=false){
 if(activeModal?.kind==='compose'&&!force){captureCompose();if(compose&&storage.set('posterposta-draft',compose))toast('草稿已保存到当前账号的浏览器空间');}
 if(activeModal?.kind==='create'){creationImage='';uploadVersion++;}
 $('#modal-root').innerHTML='';document.body.style.overflow='';activeModal=null;afterLogin=null;pendingReauth=null;reauthBack=null;pendingConfirm=null;lastFocus?.focus?.({preventScroll:true});
}
async function requireLogin(fn){if(PP.state.user)return await fn();afterLogin=fn;loginModal();}
function loginModal(prefill={}){
 if(view==='claim'&&!afterLogin)afterLogin=loadClaim;
 const email=prefill.email??'';
 const tabs=`<div class="tabs auth-tabs" role="tablist">${[['code','邮箱验证码'],['password','密码登录']].map(([id,label])=>`<button type="button" class="tab ${loginMode===id?'active':''}" role="tab" aria-selected="${loginMode===id}" data-action="login-mode" data-id="${id}">${label}</button>`).join('')}</div>`;
 const note=prefill.note||(development()?'服务器生成随机验证码，开发环境不发送邮件；这不能证明真实邮箱所有权。':'验证码将发送到填写的邮箱，请查收后输入；不要转发验证码。');
 const codeForm=`<form id="login-form"><label class="field"><span class="field-label">邮箱地址</span><input name="email" type="email" autocomplete="email" value="${esc(email)}" placeholder="you@example.com" required></label>
 <label class="field"><span class="field-label">邮箱验证码${development()?'<small>开发沙盒</small>':''}</span><div class="code-row"><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6 位验证码" value="${esc(prefill.code||'')}" required><button type="button" class="secondary" data-action="show-code" data-cooldown="login">获取验证码</button></div></label>
 <p id="otp-note" class="field-hint" role="status">${esc(note)}</p>
 ${loginNeedName?`<div class="notice warm">${icon('spark')}<span>这是一个新邮箱，还没有 PosterPosta 账号。起个昵称，就用刚才的验证码完成注册。</span></div><label class="field"><span class="field-label">你的昵称 <small>注册后可在「账号与安全」修改</small></span><input name="name" autocomplete="nickname" maxlength="50" placeholder="怎么称呼你" required></label>`:''}
 <label class="check-row"><input type="checkbox" name="consent" ${prefill.consent?'checked':''} required><span>我已了解邮箱用于账号与投递，账号、作品和消息会保存到服务器数据库。${development()?'当前为开发沙盒，不发送邮件、不收付款；请使用测试资料。':''}</span></label>
 <div id="form-error" class="inline-error" role="alert"></div><button class="primary full-width" type="submit">${loginNeedName?'完成注册':'验证并登录'} ${icon('arrow')}</button><p class="auth-note">新邮箱验证后自动注册，已有邮箱直接登录原账号 · 验证码 10 分钟内有效<br>登录后可在「账号与安全」设置密码、绑定更多邮箱、管理登录设备。</p></form>`;
 const passwordForm=`<form id="password-login-form"><label class="field"><span class="field-label">邮箱地址 <small>任一已绑定的邮箱都可以</small></span><input name="email" type="email" autocomplete="username" value="${esc(email)}" placeholder="you@example.com" required></label>
 <label class="field"><span class="field-label">密码</span><input name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="账号密码" required></label>
 <button type="button" class="text-link" data-action="login-mode" data-id="code">忘记密码或没设置过？用邮箱验证码登录 ↗</button>
 <div id="form-error" class="inline-error" role="alert"></div><button class="primary full-width" type="submit">登录 ${icon('arrow')}</button><p class="auth-note">密码是可选的：只有在「账号与安全」里设置过密码的账号才能用密码登录。<br>连续输错 5 次会锁定 15 分钟，期间仍可用邮箱验证码登录。</p></form>`;
 modal(loginMode==='code'?'用邮箱，开启你的旅程':'欢迎回来，旅行者。',`<div class="signin-art">${icon('mail')}<div><h3>A letter starts here.</h3><p>${loginMode==='code'?'新邮箱自动注册，已有邮箱登录原账号。':'用设置过的密码直接登录。'}</p></div></div>${tabs}${loginMode==='code'?codeForm:passwordForm}`,false,'login');
 const focus=loginNeedName?'#login-form input[name="name"]':loginMode==='password'&&email?'#password-login-form input[name="password"]':null;
 if(focus)setTimeout(()=>$(focus)?.focus({preventScroll:true}),90);
}
async function finishLogin(){
 const next=afterLogin;afterLogin=null;loginNeedName=false;closeModal(true);syncIdentity();render();
 toast('已登录，正在加载你的服务器记录');
 if(next)await next();
}
// ---- 账号与安全 ----
// 敏感操作（绑定/解绑邮箱、换主邮箱、改密码、下线设备）需要近期验证过身份：
// 先看服务器给的 verifiedUntil，过期就弹二次验证；服务器仍返回 REAUTH_REQUIRED 时同样兜底。
async function withFresh(fn,back=accountModal){
 const ask=()=>{pendingReauth=fn;reauthBack=back;reauthModal();};
 if(!fresh())return ask();
 try{return await fn();}catch(e){if(e.code==='REAUTH_REQUIRED')return ask();throw e;}
}
function refreshAccount(){render();accountModal();}
function accountModal(){
 const a=PP.account;if(!a)return loginModal();
 const full=a.emails.length>=a.maxEmails;
 const emails=a.emails.map(e=>`<li class="account-item"><div><strong>${esc(e.email)}</strong><small>${e.primary?'<span class="status">主邮箱</span>':''}验证于 ${date(e.verifiedAt)}</small></div><div class="item-actions">${e.primary?'<small>安全验证码发到这里</small>':`<button class="text-link" data-action="email-primary" data-id="${esc(e.email)}">设为主邮箱</button><button class="text-link danger-link" data-action="email-remove" data-id="${esc(e.email)}">解绑</button>`}</div></li>`).join('');
 const bind=full?`<div class="notice">${icon('info')}<span>已绑定 ${a.maxEmails} 个邮箱，达到上限。解绑一个后才能绑定新的。</span></div>`
  :!bindDraft?.sent?`<form id="bind-form"><label class="field"><span class="field-label">绑定新邮箱 <small>绑定后可用它登录、签收寄给它的信</small></span><div class="code-row"><input name="email" type="email" autocomplete="email" placeholder="another@example.com" value="${esc(bindDraft?.email||'')}" required><button type="submit" class="secondary">发送验证码</button></div></label></form>`
  :`<form id="bind-form" data-stage="verify"><label class="field"><span class="field-label">验证码已发送到 ${esc(bindDraft.email)}</span><div class="code-row"><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6 位验证码" value="${esc(bindDraft.code||'')}" required><button type="button" class="secondary" data-action="bind-resend" data-cooldown="bind:${esc(bindDraft.email)}">重新发送</button></div></label><p class="field-hint" role="status">${esc(bindDraft.note)}</p><div class="modal-actions compact"><button type="button" class="secondary" data-action="bind-cancel">换一个邮箱</button><button type="submit" class="primary">确认绑定 ${icon('check')}</button></div></form>`;
 const security=fresh()?`<span class="status">已验证身份 · ${dateTime(a.verifiedUntil)} 前无需重复</span>`:`<button class="text-link" data-action="reauth-now">敏感操作前需验证身份 · 现在验证 ↗</button>`;
 modal('账号与安全',`<div id="form-error" class="inline-error" role="alert"></div>
 <section class="account-section"><div class="account-head"><span class="avatar">${esc(Array.from(a.name)[0])}</span><div><h3>${esc(a.name)}</h3><p>注册于 ${date(a.createdAt)}</p></div><div class="account-security">${security}</div></div>
 <form id="profile-form"><label class="field"><span class="field-label">昵称 <small>寄信署名与市集展示用，1–50 字</small></span><div class="code-row"><input name="name" maxlength="50" autocomplete="nickname" value="${esc(a.name)}" required><button type="submit" class="secondary">保存</button></div></label></form></section>
 <section class="account-section"><div class="section-row"><h3>登录邮箱</h3><span class="tab-count">${a.emails.length} / ${a.maxEmails}</span></div><p class="field-hint">任一已绑定邮箱都能登录这个账号，也能签收寄给它的信。一个邮箱只能属于一个账号。</p><ul class="account-list">${emails}</ul>${bind}</section>
 <section class="account-section"><div class="section-row"><h3>登录密码</h3><span class="status ${a.hasPassword?'':'pending'}">${a.hasPassword?'已设置':'未设置'}</span></div><p class="field-hint">${a.hasPassword?`上次修改：${dateTime(a.passwordChangedAt)}。邮箱验证码登录依然可用。`:'目前只能用邮箱验证码登录。设置密码后，也可以用「邮箱 + 密码」直接登录。'}</p><div class="modal-actions compact"><button class="secondary" data-action="password-set">${a.hasPassword?'修改密码':'设置密码'}</button>${a.hasPassword?'<button class="secondary" data-action="password-remove">移除密码</button>':''}</div></section>
 <section class="account-section"><div class="section-row"><h3>登录设备</h3></div><p class="field-hint">查看哪些浏览器正登录着这个账号；不认识的设备可以单独下线。</p><div class="modal-actions compact"><button class="secondary" data-action="sessions">管理登录设备 ${icon('chevron')}</button></div></section>
 <div class="modal-actions"><button class="secondary" data-action="settings">返回设置</button><button class="secondary" data-action="logout">${icon('logout')} 退出当前设备</button></div>`,false,'account');
}
function reauthModal(){
 const a=PP.account;if(!a)return loginModal();
 if(!a.hasPassword)reauthMode='code';
 const tabs=a.hasPassword?`<div class="tabs auth-tabs" role="tablist">${[['code','邮箱验证码'],['password','账号密码']].map(([id,label])=>`<button type="button" class="tab ${reauthMode===id?'active':''}" role="tab" aria-selected="${reauthMode===id}" data-action="reauth-mode" data-id="${id}">${label}</button>`).join('')}</div>`:'';
 const body=reauthMode==='code'
  ?`<label class="field"><span class="field-label">验证码发送到主邮箱 <small>${esc(a.email)}</small></span><div class="code-row"><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6 位验证码" required><button type="button" class="secondary" data-action="reauth-code" data-cooldown="reauth">获取验证码</button></div></label><p id="reauth-note" class="field-hint" role="status">验证码 10 分钟内有效，不要转发给任何人。</p>`
  :`<label class="field"><span class="field-label">账号密码</span><input name="password" type="password" autocomplete="current-password" maxlength="128" required></label><p class="field-hint">连续输错 5 次会锁定 15 分钟，届时可改用邮箱验证码。</p>`;
 modal('先确认一下，是你本人。',`<p class="modal-intro">绑定或解绑邮箱、更换主邮箱、修改密码、下线设备之前，需要先验证身份。验证通过后 ${PP.config.auth?.reauthMinutes||15} 分钟内无需重复。</p>${tabs}<form id="reauth-form">${body}<div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button type="button" class="secondary" data-action="reauth-cancel">返回</button><button type="submit" class="primary">验证身份 ${icon('shield')}</button></div></form>`,false,'reauth');
}
function confirmModal(title,text,label,fn,back=accountModal){
 pendingConfirm={fn,back};
 modal(title,`<div class="notice warm">${icon('info')}<span>${text}</span></div><div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button class="secondary" data-action="confirm-no">再想想</button><button class="danger-btn" data-action="confirm-yes">${label}</button></div>`,false,'confirm');
}
function passwordModal(){
 const a=PP.account,needCurrent=a.hasPassword&&!fresh();
 modal(a.hasPassword?'修改登录密码':'设置一个登录密码',`<p class="modal-intro">${a.hasPassword?'保存后，其他已登录的设备会全部下线，当前设备保持登录。':'密码是可选的：设置后可以用「邮箱 + 密码」直接登录，邮箱验证码登录依然可用。保存后其他已登录设备会下线。'}</p><form id="password-form">${needCurrent?`<label class="field"><span class="field-label">当前密码</span><input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label><button type="button" class="text-link" data-action="password-forgot">忘记当前密码？改用邮箱验证码验证 ↗</button>`:''}<label class="field"><span class="field-label">新密码 <small>8–128 位，需同时包含字母和数字</small></span><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label class="field"><span class="field-label">再输入一次</span><input name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button type="button" class="secondary" data-action="account-back">返回</button><button type="submit" class="primary">${a.hasPassword?'保存新密码':'设置密码'} ${icon('lock')}</button></div></form>`,false,'password');
}
async function sessionsModal(list){
 if(!list)list=await PP.sessions();
 modal('登录过的设备',`<p class="modal-intro">这里列出仍在有效期内的登录。看到不认识的设备，先下线它，再修改密码。</p><ul class="account-list">${list.map(s=>`<li class="account-item"><div><strong>${esc(s.device)}${s.current?' <span class="status">当前设备</span>':''}</strong><small>最近活动 ${dateTime(s.lastSeenAt)} · 登录于 ${dateTime(s.createdAt)}</small></div><div class="item-actions">${s.current?'<small>请用「退出当前设备」</small>':`<button class="text-link danger-link" data-action="session-revoke" data-id="${esc(s.id)}">下线</button>`}</div></li>`).join('')}</ul><div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button class="secondary" data-action="account-back">返回账号与安全</button>${list.length>1?'<button class="danger-btn" data-action="session-revoke-others">下线其他所有设备</button>':''}</div><p class="auth-note">设备名称按浏览器标识粗略识别，仅供参考；不记录精确位置。</p>`,false,'sessions');
}
async function sendBindCode(email){
 return withFresh(async()=>{
  const r=await PP.bindRequest(email);const normalized=email.trim().toLowerCase();
  bindDraft={email:normalized,sent:true,code:development()&&r.devCode?r.devCode:'',note:development()&&r.devCode?'开发沙盒：已填入服务器随机验证码，没有发送邮件，不能证明真实邮箱所有权。':`验证码邮件已交给邮件服务，请到 ${r.sentTo||normalized} 查收（含垃圾邮件箱）。`};
  startCooldown('bind:'+normalized);accountModal();
 });
}
function locationModal(){
 modal('你在哪里，故事就从哪里开始。',`<p class="modal-intro">${development()?'开发沙盒的城市可手动切换，不代表真实位置。':'当地作品依据服务器识别的 IP 城市开放，不能手动切城；IP 城市可能存在误差，不代表精确地址。'}</p><div class="notice">${icon('pin')}<span>当前：${city(PP.state.location).name}${development()?' · 沙盒城市':''}。定位未确认时暂停当地领取、购买和寄信，市集仍可浏览。</span></div>${development()?`<div class="city-options">${Object.entries(PP.cities).map(([id,c])=>`<button class="city-choice ${PP.state.location===id?'active':''}" data-action="set-location" data-id="${id}"><img src="${PP.product(id+'-free').img}" alt="${c.name}"><span><strong>${c.name}</strong><small>${c.en}</small></span>${PP.state.location===id?icon('check'):''}</button>`).join('')}</div>`:'<p class="layout-note">关闭此窗口后，可用顶部刷新按钮重新获取服务器状态。已拥有的收藏不会因定位失败而丢失。</p>'}`,false,'location');
}
function detail(productId,marketId){
 const p=PP.product(productId),m=marketId?PP.state.market.find(x=>x.id===marketId):null;const local=p.city===PP.state.location,free=p.price===0&&!m;
 const action=free?'claim':'checkout';
 modal('一小块风景，一段新故事。',`<div class="detail-layout"><div class="detail-image">${p.type==='stamp'?`<div class="stamp-large" style="width:185px;height:230px"><img src="${esc(p.img)}" alt="${esc(p.title)}" style="height:170px"><span>${city(p.city).en}<b>${fmt(p.price)}</b></span></div>`:`<img src="${esc(p.img)}" alt="${esc(p.title)}">`}</div><div class="detail-copy"><span class="status">${city(p.city).name} · ${m?'市集收藏':'当地限定'}</span><h3>${esc(p.title)}</h3><p class="detail-desc">${esc(m?.description||p.subtitle)}。${p.type==='card'?'为它写下一点想念，让这段风景与另一个人的生活相遇。':'每枚邮票都可以为一张明信片开启旅程。使用后会留在信件上，不再出现在未使用邮票册。'}</p><div class="detail-facts"><div><span>作品作者</span>${esc(p.creator)}</div><div><span>原始产地</span>${city(p.city).name} · ${city(p.city).country}</div><div><span>作品形式</span>${p.type==='card'?'数字明信片':'数字邮票'} · 1 份</div><div><span>获取方式</span>${m?'全球市集 · 不限位置':'当前城市邮局'}</div></div><div class="detail-price">${free?'免费':`¥${fmt(m?m.price:p.price)}`}<small>${free?'含一枚当地邮票':'仅数字使用权，非实物商品'}</small></div>${m?.own?`<button class="secondary" data-action="unlist" data-id="${m.id}">下架自己的作品</button>`:m&&!m.active?'<button class="primary" disabled>作品已成交或下架</button>':!m&&!local?`<button class="primary" data-action="nav" data-id="market">异地作品，请前往市集 ${icon('arrow')}</button>`:free&&PP.state.claimedFree?'<button class="primary" data-action="my-free">免费礼已领取 · 去我的收藏</button>':!free&&!development()?'<button class="primary" disabled>付费购买未开通</button>':`<button class="primary" data-action="${action}" data-id="${p.id}" ${m?`data-market="${m.id}"`:''}>${free?'免费领取，写下此刻':`收藏这${p.type==='card'?'张明信片':'枚邮票'}`} ${icon('arrow')}</button>`}${m&&!m.own&&m.active?`<button class="secondary" data-action="consult" data-id="${m.id}">${icon('chat')} 和 ${esc(m.seller)} 聊一聊</button>`:''}<p class="tiny-note">${development()?'开发付费购买仅为沙盒测试，确认页明确同意后才创建记录。':'真实支付未开通，付费作品不能购买。'}收藏记录保存在服务器；目录图片授权尚待核验，不代表已获商用授权。</p></div></div>`,true,'detail',p.id);
}
function checkout(productId,marketId,resume=false){return requireLogin(async()=>{
 const p=PP.product(productId),m=marketId?PP.state.market.find(x=>x.id===marketId):null,price=m?m.price:p.price;
 if(!development()&&price>0)throw new Error('真实支付未开通，不能购买付费资产。');
 if(marketId&&!m?.active)throw new Error('卖品已不可用，请刷新市集。');
 modal('沙盒确认 · 不是真实支付',`<div class="checkout-summary"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div><h3>${esc(p.title)}</h3><p>${city(p.city).name} · ${p.type==='card'?'数字明信片':'数字邮票'} · 1 份</p></div></div><div class="cost-row"><span>沙盒标价</span><span>¥${fmt(price)}</span></div><div class="cost-row total"><span>实际扣款</span><strong>¥0</strong></div><div class="notice">${icon('shield')}<span>这是开发沙盒测试，不连接支付渠道、不产生付款或收入。确认会在服务器数据库创建沙盒记录并${m?'下架此卖品、转移对应资产':'发放测试资产'}，不是购买真实商品。</span></div><form id="purchase-form" data-id="${p.id}" ${m?`data-market="${m.id}"`:''} ${resume?'data-resume="true"':''}><label class="check-row"><input type="checkbox" name="sandboxConsent" required><span>我确认进行沙盒购买测试，知晓不会真实支付，但会改变服务器中的测试资产。</span></label><div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button type="button" class="secondary" data-action="${resume?'resume-compose':'detail'}" data-id="${p.id}" ${m?`data-market="${m.id}"`:''}>返回</button><button class="primary" type="submit">确认沙盒购买 ${icon('check')}</button></div></form>`,false,'checkout');
 });}
function acquired(asset){const p=PP.product(asset.productId);render();modal('风景已收藏，想念可以出发。',`<div class="success-content"><div class="success-icon">${icon('check')}</div><h3>这份${city(p.city).name}，现在属于你。</h3><p>${esc(p.title)}已放入「我的收藏」。${asset.source==='free'?'<br>一枚当地邮票也已随卡附赠。':''}</p></div><div class="checkout-summary" style="margin-top:22px"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div><h3>${esc(p.title)}</h3><p>未使用 · ${asset.source==='free'?'首次免费礼':development()?'沙盒资产，未扣款，已保存到服务器':'服务器资产记录'}</p></div></div><div class="modal-actions"><button class="secondary" data-action="nav" data-id="profile">放回收藏</button><button class="primary" data-action="${p.type==='card'?'compose':'choose-card'}" data-id="${asset.id}">${p.type==='card'?'现在写一张':'去挑一张卡片'} ${icon('pen')}</button></div>`,false,'acquired');}
function chooseCard(){return requireLogin(async()=>{const items=PP.ownAssets('unused').filter(a=>PP.product(a.productId).type==='card');modal('想用哪张风景，打开话匣子？',`<p class="modal-intro">从未使用的明信片中选择一张。寄出后，这份资产会随信交给收信人。</p><div class="postcard-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${items.length?items.map(a=>cardTile(PP.product(a.productId),{asset:a})).join(''):empty('还没有未使用的明信片','先领取你的首张免费礼，或去邮局买一张。')}</div>`,false,'choose');});}
function startCompose(assetId){return requireLogin(async()=>{if(!hasLocation())throw new Error('定位未确认，暂不能寄信；收藏仍保留在服务器。');const a=PP.ownAssets('unused').find(a=>a.id===assetId);if(!a)throw new Error('这张明信片当前不可寄送，请从未使用收藏中重新选择。');const draft=storage.get('posterposta-draft',null);compose=draft?.assetId===assetId?draft:{assetId,stampAssetId:'',toName:'',toEmail:'',toCity:'',message:''};if(!PP.ownAssets('unused').some(a=>a.id===compose.stampAssetId)){compose.stampAssetId=PP.ownAssets('unused').find(a=>PP.product(a.productId).type==='stamp'&&PP.product(a.productId).city===PP.state.location)?.id || PP.ownAssets('unused').find(a=>PP.product(a.productId).type==='stamp')?.id || ''; }composeModal();});}
function captureCompose(){const f=$('#compose-form');if(!f||!compose)return;for(const key of ['toName','toEmail','toCity','message'])compose[key]=f.elements[key].value;}
function estimateHTML(){if(!compose?.toCity)return `${icon('clock')}<span>选择收信人的所在城市，估算这封信的旅行时间。邮箱地址无法推断地理位置。</span>`;const est=PP.deliveryEstimate(compose.toCity);return `${icon('clock')}<span>${city(PP.state.location).name} → ${city(compose.toCity).name}，约 ${fmt(est.distance)} km<br>预计 <strong>${est.min}–${est.max} 个工作日</strong>后进入发送处理 · 不含周末，不保证送达时间</span>`;}
function composeModal(){
 if(!compose)return chooseCard();const a=PP.ownAssets().find(a=>a.id===compose.assetId),p=PP.product(a.productId),stamps=PP.ownAssets('unused').filter(a=>PP.product(a.productId).type==='stamp');
 modal('在风景背面，写一点想念。',`<div class="steps"><span class="step active"><b>1</b> 写寄语</span><span class="step-line"></span><span class="step"><b>2</b> 确认寄送</span><span class="step-line"></span><span class="step"><b>3</b> 等待抵达</span></div><div class="compose-layout"><div class="compose-left"><div class="postcard-preview"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div class="preview-caption">${city(p.city).en}<small>WISH YOU WERE HERE</small></div></div><div class="postcard-back"><p class="back-to" id="live-to">TO ${esc(compose.toName||'那个想起的人')}</p><p id="live-message">${esc(compose.message||'把今天遇见的风景，写给你。')}</p><p class="back-sign">FROM ${esc(PP.state.user.name)}</p></div><div class="notice">${icon('pin')}<span>卡片产地：${city(p.city).name}<br>本次寄出邮戳：${city(PP.state.location).name}${development()?'（沙盒城市，非实际定位）':'（服务器识别城市）'}<br>市集购入的异地卡片和邮票，也可以从此刻所在城市寄出。</span></div></div><form id="compose-form"><div class="field-grid"><label class="field"><span class="field-label">收信人昵称</span><input name="toName" maxlength="50" placeholder="想寄给谁" value="${esc(compose.toName)}" required></label><label class="field"><span class="field-label">收信人所在城市</span>${citySelect('toCity',compose.toCity,true)}</label></div><label class="field"><span class="field-label">收信邮箱 <small>请仔细核对</small></span><input name="toEmail" type="email" placeholder="friend@example.com" value="${esc(compose.toEmail)}" required></label><label class="field"><span class="field-label">你的寄语 <small id="word-count">${compose.message.length} / 500</small></span><textarea name="message" maxlength="500" placeholder="今天发生了什么？或者，只说一句想你。" required>${esc(compose.message)}</textarea></label><div class="field-label">贴上一枚邮票 <small>每封信消耗 1 枚</small></div><div class="stamp-picker">${stamps.map(a=>`<button type="button" class="stamp-option ${a.id===compose.stampAssetId?'active':''}" data-action="select-stamp" data-id="${a.id}" aria-label="选择${esc(PP.product(a.productId).title)}">${stamp(PP.product(a.productId))}<small>${city(PP.product(a.productId).city).name} · 已拥有</small></button>`).join('')}<button type="button" class="stamp-option stamp-buy" data-action="buy-stamp" ${!development()?'disabled':''}>${icon('plus')}<small>${development()?'沙盒选购当地邮票':'付费邮票未开通'}<br>${development()?'不是真实支付':'可使用已有邮票'}</small></button></div><div class="notice" id="delivery-estimate">${estimateHTML()}</div><div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button class="secondary" type="button" data-action="save-draft">保存草稿</button><button class="primary" type="submit">预览与确认 ${icon('arrow')}</button></div></form></div>`,true,'compose');
}
function confirmSend(){
 const a=PP.ownAssets().find(a=>a.id===compose.assetId),p=PP.product(a.productId),s=PP.ownAssets().find(a=>a.id===compose.stampAssetId);if(!s)throw new Error('请先选择一枚未使用的邮票。');const est=PP.deliveryEstimate(compose.toCity);
 if(ownsEmail(compose.toEmail))throw new Error('这是你账号绑定的邮箱，请填写朋友的邮箱，不能寄给自己。');
 storage.set('posterposta-draft',compose);
 modal('确认后，就让想念慢慢出发。',`<div class="steps"><span class="step"><b>✓</b> 写寄语</span><span class="step-line"></span><span class="step active"><b>2</b> 确认寄送</span><span class="step-line"></span><span class="step"><b>3</b> 等待抵达</span></div><div class="letter-message">${stamp(PP.product(s.productId))}${esc(compose.message)}<div class="letter-sign">${esc(PP.state.user.name)} · 寄自${city(PP.state.location).name}</div></div><div class="cost-row"><span>收信人</span><strong>${esc(compose.toName)}</strong></div><div class="cost-row"><span>收信邮箱</span><strong style="overflow-wrap:anywhere;text-align:right">${esc(compose.toEmail)}</strong></div><div class="cost-row"><span>旅行时间</span><span>${est.min}–${est.max} 个工作日 · ${city(compose.toCity).name}</span></div><div class="cost-row"><span>消耗资产</span><span>1 张明信片 + 1 枚邮票</span></div><div class="notice warm">${icon('info')}<span>请确认邮箱无误。提交后会锁定明信片、消耗邮票，并在服务器保存信件和延迟队列。${development()?'<strong>开发沙盒不发送邮件。</strong>可用收信链接切换账号验证签收。':'<strong>这是对外发送，不可撤销。</strong>队列到期将尝试向此邮箱发送领取邀请，无法保证真实送达；不能撤回或重复使用资产。'}</span></div><div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button class="secondary" data-action="resume-compose">再改一改</button><button class="primary" data-action="send-letter">${development()?'确认沙盒寄信':'确认对外发送 · 不可撤销'} ${icon('plane')}</button></div>`,false,'confirm-send');
}
function sendSuccess(l){
 const link=development()&&l.sandboxClaimToken?location.origin+'/?claim='+encodeURIComponent(l.sandboxClaimToken):null;
 render();modal('你的想念，已经进入寄送队列。',`<div class="success-content"><div class="success-icon">${icon('plane')}</div><h3>写给 ${esc(l.toName)} 的风景，已保存。</h3><p>信件与资产状态已写入服务器数据库。</p></div><div class="route-ticket"><div class="route-city"><strong>${city(l.fromCity).name}</strong><small>${city(l.fromCity).en}</small></div><div class="route-middle">${icon('plane')}${l.days} 个工作日</div><div class="route-city"><strong>${city(l.toCity).name}</strong><small>${city(l.toCity).en}</small></div></div><div class="success-content"><p>预计 ${date(l.eta)} 进入发送处理，不是送达承诺<br>${esc(l.toEmail)}</p></div><div class="notice">${icon('info')}<span>${development()?'开发沙盒未发送邮件。等待本地队列到期，或由发送者在详情中模拟投递后，可测试签收。':'已提交对外发送任务，不可撤销。邮件服务接受不等于送达，收信人验证邮箱并签收后才能聊天。'}</span></div>${link?`<div class="claim-link"><label class="field"><span class="field-label">沙盒收信链接 · 仅本次显示</span><input id="sandbox-claim-link" value="${esc(link)}" readonly aria-label="沙盒收信链接"></label><button class="secondary" data-action="copy-claim-link">复制收信链接</button><p class="field-hint">请先复制保存；关闭后无法再次获取。需切换到 ${esc(l.toEmail)} 账号或另一浏览器测试，不能用发送者账号签收。不要公开转发此私密链接。</p></div>`:''}<div class="modal-actions"><button class="secondary" data-action="nav" data-id="postoffice">再看看风景</button><button class="primary" data-action="letter" data-id="${l.id}">查看这封信 ${icon('arrow')}</button></div>`,false,'success');
}
async function loadClaim(){
 syncIdentity();claimState={loading:true};render();
 try{
  const result=await PP.claimInfo(claimToken);
  syncIdentity();
  // 领取前只展示必要信息，不把接口返回的全文放进预览页面。
  claimState={fromName:result.fromName,maskedEmail:result.maskedEmail,id:result.id,status:result.status};
 }catch(e){claimState={error:e.message,code:e.code};}
 if(view==='claim')render();
}
function claimPage(){
 const u=PP.state.user,s=claimState;
 const signed=s.status==='received'||s.code==='ALREADY_CLAIMED';
 let content;
 if(s.loading)content='<p role="status">正在核对收信邀请…</p>';
 else if(signed)content=`<h2>这封信已经签收</h2><p>不会重复领取或再次移动资产。</p>${s.id?`<button class="primary" data-action="claimed-letter" data-id="${esc(s.id)}">打开已签收信件 ${icon('arrow')}</button>`:''}`;
 else if(s.error)content=`<h2>${s.code==='CLAIM_EMAIL_MISMATCH'?'请切换到正确的收信邮箱':s.code==='LETTER_NOT_READY'?'信件还未进入可签收状态':'暂时无法打开这封邀请'}</h2><p role="alert">${esc(s.error)}</p>${s.code==='CLAIM_EMAIL_MISMATCH'&&u?`<p>如果寄件人写的是你的另一个邮箱，可以把它绑定到当前账号，绑定成功后会自动重新核对。</p>`:''}${s.code==='LETTER_NOT_READY'?`<p>${development()?'请让发送者模拟投递，或等待沙盒队列到期，再刷新。':'请稍后刷新；排队待发送的信件还不能签收。'}</p>`:''}<div class="modal-actions">${u?'<button class="secondary" data-action="claim-switch">退出并更换邮箱</button>':''}${s.code==='CLAIM_EMAIL_MISMATCH'&&u?'<button class="secondary" data-action="account-center">绑定收信邮箱</button>':''}<button class="primary" data-action="refresh-claim">重新核对</button></div>`;
 else content=`<h2>${esc(s.fromName)} 给你寄来一份风景</h2><p>${u?`已登录：${esc(u.email)}${PP.account?.emails.length>1?` 等 ${PP.account.emails.length} 个已绑定邮箱`:''}`:`收信邮箱：${esc(s.maskedEmail)}`}</p><p>${u?'确认签收后，明信片转入你的收藏，并开启双方对话。':'请用这封邀请对应的收信邮箱注册或登录。验证前不会展示寄语全文，也不会领取资产。'}</p><div class="modal-actions">${u?'<button class="secondary" data-action="claim-switch">更换邮箱</button><button class="primary" data-action="claim-letter">确认签收</button>':'<button class="primary" data-action="claim-login">用收信邮箱注册 / 登录</button>'}</div>`;
 return heading('A LETTER FOR YOU','有一份风景，正在等你。','签收凭据仅留在当前页面内存，已从地址栏移除，不写入浏览器存储。')+`<section class="claim-page"><div class="success-icon">${icon('mail')}</div>${content}<div id="form-error" class="inline-error" role="alert"></div><p class="auth-note">刷新整个页面后，请从原始邮件或保存的沙盒链接重新进入。${development()?'当前为开发沙盒，不发送邮件。':''}</p></section>`;
}
async function refreshState(){
 if(activeModal&&!['letter','thread'].includes(activeModal.kind))return toast('请先完成或关闭当前表单，再刷新服务器数据');
 const currentModal=activeModal,reply=$('.chat-form input'),text=reply?.value,selection=reply?.selectionStart;
 const userId=PP.state.user?.id;
 if(view==='claim'&&!currentModal)return loadClaim();
 await PP.refresh();
 if(userId!==PP.state.user?.id){closeModal(true);syncIdentity();render();return toast('登录状态已改变，已清除当前页面中的旧账号内容');}
 render();
 if(currentModal?.kind==='letter')letterModal(currentModal.id);
 if(currentModal?.kind==='thread')threadModal(currentModal.id);
 const input=$('.chat-form input');
 if(input&&text!==undefined){input.value=text;input.focus();input.setSelectionRange(selection,selection);}
 toast('已加载服务器最新记录');
}
function chatMessages(list){return `<div class="chat-messages">${list.map(m=>`<div class="chat-bubble ${m.authorId===PP.state.user?.id?'me':''}"><small>${m.authorId===PP.state.user?.id?'我':esc(m.author)} · ${date(m.time)}</small><p>${esc(m.text)}</p></div>`).join('')}</div>`;}
function letterModal(id){
 const l=PP.state.letters.find(x=>x.id===id);if(!l)throw new Error('信件暂时找不到了');const p=PP.product(l.productId),locked=!canChat(l);
 const deliveryNote=l.status==='accepted'?'邮件服务已接受发送，不代表真实送达；等待收信人验证并签收。':l.status==='sandbox_ready'?'本地队列已到期，没有发送邮件，不代表送达。':l.status==='received'?'收信人已验证并签收，资产已转入收信人的收藏。':l.status==='delivered'?(development()?'仅开发模拟投递，没有发送邮件，也不代表真实送达。':'投递状态尚待核验，收信人签收前不能聊天。'):`预计 ${date(l.eta)} 进入发送处理，不保证送达时间。`;
 modal('把故事，留在这张明信片下面。',`<div class="postcard-preview" style="aspect-ratio:1.9;max-height:260px;transform:none"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div class="preview-caption">${city(p.city).en}<small>${esc(p.title)}</small></div></div><div class="letter-meta"><span>${city(l.fromCity).name} · ${isRecipient(l)?esc(l.fromName)+' → 我':'我 → '+esc(l.toName)}</span>${badge(l.status)}</div><div class="letter-message">${stamp(PP.product(l.stampId))}${esc(l.message)}<div class="letter-sign">${date(l.sentAt)} · 寄自${city(l.fromCity).name}</div></div><div class="notice">${icon('clock')}<span>${deliveryNote}<br>收信邮箱：${esc(l.toEmail)}</span></div><div class="chat-heading"><strong>明信片下的对话</strong><button class="text-link" data-action="refresh">刷新对话</button></div>${locked?`<div class="locked-chat">${icon('lock')}收信人验证邮箱并签收后，才能开始对话。</div>`:`${chatMessages(l.messages)}<form class="chat-form" id="letter-reply-form" data-id="${l.id}"><input name="text" aria-label="写一封回信" placeholder="继续聊聊这张明信片…" maxlength="500" required><button type="submit" class="primary" aria-label="发送回复">${icon('arrow')}</button></form>`}${development()&&l.sandbox&&isSender(l)&&['transit','sandbox_ready'].includes(l.status)?`<button class="text-link" data-action="deliver" data-id="${l.id}">沙盒模拟投递（不发邮件） ↗</button>`:''}<div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button class="secondary" data-action="email-preview" data-id="${l.id}">${icon('mail')} 查看邮件样式参考</button><button class="secondary" data-action="report" data-id="${l.id}">${icon('flag')} 本地举报 / 隐私</button></div><p class="auth-note">聊天真实保存在服务器数据库，双方点击「刷新对话」可获取新消息，不自动重绘输入。${development()?'开发模拟投递可提前测试聊天，不等同于收件人已签收。':''}</p>`,false,'letter',id);
}
function threadModal(id){const t=PP.state.community.find(x=>x.id===id);if(!t)throw new Error('话题暂时找不到了');const p=PP.product(t.productId);modal(`与 ${esc(t.peer)} 聊聊这份风景`, `<div class="checkout-summary"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div><h3>${esc(p.title)}</h3><p>${esc(t.title)}</p></div></div><div class="chat-heading"><strong>市集交流</strong><button class="text-link" data-action="refresh">刷新对话</button></div>${chatMessages(t.messages)}<form class="chat-form" id="thread-reply-form" data-id="${id}"><input name="text" aria-label="市集交流内容" placeholder="关于这份风景，你想说…" maxlength="500" required><button type="submit" class="primary">${icon('arrow')}</button></form><div id="form-error" class="inline-error" role="alert"></div><p class="auth-note">市集交流已保存到服务器数据库，双方登录后刷新即可看到新消息；不提供实时推送。</p><button class="tip-button" data-action="report" data-id="${id}">${icon('flag')} 举报不当内容 / 隐私说明</button>`,false,'thread',id);}
function consult(id){return requireLogin(async()=>{const m=PP.state.market.find(x=>x.id===id),p=PP.product(m.productId),t=PP.state.community.find(t=>t.marketId===id);if(t)return threadModal(t.id);modal(`向 ${esc(m.seller)} 说声你好`, `<div class="checkout-summary"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div><h3>${esc(p.title)}</h3><p>${city(p.city).name} · ¥${fmt(m.price)}</p></div></div><form id="consult-form" data-id="${id}"><label class="field"><span class="field-label">关于这份风景，你想聊什么？</span><textarea name="message" maxlength="500" required placeholder="你好，这张明信片背后有什么故事吗？"></textarea></label><p class="field-hint">咨询会保存到服务器的「来往信件 → 市集交流」。卖家登录并刷新后可看到，不会额外发送邮件通知。</p><div id="form-error" class="inline-error" role="alert"></div><div class="modal-actions"><button type="submit" class="primary">开始这段交流 ${icon('chat')}</button></div></form>`,false,'consult');});}
function assetDetail(id){const a=PP.ownAssets().find(a=>a.id===id);if(!a)throw new Error('未找到此资产');const p=PP.product(a.productId);if(a.status==='received'||a.status==='sent'){const l=PP.state.letters.find(l=>l.assetId===id);if(l)return letterModal(l.id);}if(a.status==='unused'&&p.type==='card'){return startCompose(id);}modal('你的私人珍藏',`<div class="checkout-summary"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div><h3>${esc(p.title)}</h3><p>${city(p.city).name} · ${statusText[a.status]}</p></div></div><p class="modal-intro">${p.type==='stamp'?'邮票会随信寄出，一枚只能使用一次。邮票原始产地不会因寄送城市而改变。':'已上架作品暂时锁定，先下架，才能写信或再次转售。'}</p><div class="notice">${icon('info')}<span>来源：${({free:'首张免费礼',gift:'免费附赠',shop:'当地邮局',market:'全球市集',creation:'原创作品'})[a.source]||'收藏'}<br>数字资产编号：${esc(a.id)}</span></div><div class="modal-actions">${a.status==='unused'?`<button class="secondary" data-action="list-asset" data-id="${a.id}">转售到市集</button><button class="primary" data-action="choose-card">挑张卡片开始写 ${icon('pen')}</button>`:a.status==='listed'?`<button class="primary" data-action="unlist" data-id="${PP.state.market.find(m=>m.assetId===id&&m.active)?.id||''}">下架并放回收藏</button>`:'<button class="secondary" data-action="close">知道了</button>'}</div>`,false,'asset');}
function listAssetModal(id){return requireLogin(async()=>{const a=PP.ownAssets().find(a=>a.id===id),p=PP.product(a.productId);if(a.source==='free'||a.source==='gift'||p.price===0)throw new Error('免费明信片与赠送邮票不支持转售，留给一封特别的信吧。');const creation=PP.state.creations.find(w=>w.productId===p.id);if(creation?.status==='pending')throw new Error('作品尚未通过审核，不能上架；生产审核流程暂未开通。');modal('给这份风景，找一个新主人。',`<div class="checkout-summary"><img src="${esc(p.img)}" alt="${esc(p.title)}"><div><h3>${esc(p.title)}</h3><p>${city(p.city).name} · 未使用 · 1 份</p></div></div><form id="list-form" data-id="${id}"><label class="field"><span class="field-label">你的定价（元）</span><input type="number" name="price" min="0.01" max="999" step="0.01" required value="${p.price}"></label><label class="field"><span class="field-label">说说它的故事</span><textarea name="description" maxlength="500" placeholder="它在哪里遇见你，又为什么想让它继续旅行？"></textarea></label><div class="notice">${icon('lock')}<span>上架后这份资产将锁定，不能同时寄出。下架后恢复使用。上架记录会真实保存到服务器并在市集公开展示。${development()?'购买仅供开发沙盒测试，不产生收入。':'真实支付未开通，其他用户只能浏览与咨询，暂不能购买。'}</span></div><div id="form-error" class="inline-error" role="alert"></div><button type="submit" class="primary full-width">确认上架 ${icon('arrow')}</button></form>`,false,'list');});}
function createModal(){return requireLogin(async()=>{creationImage='';modal('给一座城市，做一张自己的名片。',`<p class="modal-intro">照片、画作、手绘都可以。作品可以属于世界上的另一座城市，不必是你当前所在地。</p><form id="creation-form"><label class="upload-zone" id="upload-zone"><div id="upload-preview" style="text-align:center">${icon('upload')}<p>放进一张你创作的图片</p><small>点击选择 · JPG / PNG / WebP · 最大 2 MB</small></div><input type="file" id="art-upload" accept="image/png,image/jpeg,image/webp" aria-label="上传原创作品"></label><p class="field-hint">建议横版 3:2 明信片、竖版 3:4 邮票；预览会居中裁切，原图保留。</p><div class="field-grid" style="margin-top:19px"><label class="field"><span class="field-label">作品类型</span><select name="type"><option value="card">明信片</option><option value="stamp">邮票</option></select></label><label class="field"><span class="field-label">绑定城市</span>${citySelect('city',PP.state.location)}</label></div><label class="field"><span class="field-label">作品名字 <small>2–30 字</small></span><input name="title" minlength="2" maxlength="30" placeholder="例如：巴黎的某个晴天下午" required></label><div class="field-grid"><label class="field"><span class="field-label">定价（元）</span><input name="price" type="number" min="0.01" max="999" step="0.01" value="12" required></label><label class="field"><span class="field-label">发行份数</span><input value="1 份数字使用权" readonly></label></div><label class="field"><span class="field-label">创作故事</span><textarea name="description" maxlength="500" placeholder="为什么想把这幅风景留下来？"></textarea></label><label class="check-row"><input type="checkbox" name="rights" required><span>我拥有这张图片的版权或已获得授权，并同意在通过审核后公开展示。内容不含他人隐私、侵权素材或违法信息。</span></label><div class="notice">${icon('shield')}<span>图片与作品会上传并保存到服务器数据库，生成一份原创资产。审核前不进入市集；${development()?'开发沙盒可模拟审核，不代表实际版权或内容审核。':'生产管理员审核流程尚未开通，作品会保持待审核状态。'}上架锁定资产，不转移版权。</span></div><div id="form-error" class="inline-error" role="alert"></div><button type="submit" class="primary full-width">保存作品，进入待审核 ${icon('arrow')}</button></form>`,false,'create');});}
function emailPreview(id){
 const l=PP.state.letters.find(x=>x.id===id),p=PP.product(l.productId);
 modal('邮件视觉参考 · 不是实际发送内容',`<div class="mail-preview"><div class="mail-toolbar">收件人：${esc(l.toEmail)}<br>主题：你收到了一封 PosterPosta 来信</div><div class="mail-content"><div class="brand">PosterPosta<span class="brand-dot">.</span></div><img src="${esc(p.img)}" alt="${esc(p.title)}"><h3>有一份风景想见你。</h3><p>${esc(l.fromName)}给你寄来了一张明信片。</p><button class="primary full-width" disabled>请从实际邀请链接进入签收页</button><p class="auth-note">匿名邀请仅展示寄件人昵称和脱敏收信邮箱；正确邮箱验证后才能签收与回信。</p></div></div><p class="auth-note">此处仅为样式参考，不代替真实收信页面，不触发签收。${development()?'开发沙盒不发送邮件。':'当前后端发送的是含领取链接的纯文本邀请，不包含此图片排版。'}拒收、退订与邮件回执处理尚未接入。</p><button class="secondary full-width" data-action="letter" data-id="${id}">返回信件详情</button>`,false,'email');
}
const rules=()=>[
 ['位置，让记忆有出处',development()?'开发沙盒使用可切换的测试城市，不代表实际位置；城市状态保存在服务器会话。':'当地邮局只开放服务器识别城市的作品。无法确认城市时，暂停当地领取、购买和寄信；市集仍可浏览。IP 城市不是精确地址。'],
 ['第一张，真的不用付费','每个账号跨城市共 1 次免费名额，附赠 1 枚同城邮票，两者不可转售。付费购买尚未开通，喜欢列表不代表拥有资产。'],
 ['一份资产，只踏上一段旅程','寄信锁定 1 张明信片并消耗 1 枚邮票。签收后卡片转入收信人收藏，不可重复寄送或转售。上架锁定、下架恢复、签收转移均由服务器数据库校验。'],
 ['发送计划，不是送达承诺','按两座城市的粗略距离安排 1–10 个工作日后处理。随机天数提交时确定一次，排除周末，不精算节假日。邮箱不能推断位置，收信城市由寄件人填写。'],
 ['接受发送、送达、签收要分清','accepted 仅表示邮件服务接受发送，不代表送达；送达和退信 webhook 尚未接入。匿名领取邀请不展示全文；必须用正确收信邮箱验证并签收后才能聊天。'+(development()?'沙盒队列到期只标记 sandbox_ready，不发邮件；发送者可模拟 delivered 状态测试聊天。':'对外发送提交后不可撤销。')],
 ['创作可以自由，版权不能随意','上传图片与作品保存到服务器，每件生成 1 份数字资产。版权声明不等于平台完成授权核验，目录图片的商用授权尚待确认。生产审核工作流尚未接入，不能把开发审核当作正式审核。'],
 ['交易与服务边界','真实支付、退款、提现、争议工单、拉黑与拒收尚未开通。上架和咨询真实保存到服务器；付费资产不会在生产环境通过假付款发放。'],
 ['你的数据保存在何处','账号、收藏、信件、聊天、作品与订单保存在服务器 SQLite 数据库。只有草稿、喜欢和本地举报按账号隔离存于本浏览器；清除浏览器数据不会删除服务器记录，但会丢失这些本地内容。']
];
function rulesModal(){modal('邮局公约 · 小事也要认真',`<div class="rules-list">${rules().map(([t,p])=>`<section class="rule-item"><h3>${t}</h3><p>${p}</p></section>`).join('')}</div><button class="primary full-width" data-action="close">知道了，继续旅程 ${icon('check')}</button>`,false,'rules');}
function demoModal(){modal(development()?'开发沙盒 · 真实数据库，非真实交易':'服务说明 · 当前开放边界',`<p class="modal-intro">${development()?'服务器生成随机测试验证码；切城、模拟投递、审核和购买仅用于开发验证，不发送邮件、不扣款。':'邮箱验证码和收信邀请通过邮件服务发送。位置由服务器识别；付费购买未开通，对外寄信提交后不可撤销。'}</p><div class="rules-list"><section class="rule-item"><h3>已连接服务器</h3><p>邮箱验证码 / 可选密码登录、多邮箱绑定、登录设备管理、收藏与资产管理、寄信队列、正确邮箱签收、双向聊天、上架与咨询、作品上传、订单记录均使用后端接口与 SQLite 数据库。不在刷新后植入示例资产。</p></section><section class="rule-item"><h3>尚未完成</h3><p>真实支付与退款提现、送达与退信 webhook、生产管理员审核、举报工单与屏蔽拒收、素材商用授权核验。邮件接受发送不是实际送达，开发审核不代表内容或版权审核。</p></section><section class="rule-item"><h3>数据与隐私</h3><p>账号、信件、聊天和上传图片会发送到服务器保存。草稿、喜欢和本地举报只留在当前账号的浏览器空间。收信凭据只在页面内存中保留，不写入 localStorage。</p></section></div><div class="modal-actions">${development()?'<button class="secondary" data-action="location">切换沙盒城市</button>':''}<button class="primary" data-action="close">继续逛逛 ${icon('arrow')}</button></div>`,false,'demo');}
function settingsModal(){modal('照顾好你的私人邮局。',`<div class="settings-menu"><button data-action="${PP.state.user?'account-center':'login'}">${icon('lock')}<span>账号与安全</span><span>${PP.account?`${esc(PP.account.email)}${PP.account.emails.length>1?` 等 ${PP.account.emails.length} 个邮箱`:''} · ${PP.account.hasPassword?'已设密码':'验证码登录'}`:'未登录'} ›</span></button><button data-action="transactions">${icon('wallet')}<span>订单与记录</span><span>›</span></button><button data-action="rules">${icon('shield')}<span>隐私、资产与邮局公约</span><span>›</span></button><button data-action="demo">${icon('info')}<span>服务说明 / 上线边界</span><span>›</span></button>${PP.state.user?`<button data-action="logout">${icon('logout')}<span>退出账号 / 更换邮箱</span><span>保留服务器记录 ›</span></button>`:''}</div><p class="auth-note">服务器禁用破坏性重置，不提供一键清空账号或资产。</p>`,false,'settings');}
function transactionsModal(){const ts=PP.state.transactions.slice().reverse();modal('每一份风景，都有一张收据。',`<p class="modal-intro">领取与订单记录保存在服务器。${development()?'沙盒标价不代表实际付款或收入。':'真实支付未开通，不会生成已付款凭据。'}真实收入为 0，不提供提现。</p>${ts.length?ts.map(t=>`<div class="transaction"><div><h3>${esc(PP.product(t.productId).title)}</h3><p>${esc(t.description)} · ${date(t.createdAt)}</p></div><strong>${t.amount<0?'−':''}¥${fmt(Math.abs(t.amount))}</strong></div>`).join(''):empty('还没有收据','领取第一份风景，开启你的旅程。')}<div class="notice">${icon('wallet')}<span>真实支付与提现尚未接入，当前可结算收入为 ¥${fmt(PP.state.revenue)}。这里不会模拟提现成功。</span></div>`,false,'transactions');}
function reportModal(id){modal('每一份来往，都应当被尊重。',`<form id="report-form" data-id="${esc(id)}"><label class="field"><span class="field-label">遇到什么问题？</span><select name="reason"><option>骚扰或不友善内容</option><option>涉嫌侵权</option><option>交易纠纷</option><option>隐私泄露</option><option>不再接收此类内容</option></select></label><label class="field"><span class="field-label">补充说明（选填）</span><textarea name="message" maxlength="500" placeholder="请勿在此填写身份证、银行卡等敏感信息。"></textarea></label><div class="notice">${icon('shield')}<span>反馈仅按当前账号保存在本浏览器，不提交客服，也不会屏蔽对方。举报工单、处理通知、屏蔽与拒收功能尚未接入。</span></div><div id="form-error" class="inline-error" role="alert"></div><button class="primary full-width" type="submit">保存本地反馈</button></form>`,false,'report');}

async function action(el){
 const a=el.dataset.action,id=el.dataset.id,m=el.dataset.market;
 if(['set-location','deliver','review'].includes(a)&&!development())throw new Error('此功能仅供开发沙盒使用。');
 if(a==='refresh')return await refreshState();
 if(a==='refresh-claim')return await loadClaim();
 if(a==='claim-login'){afterLogin=loadClaim;return loginModal();}
 if(a==='claim-switch'){await PP.logout();closeModal(true);syncIdentity();await loadClaim();afterLogin=loadClaim;return loginModal();}
 if(a==='claimed-letter'){await PP.refresh();render();return letterModal(id);}
 if(a==='claim-letter')return await requireLogin(async()=>{
  try{const result=await PP.claim(claimToken);claimState={id:result.id,status:'received'};render();letterModal(result.id);toast('签收成功，明信片已进入你的收藏');}
  catch(e){await loadClaim();throw e;}
 });
 if(a==='copy-claim-link'){
  const input=$('#sandbox-claim-link');if(!development()||!input)return;
  try{await navigator.clipboard.writeText(input.value);toast('收信链接已复制，请用收信邮箱在其他账号或浏览器中打开');}
  catch{input.focus();input.select();toast('自动复制不可用，链接已选中，请手动复制');}
  return;
 }
 if(a==='nav')return navigate(id);
 if(a==='close')return closeModal();
 if(a==='filter'){filter=id;render();if(id==='stamps')$('.section-heading')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
 if(a==='favorite')return await requireLogin(async()=>{favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];const saved=storage.set('posterposta-favorites',favorites);render();if(saved)toast(favorites.includes(id)?'喜欢已保存在当前账号的浏览器空间':'已取消喜欢');});
 if(a==='market-type'){marketType=id;return render();}
 if(a==='clear-market'){marketType='all';marketCity='all';marketSearch='';marketSort='new';return render();}
 if(a==='message-tab'){messageTab=id;return render();}
 if(a==='profile-type'){profileType=id;return render();}
 if(a==='asset-tab'){assetTab=id;return render();}
 if(a==='location')return locationModal();
 if(a==='set-location'){if(compose)captureCompose();await PP.setLocation(id);filter='all';closeModal(true);render();return toast(`已切换到${city(id).name}演示邮局，不代表真实定位`);}
 if(a==='account')return PP.state.user?settingsModal():loginModal();
 if(a==='login')return loginModal();
 if(a==='show-code'){
  const f=$('#login-form'),email=f.elements.email.value.trim();
  const alert=f.querySelector('.inline-error');alert.textContent='';alert.classList.remove('show');
  if(!email)throw new Error('请先填写邮箱地址。');
  f.elements.code.value='';$('#otp-note').textContent='正在请求验证码…';
  let result;
  try{result=await PP.requestCode(email);}catch(e){$('#otp-note').textContent='验证码请求未完成，请根据提示稍后重试。';throw e;}
  if(development()&&result.devCode&&result.emailSent===false){f.elements.code.value=result.devCode;$('#otp-note').textContent='已填入服务器随机开发验证码；未发送邮件，不代表已验证真实邮箱所有权。';}
  else if(result.emailSent){$('#otp-note').textContent='验证码邮件已交给邮件服务，请查收（含垃圾邮件箱）；服务接受不保证送达。';}
  else throw new Error('服务器未确认验证码发送，请稍后重试。');
  startCooldown('login');
  return;
 }
 if(a==='login-mode'){
  const email=$('#modal-root form input[name="email"]')?.value.trim()||'';
  loginMode=id;loginNeedName=false;return loginModal({email});
 }
 if(a==='account-center'||a==='account-info'){if(!PP.state.user)return loginModal();bindDraft=null;return accountModal();}
 if(a==='account-back')return accountModal();
 if(a==='reauth-now')return withFresh(async()=>{refreshAccount();toast('身份已验证');});
 if(a==='reauth-mode'){reauthMode=id;return reauthModal();}
 if(a==='reauth-cancel'){const back=reauthBack||accountModal;pendingReauth=null;reauthBack=null;return back();}
 if(a==='reauth-code'){
  const r=await PP.reauthRequest();startCooldown('reauth');
  const f=$('#reauth-form'),note=$('#reauth-note');
  if(development()&&r.devCode){if(f?.elements.code)f.elements.code.value=r.devCode;if(note)note.textContent='开发沙盒：已填入服务器随机验证码，没有发送邮件。';}
  else if(note)note.textContent=`验证码已发送到 ${r.sentTo}，请查收（含垃圾邮件箱）。`;
  return;
 }
 if(a==='confirm-no'){const back=pendingConfirm?.back||accountModal;pendingConfirm=null;return back();}
 if(a==='confirm-yes'){
  const p=pendingConfirm;pendingConfirm=null;if(!p)return accountModal();
  try{return await withFresh(p.fn,p.back);}catch(e){await p.back();throw e;}
 }
 if(a==='email-primary')return withFresh(async()=>{await PP.setPrimaryEmail(id);refreshAccount();toast(`主邮箱已改为 ${id}`);});
 if(a==='email-remove')return confirmModal('解绑这个邮箱？',`解绑后不能再用 <strong>${esc(id)}</strong> 登录这个账号；寄给它、还没签收的信，也要重新绑定后才能签收。已签收的信件和收藏不受影响。`,'确认解绑',async()=>{await PP.removeEmail(id);refreshAccount();toast(`已解绑 ${id}`);});
 if(a==='bind-resend')return sendBindCode(bindDraft.email);
 if(a==='bind-cancel'){bindDraft=null;return accountModal();}
 if(a==='password-set')return PP.account.hasPassword?passwordModal():withFresh(async()=>passwordModal());
 if(a==='password-forgot')return withFresh(async()=>passwordModal(),passwordModal);
 if(a==='password-remove')return confirmModal('移除登录密码？','移除后只能用邮箱验证码登录。已登录的设备不受影响。','移除密码',async()=>{await PP.removePassword();refreshAccount();toast('密码已移除，今后用邮箱验证码登录');});
 if(a==='sessions')return sessionsModal();
 if(a==='session-revoke')return withFresh(async()=>{const r=await PP.revokeSession(id);await sessionsModal(r.sessions);toast('该设备已下线');},()=>sessionsModal());
 if(a==='session-revoke-others')return confirmModal('下线其他所有设备？','除了你现在用的这台，其他登录着这个账号的浏览器都会立即退出，需要重新登录。','全部下线',async()=>{const r=await PP.revokeOtherSessions();await sessionsModal(r.sessions);toast(`已下线 ${r.revoked} 台其他设备`);},()=>sessionsModal());
 if(a==='detail')return detail(id,m);
 if(a==='claim')return requireLogin(async()=>{const asset=await PP.acquire(id);acquired(asset);});
 if(a==='checkout')return checkout(id,m);
 if(a==='my-free'){return requireLogin(async()=>{const free=PP.ownAssets('unused').find(a=>a.source==='free'&&PP.product(a.productId).type==='card');if(free)return await startCompose(free.id);return await chooseCard();});}
 if(a==='compose')return startCompose(id);
 if(a==='choose-card'||a==='use-stamp')return chooseCard();
 if(a==='select-stamp'){captureCompose();compose.stampAssetId=id;return composeModal();}
 if(a==='buy-stamp'){if(!development())throw new Error('付费邮票购买尚未开通。');captureCompose();storage.set('posterposta-draft',compose);return modal('为这封信，挑一枚当地邮票。',`<p class="modal-intro">来自${city(PP.state.location).name}的特色邮票。购买后自动贴上这封信，已经写好的寄语不会丢失。</p><div class="postcard-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${PP.cityProducts('stamp').map(p=>`<article class="postcard stamp-product"><button class="postcard-art" data-action="checkout-stamp" data-id="${p.id}" aria-label="购买${esc(p.title)}"><div class="stamp-large"><img src="${esc(p.img)}" alt="${esc(p.title)}"><span>${city(p.city).en}<b>${p.price}</b></span></div></button><div class="card-info"><h3>${esc(p.title)}</h3><span class="card-price">¥${p.price}</span></div></article>`).join('')}</div><div class="modal-actions"><button class="secondary" data-action="resume-compose">返回信件</button></div>`,false,'buy-stamp');}
 if(a==='checkout-stamp')return checkout(id,null,true);
 if(a==='save-draft'){captureCompose();if(storage.set('posterposta-draft',compose)){closeModal(true);toast('草稿已保存到当前账号的浏览器空间');}return;}
 if(a==='resume-compose')return composeModal();
 if(a==='send-letter'){
  if(activeModal?.kind!=='confirm-send'||!compose)throw new Error('请先填写寄语并确认寄送。');
  const l=await PP.sendLetter(compose);compose=null;storage.set('posterposta-draft',null);return sendSuccess(l);
 }
 if(a==='letter')return letterModal(id);
 if(a==='deliver')return await requireLogin(async()=>{const l=PP.state.letters.find(l=>l.id===id);if(!l||!l.sandbox||!isSender(l))throw new Error('只能模拟投递本人发出的沙盒信件。');await PP.markDelivered(id);render();letterModal(id);toast('已模拟投递，未发送邮件；收信人仍需独立验证并签收');});
 if(a==='thread')return threadModal(id);
 if(a==='consult')return consult(id);
 if(a==='asset-detail')return assetDetail(id);
 if(a==='list-asset')return listAssetModal(id);
 if(a==='unlist')return requireLogin(async()=>{await PP.unlistAsset(id);closeModal(true);render();toast('已下架，资产回到未使用收藏');});
 if(a==='create')return createModal();
 if(a==='review')return await requireLogin(async()=>{await PP.reviewCreation(id);render();toast('沙盒审核已通过，作品已上架服务器市集；不代表真实版权审核');});
 if(a==='email-preview')return emailPreview(id);
 if(a==='rules'||a==='creator-rules')return rulesModal();
 if(a==='how')return modal('把此刻，寄给远方。',`<div class="rules-list"><section class="rule-item"><h3>在你所在的城市，发现一张卡片</h3><p>第一张免费，连邮票也为你准备好了。每一座城市都有自己的风景，离开后，就只能在世界市集里再次遇见。</p></section><section class="rule-item"><h3>写下此刻，给那个想起的人</h3><p>选枚邮票，填入朋友的邮箱与所在城市。无需知道街道地址，就能寄去一份数字想念。</p></section><section class="rule-item"><h3>等一等，让距离有一点浪漫</h3><p>信件安排在 1–10 个工作日后处理，不保证送达时间。${development()?'开发沙盒不会发送邮件。':'对外发送提交后不可撤销。'}朋友通过正确邮箱验证并签收后，才可回复。</p></section></div><button class="primary full-width" data-action="close">去发现我的第一张 ${icon('arrow')}</button>`,false,'how');
 if(a==='demo')return demoModal();
 if(a==='settings')return settingsModal();
 if(a==='transactions')return transactionsModal();
 if(a==='logout'){await PP.logout();closeModal(true);syncIdentity();if(view==='claim')await loadClaim();else render();return toast('已退出，收藏与信件保留在服务器，可使用其他邮箱登录');}
 if(a==='report')return await requireLogin(async()=>reportModal(id));
}

document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');
 if(busy){if(el||e.target.closest('a'))e.preventDefault();return;}
 if(el&&!el.disabled){e.preventDefault();try{await withBusy(el,()=>action(el));}catch(err){error(err);}}
 else if(e.target.classList.contains('modal-backdrop'))closeModal();
});
document.addEventListener('submit',async e=>{
 e.preventDefault();const f=e.target;if(busy||!f.reportValidity())return;
 const data=new FormData(f),d=Object.fromEntries(data);
 try{await withBusy(f,async()=>{
  const alert=f.querySelector('.inline-error');if(alert){alert.textContent='';alert.classList.remove('show');}
  if(f.id==='login-form'){
   if(!data.has('consent'))throw new Error('请先阅读并确认数据与服务说明');
   try{await PP.register(d.email,loginNeedName?d.name:undefined,d.code);}
   catch(e){
    // 新邮箱：验证码没被消耗，补填昵称后用同一个验证码完成注册。
    if(e.code==='NAME_REQUIRED'&&!loginNeedName){loginNeedName=true;return loginModal({email:d.email,code:d.code,consent:true,note:'验证码正确。补一个昵称，就能完成注册。'});}
    throw e;
   }
   await finishLogin();
  }
  else if(f.id==='password-login-form'){await PP.passwordLogin(d.email,d.password);await finishLogin();}
  else if(f.id==='reauth-form'){
   await PP.reauthVerify(reauthMode==='code'?{code:d.code}:{password:d.password});
   const next=pendingReauth,back=reauthBack||accountModal;pendingReauth=null;reauthBack=null;
   toast(`身份已验证，${PP.config.auth?.reauthMinutes||15} 分钟内无需重复`);
   if(!next)return back();
   try{await next();}catch(e){await back();throw e;}
  }
  else if(f.id==='profile-form'){await PP.updateProfile(d.name);refreshAccount();toast('昵称已更新');}
  else if(f.id==='bind-form'){
   if(f.dataset.stage!=='verify')return await sendBindCode(d.email);
   const email=bindDraft.email;
   await withFresh(async()=>{
    await PP.bindVerify(email,d.code);bindDraft=null;
    if(view==='claim'){closeModal(true);await loadClaim();return toast(`已绑定 ${email}，已重新核对这封来信`);}
    refreshAccount();toast(`已绑定 ${email}，可以用它登录了`);
   });
  }
  else if(f.id==='password-form'){
   if(d.password!==d.confirm)throw new Error('两次输入的新密码不一致。');
   if(!/[A-Za-z]/.test(d.password)||!/\d/.test(d.password))throw new Error('密码须为 8–128 个字符，且同时包含字母和数字。');
   const had=PP.account.hasPassword;
   const save=async(current)=>{const r=await PP.setPassword(d.password,current);refreshAccount();toast(r.revokedSessions?`密码已${had?'更新':'设置'}，其他 ${r.revokedSessions} 台设备已下线`:had?'密码已更新':'密码已设置，下次可以用邮箱 + 密码登录');};
   if(d.currentPassword!==undefined)await save(d.currentPassword);
   else await withFresh(()=>save(),passwordModal);
  }
  else if(f.id==='purchase-form'){
   if(!development()||activeModal?.kind!=='checkout'||!data.has('sandboxConsent'))throw new Error('请在开发沙盒确认页明确同意后再测试购买。');
   await requireLogin(async()=>{const asset=await PP.acquire(f.dataset.id,f.dataset.market);if(f.dataset.resume&&compose){compose.stampAssetId=asset.id;render();composeModal();toast('沙盒邮票已保存到服务器，未扣款');}else acquired(asset);});
  }
  else if(f.id==='compose-form'){captureCompose();if(!compose.message.trim())throw new Error('先写一点想念吧');if(!compose.stampAssetId)throw new Error('请贴上一枚邮票');confirmSend();}
  else if(f.id==='letter-reply-form'){
   const id=f.dataset.id;
   await requireLogin(async()=>{const l=PP.state.letters.find(l=>l.id===id);if(!l||!canChat(l))throw new Error('收信人须先验证并签收，才能聊天。');await PP.reply(id,d.text);render();letterModal(id);toast('回复已保存到服务器');});
  }
  else if(f.id==='thread-reply-form'){const id=f.dataset.id;await requireLogin(async()=>{await PP.comment(id,d.text);render();threadModal(id);toast('消息已保存到服务器');});}
  else if(f.id==='consult-form'){await requireLogin(async()=>{const thread=await PP.startThread(f.dataset.id,d.message);render();threadModal(thread.id);toast('交流已保存到服务器，卖家刷新后可见');});}
  else if(f.id==='list-form'){await requireLogin(async()=>{await PP.listAsset(f.dataset.id,Number(d.price),d.description);closeModal(true);render();toast('已上架到服务器市集，资产暂时锁定');});}
  else if(f.id==='creation-form'){
   if(!creationImage)throw new Error('请先上传一张原创图片，并等待预览完成');
   await requireLogin(async()=>{await PP.createWork({...d,price:Number(d.price),img:creationImage,rights:data.has('rights')});closeModal(true);navigate('creator');toast('作品与图片已保存到服务器，当前待审核');});
  }
  else if(f.id==='report-form'){
   if(!PP.state.user)throw new Error('请先登录再保存本地反馈。');
   const list=storage.get('posterposta-reports',[]);list.push({target:f.dataset.id,reason:d.reason,message:d.message,createdAt:new Date().toISOString()});
   if(storage.set('posterposta-reports',list)){closeModal(true);toast('反馈已保存在当前账号的浏览器空间，尚未提交给客服');}
  }
 });}catch(err){error(err);}
});
let searchTimer;
document.addEventListener('input',e=>{
 if(e.target.id==='market-search'){marketSearch=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const start=e.target.selectionStart;render();const inp=$('#market-search');inp?.focus();inp?.setSelectionRange(start,start);},300);}
 if(e.target.matches('#login-form input[name="email"]')){$('#login-form').elements.code.value='';$('#otp-note').textContent='邮箱已更改，请为这个邮箱重新获取验证码。';delete cooldowns.login;tickCooldowns();}
 if(e.target.closest('#compose-form')){captureCompose();if($('#live-message'))$('#live-message').textContent=compose.message||'把今天遇见的风景，写给你。';if($('#live-to'))$('#live-to').textContent='TO '+(compose.toName||'那个想起的人');$('#word-count').textContent=compose.message.length+' / 500';storage.set('posterposta-draft',compose);}
});
document.addEventListener('change',async e=>{try{
 if(e.target.id==='market-city'){marketCity=e.target.value;render();}
 if(e.target.id==='market-sort'){marketSort=e.target.value;render();}
 if(e.target.id==='toCity'){captureCompose();$('#delivery-estimate').innerHTML=estimateHTML();}
 if(e.target.id==='art-upload'){
  const version=++uploadVersion;creationImage='';
  const file=e.target.files[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片，不支持 SVG');
  if(file.size>2*1024*1024)throw new Error('图片需小于 2 MB，请压缩后再上传');
  const result=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('图片读取失败'));r.readAsDataURL(file);});
  await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error('这份文件无法解码为图片'));img.src=result;});
  if(activeModal?.kind!=='create'||version!==uploadVersion)return;creationImage=result;$('#upload-preview').innerHTML=`<img src="${esc(result)}" alt="你的原创作品预览">`;$('#upload-preview').style.width='100%';
 }
 }catch(err){creationImage='';error(err);}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&activeModal&&!busy){e.preventDefault();closeModal();}
 if(e.key==='Tab'&&activeModal){const els=[...document.querySelectorAll('.modal button:not(:disabled),.modal input:not(:disabled),.modal select,.modal textarea,.modal a')].filter(el=>el.offsetParent!==null);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['postoffice','messages','market','profile','creator'].includes(v)){view=v;closeModal(true);render();}});
window.addEventListener('beforeunload',()=>{if(compose){captureCompose();storage.set('posterposta-draft',compose);}});
if(claimToken!==null)withBusy(null,loadClaim).catch(error);
else render();
})();
