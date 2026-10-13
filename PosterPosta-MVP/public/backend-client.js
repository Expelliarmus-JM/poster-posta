(() => {
'use strict';
let current;
let refreshing = null;
const namespace = 'posterposta-mvp';
function normalize(b) {
  const me = b.state.user?.id;
  for (const item of [...b.state.letters, ...b.state.community]) {
    for (const message of item.messages || []) if (message.authorId === me) message.author = '我';
  }
  return b;
}
async function request(url, body, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response, data;
  try {
    response = await fetch(url, {method: method || (body === undefined ? 'GET' : 'POST'), credentials:'same-origin', headers:body===undefined?{}:{'Content-Type':'application/json'}, body:body===undefined?undefined:JSON.stringify(body), signal:controller.signal});
    data = await response.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '请求超时。请先刷新核对操作是否已完成，勿重复提交。' : '暂时无法连接邮局服务，请确认后端已启动后重试。');
  } finally {clearTimeout(timer);}
  if (!response.ok || !data.ok) {const e = new Error(data.error || '请求未完成');e.code=data.code;throw e;}
  if(data.bootstrap) current=normalize(data.bootstrap);
  return data.result;
}
function call(name,...args){return request('/api/action',{name,args});}
window.PP = {
 get state(){return current.state;},get products(){return current.products;},get cities(){return current.cities;},get config(){return current.config;},
 namespace,
 product(id){const p=current.products.find(p=>p.id===id);if(!p)throw new Error('这件作品已不可用，请刷新后重试');return p;},
 ownAssets(status){return current.state.assets.filter(a=>!status||a.status===status);},
 cityProducts(type='card'){return current.products.filter(p=>p.city===current.state.location&&p.type===type&&!p.id.startsWith('work-'));},
 async refresh(){if(!refreshing) refreshing=request('/api/bootstrap').finally(()=>refreshing=null);await refreshing;return current;},
 get account(){return current.state.account;},
 requestCode(email){return request('/api/auth/request',{email});},
 // 昵称只在新邮箱注册时需要；已有账号登录时可不传，服务器返回 NAME_REQUIRED 再补填。
 register(email,name,code){return request('/api/auth/verify',name?{email,name,code}:{email,code});},
 passwordLogin(email,password){return request('/api/auth/password',{email,password});},
 logout(){return request('/api/auth/logout',{});},
 reauthRequest(){return request('/api/auth/reauth/request',{});},
 reauthVerify(input){return request('/api/auth/reauth/verify',input);},
 updateProfile(name){return request('/api/account/profile',{name});},
 setPassword(password,currentPassword){return request('/api/account/password',currentPassword===undefined?{password}:{password,currentPassword});},
 removePassword(){return request('/api/account/password/remove',{});},
 bindRequest(email){return request('/api/account/emails/request',{email});},
 bindVerify(email,code){return request('/api/account/emails/verify',{email,code});},
 setPrimaryEmail(email){return request('/api/account/emails/primary',{email});},
 removeEmail(email){return request('/api/account/emails/remove',{email});},
 sessions(){return request('/api/account/sessions');},
 revokeSession(id){return request('/api/account/sessions/revoke',{id});},
 revokeOtherSessions(){return request('/api/account/sessions/revoke',{others:true});},
 acquire(id,marketId){const p=this.product(id),m=current.state.market.find(m=>m.id===marketId);const paid=(m?.price??p.price)>0;return call(paid&&current.config.development?'sandboxPurchase':'acquire',id,...(marketId?[marketId]:[]));},
 deliveryEstimate(to){const from=current.cities[current.state.location],dest=current.cities[to];if(!from||!dest)throw new Error('请先确认寄信和收信城市');const r=x=>x*Math.PI/180;const a=Math.sin(r(dest.lat-from.lat)/2)**2+Math.cos(r(from.lat))*Math.cos(r(dest.lat))*Math.sin(r(dest.lng-from.lng)/2)**2;const distance=Math.round(6371*2*Math.asin(Math.sqrt(Math.min(1,a))));const [min,max]=distance<=1000?[1,3]:distance<=5000?[3,6]:[6,10];return {min,max,distance};},
 claimInfo(token){return request('/api/claim?token='+encodeURIComponent(token));},
 claim(token){return request('/api/claim',{token});}
};
for(const name of ['setLocation','sendLetter','markDelivered','reply','comment','startThread','listAsset','unlistAsset','createWork','reviewCreation','reset']) window.PP[name]=(...args)=>call(name,...args);
async function boot(){
 try{await window.PP.refresh();const script=document.createElement('script');script.src='app.js';document.body.appendChild(script);}
 catch(e){const root=document.getElementById('main');root.textContent='';const title=document.createElement('h1');title.textContent='小邮局暂时还没开门。';const msg=document.createElement('p');msg.textContent=e.message;msg.style.margin='20px 0';const button=document.createElement('button');button.className='primary';button.textContent='重新连接';button.onclick=()=>location.reload();root.append(title,msg,button);}
}
boot();
})();
