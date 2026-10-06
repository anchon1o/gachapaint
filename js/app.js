// =====================================================================
// Gachapaint · interface
// =====================================================================
const $ = id => document.getElementById(id);
const ICONS={pen:'icons/pen.png',line:'icons/line.png',rect:'icons/rect.png',ellipse:'icons/ellipse.png',fill:'icons/fill.png',
  eraser:'icons/eraser.png',undo:'icons/undo.png',smooth:'icons/smooth.png',zoom:'icons/zoom.png',clear:'icons/clear.png',
  center:'icons/center.svg',heart:'icons/heart.png',thumbdown:'icons/thumbdown.png',gallery:'icons/gallery.png'};
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let ME=null, POOL={started:false,goal:100,items:[]}, view='machine', busy=false;

/* ---------- cores por prezo (non por rareza) ---------- */
const TIERS=[
  {min:7510,c:'#22E3F2',dark:true},
  {min:3010,c:'#E0182D'},
  {min:1010,c:'#FFC21A',dark:true},
  {min:510, c:'#A335EE'},
  {min:210, c:'#0070DD'},
  {min:60,  c:'#1EBF3A'},
  {min:0,  c:'#F2F2F5',dark:true},
];
const tierIx = v => TIERS.findIndex(x=>v>=x.min);
const tier = v => TIERS[tierIx(v)];
function rangeLabel(i){ const x=TIERS[i], up=TIERS[i-1]; return up ? `${yen(x.min)}–${Number(up.min-10).toLocaleString(I18N[LANG].locale)}` : `${yen(x.min)}+`; }
function verdict(v){ return t(v===0?'v0':v<=50?'v1':v<=200?'v2':v<=500?'v3':v<=1000?'v4':v<=3000?'v5':v<=7500?'v6':'v7'); }

/* ---------- paleta: 8 familias × 4 tons ---------- */
const FAMILIES=[
  ['#FFFFFF','#BDBDC7','#6E6C7E','#000000'], ['#FFB3C7','#FF5A7A','#E0182D','#8A0F1E'],
  ['#FFD0A1','#FF9F1C','#E0670E','#9A3B05'], ['#FFF3A3','#FFD23F','#E0A800','#8F6A00'],
  ['#C4F5B0','#3DD68C','#1F9E4E','#0F5A2C'], ['#B5E2FF','#4DA8FF','#1F5FBF','#12245E'],
  ['#DCC8FF','#A56BFF','#6E2EC9','#3A1470'], ['#F6D7B8','#D9A06B','#8B5A2B','#4A2C12'],
];
const PALETTE=[0,1,2,3].flatMap(k=>FAMILIES.map(f=>f[k]));

/* ---------- utilidades ---------- */
let toastT;
function toast(m){ const el=$('toast'); el.textContent=m; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('on'),2600); }
function errToast(e){ const c=e&&e.code;
  toast(c==='network'||c==='upload'?t('eNet'):c==='store'?t('eStore'):c==='bad_code'?t('eBadCode'):c==='tanda_limit'?t('eTanda'):c==='full_target'?t('eFullTarget'):t('eGeneric')); }
/* ---------- son: ficheiros en sounds/ ; se non existen, pitidos sintéticos ---------- */
const SND={fx:true,music:true,cache:{},bg:null,started:false};
try{ SND.fx=localStorage.getItem('gachapaint.fx')!=='0'; SND.music=localStorage.getItem('gachapaint.music')!=='0'; }catch(e){}
const SOUNDS={crank:'sounds/crank.mp3',rattle:'sounds/rattle.mp3',drop:'sounds/drop.mp3',open:'sounds/open.mp3',
  low:'sounds/reveal-low.mp3',mid:'sounds/reveal-mid.mp3',high:'sounds/reveal-high.mp3',coin:'sounds/coin.mp3'};
const MUSIC='sounds/music.mp3';
for(const k in SOUNDS){ const a=new Audio(); const e={el:a,ok:false}; a.preload='auto';
  a.oncanplaythrough=()=>e.ok=true; a.onerror=()=>e.ok=false; a.src=SOUNDS[k]; SND.cache[k]=e; }
function sfx(name,fallback){
  if(!SND.fx) return; const e=SND.cache[name];
  if(e&&e.ok){ const c=e.el.cloneNode(); c.volume=.8; c.play().catch(()=>{}); } else if(fallback) fallback();
}
function startMusic(){
  if(!SND.music){ if(SND.bg) SND.bg.pause(); return; }
  if(!SND.bg){ SND.bg=new Audio(MUSIC); SND.bg.loop=true; SND.bg.volume=.25; SND.bg.onerror=()=>{ SND.bg=null; }; }
  SND.bg.play().catch(()=>{});
}
// os navegadores só deixan soar despois do primeiro toque
document.addEventListener('pointerdown',()=>{ if(!SND.started){ SND.started=true; startMusic(); } },{once:true});
let AC=null;
function beep(f=600,d=.05,type='square',vol=.05){
  try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); const o=AC.createOscillator(),g=AC.createGain();
    o.type=type;o.frequency.value=f;g.gain.value=vol;o.connect(g);g.connect(AC.destination);o.start();
    g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+d);o.stop(AC.currentTime+d); }catch(e){}
}
function openModal(html,lock){ $('sheet').innerHTML=html; $('modal').classList.add('on'); if(lock) $('modal').dataset.lock='1'; else delete $('modal').dataset.lock; }
function closeModal(){ $('modal').classList.remove('on'); delete $('modal').dataset.lock; }
$('modal').onclick=e=>{ if(e.target.id==='modal' && !$('modal').dataset.lock) closeModal(); };

/* ---------- idioma ---------- */
function applyStatic(){
  document.documentElement.lang=LANG;
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  $('crank').setAttribute('aria-label',t('aCrank')); $('mini').setAttribute('aria-label',t('aCapsule'));
  $('bigcap').setAttribute('aria-label',t('aCapsule')); $('setBtn').setAttribute('aria-label',t('aSettings'));
  $('langBtn').setAttribute('aria-label',t('aLang')); $('langBtn').innerHTML=FLAGS[LANG];
}
$('langBtn').onclick=()=>{
  openModal(`<h3>${t('langT')}</h3><div class="langs">${Object.keys(I18N).map(l=>
    `<button data-l="${l}" class="${l===LANG?'on':''}">${FLAGS[l]}${I18N[l].langName}</button>`).join('')}</div>`);
  $('sheet').querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{ setLang(b.dataset.l); closeModal(); applyStatic(); render(); });
};

/* ---------- navegación ---------- */
function go(v){
  view=v; document.querySelectorAll('.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  render(); window.scrollTo(0,0);
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.v));
function render(){
  if(!ME) return;
  $('streakChip').textContent='🔥 '+(ME.streak===1?t('days1'):t('daysN',{n:ME.streak}));
  if(view==='machine') renderMachine();
  if(view==='draw') renderDraw();
  if(view==='inv') renderInv();
  if(view==='rank') renderRank();
  if(view==='gal') renderGal();
}
async function refresh(){
  try{ const [m,p]=await Promise.all([api.me(),api.pool()]); const was=ME&&ME.started; ME=m; POOL=p;
    if(was===false && ME.started) toast(t('tStarted')); render(); showNews(); }
  catch(e){ if(e.code==='no_player') askName(); else errToast(e); }
}

let newsOpen=false;
function showNews(){
  if(newsOpen||!ME||!ME.events||!ME.events.length||$('modal').classList.contains('on')) return;
  newsOpen=true;
  const R={love:' ❤️',meh:' 😅'};
  openModal(`<h3>${t('newsT')}</h3><div class="rowlist">${ME.events.map(e=>`<div class="news">${esc(e.kind==='gift'?t('newsGift',{who:e.who,item:e.item}):e.kind==='rise'?t('newsRise',{item:e.item,v:yen(e.amount||0)}):e.kind==='fall'?t('newsFall',{item:e.item,v:yen(e.amount||0)}):t('newsTook',{who:e.who,item:e.item}))}${R[e.reaction]||''}</div>`).join('')}</div>
    <div class="stack"><button class="btn primary" id="newsOk">${t('ok')}</button></div>`);
  $('newsOk').onclick=()=>{ closeModal(); newsOpen=false; ME.events=[]; api.seen().catch(()=>{}); };
}

/* =================== MÁQUINA =================== */
const PH={balls:[],W:0,H:0,dpr:1,ctx:null,raf:0,shake:0};
function phSize(){
  const c=$('balls'), r=$('win').getBoundingClientRect(); if(!r.width) return false;
  PH.dpr=Math.min(2,window.devicePixelRatio||1); PH.W=r.width; PH.H=r.height;
  c.width=PH.W*PH.dpr; c.height=PH.H*PH.dpr; PH.ctx=c.getContext('2d'); return true;
}
function targetR(){ const n=Math.max(1,PH.balls.filter(b=>!b.out).length);
  return Math.max(6,Math.min(24,Math.sqrt(PH.W*PH.H*0.6/(n*Math.PI)))); }
function syncBalls(){
  if(!PH.W && !phSize()) return;
  const inPool=new Map(POOL.items.map(i=>[i.id,i])), have=new Set(PH.balls.map(b=>b.id));
  PH.balls=PH.balls.filter(b=>inPool.has(b.id)||b.keep);
  const tr=targetR(); let k=0;
  const MAXB=250; let count=PH.balls.length;
  POOL.items.forEach(it=>{ if(have.has(it.id)||count>=MAXB) return; count++;
    PH.balls.push({id:it.id,c:tier(it.value).c,r:tr,x:tr+Math.random()*(PH.W-2*tr),y:-tr-(k++)*tr*.9,vx:(Math.random()-.5)*2,vy:0,a:Math.random()*6.28}); });
  $('winEmpty').classList.toggle('on',!POOL.items.length && !PH.balls.length);
  if(!PH.raf) PH.raf=requestAnimationFrame(phLoop);
}
function phStep(){
  const B=PH.balls, W=PH.W, H=PH.H, tr=targetR();
  if(PH.shake>0){ PH.shake--; if(PH.shake%7===0) B.forEach(b=>{ if(!b.out && b.y>H*.35){ b.vy-=2+Math.random()*6; b.vx+=(Math.random()-.5)*7; } }); }
  for(const b of B){
    if(b.out){ b.x+=(W/2-b.x)*.18; b.y+=6+(b.y>H-b.r?6:0); b.r*=.985; b.a+=.3; continue; }
    b.r+=(tr-b.r)*.08; b.vy+=.32; b.vx*=.996; b.x+=b.vx; b.y+=b.vy;
    if(b.x<b.r){b.x=b.r;b.vx=-b.vx*.5} if(b.x>W-b.r){b.x=W-b.r;b.vx=-b.vx*.5}
    if(b.y>H-b.r){b.y=H-b.r;b.vy=-b.vy*.3;b.vx*=.9}
  }
  for(let it=0;it<3;it++) for(let i=0;i<B.length;i++){ const p=B[i]; if(p.out) continue;
    for(let j=i+1;j<B.length;j++){ const q=B[j]; if(q.out) continue;
      const dx=q.x-p.x, dy=q.y-p.y, m=p.r+q.r, d2=dx*dx+dy*dy; if(d2>=m*m||d2===0) continue;
      const d=Math.sqrt(d2), nx=dx/d, ny=dy/d, o=(m-d)/2;
      p.x-=nx*o; p.y-=ny*o; q.x+=nx*o; q.y+=ny*o;
      const rv=(q.vx-p.vx)*nx+(q.vy-p.vy)*ny;
      if(rv<0){ const im=-1.35*rv/2; p.vx-=im*nx; p.vy-=im*ny; q.vx+=im*nx; q.vy+=im*ny; }
    } }
  for(const b of B) if(!b.out) b.a+=b.vx/b.r;
  PH.balls=B.filter(b=>!(b.out && b.y>H+b.r*2));
}
function phDraw(){
  const x=PH.ctx, d=PH.dpr; x.setTransform(d,0,0,d,0,0); x.clearRect(0,0,PH.W,PH.H);
  for(const b of PH.balls){
    x.save(); x.translate(b.x,b.y); x.rotate(b.a);
    x.beginPath(); x.arc(0,0,b.r,Math.PI,0); x.closePath(); x.fillStyle=b.c; x.fill();
    x.beginPath(); x.arc(0,0,b.r,0,Math.PI); x.closePath(); x.fillStyle='#DCE3F2'; x.fill();
    x.lineWidth=Math.max(1.6,b.r*.16); x.strokeStyle='#231C5C';
    x.beginPath(); x.moveTo(-b.r,0); x.lineTo(b.r,0); x.stroke();
    x.beginPath(); x.arc(0,0,b.r,0,Math.PI*2); x.stroke(); x.restore();
    x.fillStyle='rgba(255,255,255,.75)'; x.beginPath(); x.ellipse(b.x-b.r*.38,b.y-b.r*.42,b.r*.26,b.r*.15,-.5,0,Math.PI*2); x.fill();
  }
}
function phLoop(){
  if(view!=='machine'||document.hidden){ PH.raf=0; return; }
  phStep(); phDraw(); PH.raf=requestAnimationFrame(phLoop);
}
window.addEventListener('resize',()=>{ const oW=PH.W; if(phSize() && oW){ const k=PH.W/oW; PH.balls.forEach(b=>b.x*=k); } });
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && view==='machine' && !PH.raf) PH.raf=requestAnimationFrame(phLoop); });
$('win').onclick=()=>{ PH.shake=Math.max(PH.shake,14); };

function renderMachine(){
  syncBalls();
  const left=ME.pulls_left; let L='';
  for(let i=0;i<3;i++) L+=`<span class="lamp ${i<left?'on':''}"></span>`;
  $('lamps').innerHTML=L;
  document.querySelectorAll('.coin').forEach(c=>c.classList.toggle('on',+c.dataset.b===ME.budget));
  const crank=$('crank'), mini=$('mini');
  const canPull=!busy && !ME.pending && left>0 && POOL.items.length>0;
  crank.disabled=!canPull; crank.classList.toggle('ready',canPull);
  if(ME.pending && !busy){ mini.style.setProperty('--c',tier(ME.pending.value).c); if(!mini.classList.contains('show')) mini.classList.add('show','wait'); }
  else if(!busy) mini.classList.remove('show','wait');
  $('marqText').textContent = ME.started ? t('tagline') : t('filling',{n:POOL.items.length,g:ME.goal});
  let st;
  if(!ME.started){
    st=`<strong>${t('stFillT')}</strong>${t('stFillB',{g:ME.goal,n:Math.max(0,ME.goal-POOL.items.length)})}
      <div class="bar" style="max-width:300px;margin:12px auto;background:var(--panel)"><span style="width:${Math.min(100,POOL.items.length/ME.goal*100)}%;background:var(--green)"></span></div>
      <button class="btn primary" onclick="go('draw')">${t('btnDrawObjs')}</button>`;
  }
  else if(ME.pending) st=`<strong>${t('stPendT')}</strong>${t('stPendB')}`;
  else if(!ME.drew_today) st=`<strong>${t('stNeedT')}</strong>${t('stNeedB',{b:yen(ME.budget)})}<div style="margin-top:12px"><button class="btn primary" onclick="go('draw')">${t('btnGoDraw')}</button></div>`;
  else if(!POOL.items.length) st=`<strong>${t('stEmptyT')}</strong>${t('stEmptyB')}`;
  else if(left>0) st=`<strong>${left===1?t('stLeft1'):t('stLeftN',{n:left})}</strong>${t('stLeftB')}`;
  else st=`<strong>${t('stDoneT')}</strong>${t('stDoneB')}`;
  if(!api.online) st+=`<br><span class="offline">${t('offline')}</span>`;
  $('status').innerHTML=st;
  $('poolcount').textContent=POOL.items.length===1?t('pool1'):t('poolN',{n:POOL.items.length});
  $('legend').innerHTML=TIERS.map((x,i)=>({x,i})).reverse().map(({x,i})=>`<span><i style="--c:${x.c}"></i>${rangeLabel(i)}</span>`).join('');
}
let rot=0;
$('crank').onclick=async()=>{
  if(busy||!ME||ME.pending||ME.pulls_left<=0||!POOL.items.length) return;
  busy=true; const t0=Date.now();
  rot+=360; $('crank').style.transform=`rotate(${rot}deg)`; $('crank').classList.remove('ready');
  sfx('crank',()=>[0,180,360,540,720,900].forEach((ms,i)=>setTimeout(()=>beep(300+i*40,.04),ms)));
  setTimeout(()=>sfx('rattle'),150);
  PH.shake=60;
  let item;
  try{ item=await api.pull(); }
  catch(e){ busy=false; PH.shake=0; if(e.code==='network') toast(t('eNetPull')); else errToast(e); return refresh(); }
  POOL.items=POOL.items.filter(x=>x.id!==item.id); ME.pending=item; ME.pulls_left--;
  new Image().src=imgSrc(item.img); // só se descarga a imaxe da bola que saíu
  const ball=PH.balls.find(b=>b.id===item.id); if(ball) ball.keep=true;
  setTimeout(()=>{
    if(ball) ball.out=true;
    setTimeout(()=>{ busy=false; const m=$('mini'); m.classList.remove('show','wait'); void m.offsetWidth; sfx('drop',()=>beep(180,.12,'sine',.12)); renderMachine(); },420);
  },Math.max(0,850-(Date.now()-t0)));
};
$('mini').onclick=openReveal;

/* ---------- apertura ---------- */
let revealState='closed';
function openReveal(){
  if(!ME.pending) return;
  const it=ME.pending, st=$('stage'), ix=tierIx(it.value), T=TIERS[ix];
  st.className='stage'; revealState='closed';
  st.style.setProperty('--tier',T.c); st.style.setProperty('--tierText',T.dark?'#231C5C':'#fff');
  $('capTop').style.setProperty('--c',T.c);
  $('tBand').textContent=rangeLabel(ix);
  $('tImg').src=imgSrc(it.img); $('tImg').alt=it.name;
  $('tName').textContent=it.name; $('tPrice').textContent=yen(it.value);
  $('tAuthor').textContent=it.mine?t('byYou'):t('by',{a:it.author});
  $('tVerdict').textContent=it.mine?t('vOwn'):verdict(it.value);
  $('reacts').innerHTML=it.mine?'':['love','meh'].map(r=>`<button class="react" data-r="${r}">${t(r)}</button>`).join('');
  $('reacts').querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{
    $('reacts').querySelectorAll('.react').forEach(x=>x.classList.toggle('on',x===b)); api.react(it.id,b.dataset.r).catch(()=>{}); });
  $('shareBtn').textContent=t('share'); $('shareBtn').onclick=()=>shareItem(it);
  const rb=$('reportBtn'); rb.textContent=t('report'); delete rb.dataset.sure; rb.style.display=it.mine?'none':'';
  rb.onclick=async()=>{
    if(!rb.dataset.sure){ rb.dataset.sure='1'; rb.textContent=t('reportSure'); return; }
    try{ ME=await api.report(it.id); POOL=await api.pool(); $('reveal').classList.remove('on'); toast(t('reported')); render(); }catch(e){ errToast(e); }
  };
  $('reveal').classList.add('on');
}
$('bigcap').onclick=()=>{
  if(revealState!=='closed') return;
  revealState='opening'; const st=$('stage'); st.classList.add('shaking');
  sfx('open',()=>[0,120,240,360].forEach((ms,i)=>setTimeout(()=>beep(500+i*90,.05,'triangle'),ms)));
  const v=ME.pending?ME.pending.value:0, lvl=v<=50?'low':v<=1000?'mid':'high';
  setTimeout(()=>{ st.classList.remove('shaking'); st.classList.add('open'); revealState='open';
    sfx(lvl,()=>{ if(lvl==='low'){ beep(400,.15,'sine',.08); setTimeout(()=>beep(300,.25,'sine',.08),160); }
      else { beep(880,.08,'sine',.08); setTimeout(()=>beep(1320,.15,'sine',.08),90); if(lvl==='high') setTimeout(()=>beep(1760,.25,'sine',.08),220); } }); },560);
};
$('keepBtn').onclick=async()=>{
  if(!ME.pending || busy) return;
  $('reveal').classList.remove('on');
  if(ME.inventory.length>=ME.capacity) return chooseRelease();
  try{ ME=await api.keep(null); toast(t('tSaved')); render(); }catch(e){ errToast(e); refresh(); }
};
function chooseRelease(){
  const nw=ME.pending, all=[nw,...ME.inventory];
  openModal(`<h3>${t('fullT')}</h3><p class="sub">${t('fullB',{c:ME.capacity})}</p>
    <div class="rowlist">${all.map(it=>`<div class="rowitem ${it.id===nw.id?'new':''}"><img src="${imgSrc(it.img)}" alt="" loading="lazy">
    <div><b>${esc(it.name)}</b><br>${yen(it.value)}${it.id===nw.id?' · '+t('isNew'):''}</div><button class="btn small" data-rel="${it.id}">${t('release')}</button></div>`).join('')}</div>`,true);
  $('sheet').querySelectorAll('[data-rel]').forEach(b=>b.onclick=async()=>{
    const it=all.find(x=>x.id===b.dataset.rel);
    try{ ME=await api.keep(it.id); POOL=await api.pool(); closeModal(); toast(t('tReturned',{n:it.name})); render(); }
    catch(e){ errToast(e); }
  });
}

/* ---------- compartir un premio como imaxe ---------- */
async function shareItem(it){
  try{
    const c=document.createElement('canvas'); c.width=600; c.height=760; const x=c.getContext('2d'), T=tier(it.value);
    x.fillStyle='#FFD23F'; x.fillRect(0,0,600,760);
    x.fillStyle='#FFFDF6'; x.strokeStyle='#231C5C'; x.lineWidth=10;
    x.beginPath(); x.roundRect?x.roundRect(40,40,520,680,30):x.rect(40,40,520,680); x.fill(); x.stroke();
    x.fillStyle=T.c; x.fillRect(45,45,510,24);
    const im=new Image(); im.crossOrigin='anonymous';
    await new Promise((ok,ko)=>{ im.onload=ok; im.onerror=ko; im.src=imgSrc(it.img); });
    x.drawImage(im,130,90,340,340);
    x.fillStyle='#231C5C'; x.textAlign='center';
    x.font='700 34px "Chakra Petch",sans-serif'; x.fillText(it.name,300,480,480);
    x.font='900 72px Orbitron,sans-serif'; x.fillText(yen(it.value),300,570);
    x.font='600 24px "Chakra Petch",sans-serif'; x.fillText(it.mine?t('byYou'):t('by',{a:it.author}),300,620,480);
    x.font='900 26px Orbitron,sans-serif'; x.fillText('Gachapaint',300,690);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    const file=new File([blob],'gachapaint.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})) await navigator.share({files:[file],text:t('shareText')+' '+location.origin});
    else { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gachapaint.png'; a.click(); }
  }catch(e){ if(e&&e.name!=='AbortError') toast(t('eGeneric')); }
}

/* =================== DEBUXAR =================== */
let cur=0, tool='pen', size=8, color='#231C5C', undo=[], pad, pctx, drawing=false, last=null, DRAFT=null;
let smooth=(()=>{ try{ return localStorage.getItem('gachapaint.smooth')!=='0'; }catch(e){ return true; } })();
let zoom={s:1,x:0,y:0};
function clampZoom(){ const W=pad.parentElement.clientWidth;
  zoom.s=Math.min(6,Math.max(1,zoom.s)); zoom.x=Math.min(0,Math.max(W-W*zoom.s,zoom.x)); zoom.y=Math.min(0,Math.max(W-W*zoom.s,zoom.y)); }
function applyZoom(){ if(!pad) return; clampZoom(); pad.style.transform=`translate(${zoom.x}px,${zoom.y}px) scale(${zoom.s})`;
  const b=$('zoomBtn'); if(b) b.classList.toggle('on',zoom.s>1.01); }
const DKEY='gachapaint.draft';
function draft(){
  if(!DRAFT){ try{ DRAFT=JSON.parse(localStorage.getItem(DKEY)); }catch(e){} }
  if(!DRAFT||!DRAFT.slots) DRAFT={slots:[0,1,2].map(()=>({img:null,strokes:0,name:'',price:''}))};
  return DRAFT;
}
function saveDraft(){ try{ localStorage.setItem(DKEY,JSON.stringify(DRAFT)); }catch(e){} }
const canDraw=()=>ME.started?!ME.drew_today:(ME.tandas_left==null||ME.tandas_left>0);
function weekTheme(){ const d=new Date(), y=new Date(d.getFullYear(),0,1), w=Math.floor((d-y)/604800000); const th=t('themes'); return th[w%th.length]; }
function renderDraw(){
  const v=$('v-draw');
  if(!canDraw()){ v.innerHTML=`<h2>${t('doneT')}</h2><p class="sub">${ME.started?t('doneB'):t('eTanda')}</p><button class="btn primary" onclick="go('machine')">${t('goMachine')}</button>`; return; }
  const b=ME.budget, ns=ME.next_streak;
  v.innerHTML=`<div class="drawhead"><h2>${t('drawT')}</h2><span class="budgettag">${yen(b)}</span><button class="helpbtn" id="helpBtn" aria-label="${esc(t('manualT'))}">?</button></div>
    <p class="theme">${t('themeT',{t:esc(weekTheme())})}</p>
    <div class="slots" id="slots"></div>
    <div class="padwrap"><canvas id="pad" width="256" height="256" aria-label="${t('aPad')}"></canvas></div>
    <div class="tools" id="tools"></div>
    <div class="palette" id="palette"></div>
    <div class="fields">
      <label class="f">${t('fName')}<input id="fName" maxlength="40" placeholder="${esc(t('fNamePh'))}"></label>
      <label class="f">${t('fPrice')}<input id="fPrice" type="number" inputmode="numeric" min="0" max="${b}" step="10" placeholder="0"></label>
    </div>
    <label class="pubchk"><input type="checkbox" id="fPub"> ${t('pubChk')}</label>
    <div class="meter"><div class="mtext" id="mText"></div><div class="bar" id="bar"></div><div id="mSub" style="font-size:13px;color:var(--muted)"></div></div>
    <div class="submit"><button class="btn primary" id="submitBtn">${t('submit')}</button></div>
    <div class="drawinfo"><p class="sub">${t('drawB',{b:yen(b)})}</p>
    ${b>100?`<div class="banner">${t('streakBanner',{n:ns,b:yen(b)})}</div>`:''}
    ${!ME.started?`<div class="banner">${t('fillBanner',{n:POOL.items.length,g:ME.goal})} ${ME.tandas_left!=null?t('tandaLeft',{n:ME.tandas_left}):''}</div>`:''}</div>`;
  pad=$('pad'); pctx=pad.getContext('2d',{willReadFrequently:true}); pctx.lineCap='round'; pctx.lineJoin='round';
  loadSlot(cur);
  const T=$('tools');
  const IK={tPen:'pen',tLine:'line',tRect:'rect',tCircle:'ellipse',tFill:'fill',tEraser:'eraser',tUndo:'undo',tSmooth:'smooth',tZoom:'zoom'};
  const lab=key=>{ const s=t(key), i=s.indexOf(' '); return `<img class="ti" src="${ICONS[IK[key]]}" alt=""><span class="tl">${s.slice(i+1)}</span>`; };
  const tl=key=>esc(t(key).slice(t(key).indexOf(' ')+1));
  T.innerHTML=[['pen','tPen'],['line','tLine'],['rect','tRect'],['ellipse','tCircle'],['fill','tFill'],['eraser','tEraser']]
      .map(([k,l])=>`<button class="tool ${tool===k?'on':''}" data-t="${k}" aria-label="${tl(l)}">${lab(l)}</button>`).join('')
    + `<button class="tool" id="undoBtn" aria-label="${tl('tUndo')}">${lab('tUndo')}</button>`
    + `<button class="tool" id="centerBtn" aria-label="${tl('tCenter')}"><img class="ti" src="${ICONS.center}" alt=""></button>`
    + [3,8,16,30].map(s=>`<button class="tool ${size===s?'on':''}" data-s="${s}" aria-label="${t('aSize',{n:s})}"><span class="dotsz" style="width:${Math.max(5,s*.7)}px;height:${Math.max(5,s*.7)}px"></span></button>`).join('')
    + `<button class="tool ${smooth?'on':''}" id="smoothBtn" aria-label="${tl('tSmooth')}" aria-pressed="${smooth}">${lab('tSmooth')}</button>`
    + `<button class="tool" id="zoomBtn" aria-label="${tl('tZoom')}">${lab('tZoom')}</button>`
    + `<button class="tool" id="clearBtn" aria-label="${esc(t('tClear'))}"><img class="ti" src="${ICONS.clear}" alt=""><span class="tl">${t('tClear')}</span></button>`;
  T.querySelectorAll('[data-t]').forEach(x=>x.onclick=()=>{tool=x.dataset.t;renderTools();});
  T.querySelectorAll('[data-s]').forEach(x=>x.onclick=()=>{size=+x.dataset.s;renderTools();});
  $('smoothBtn').onclick=()=>{ smooth=!smooth; try{localStorage.setItem('gachapaint.smooth',smooth?'1':'0');}catch(e){}
    $('smoothBtn').classList.toggle('on',smooth); $('smoothBtn').setAttribute('aria-pressed',smooth); };
  $('zoomBtn').onclick=()=>{ zoom={s:1,x:0,y:0}; applyZoom(); };
  T.querySelectorAll('.tool').forEach(x=>x.title=x.getAttribute('aria-label')||'');
  $('helpBtn').onclick=toolManual;
  $('centerBtn').onclick=centerDrawing;
  $('undoBtn').onclick=()=>{ if(!undo.length) return; pctx.putImageData(undo.pop(),0,0); commit(-1); };
  $('clearBtn').onclick=()=>{ undo.push(pctx.getImageData(0,0,256,256)); pctx.clearRect(0,0,256,256); const s=draft().slots[cur]; s.strokes=0; s.img=null; saveDraft(); renderSlots(); };
  $('palette').innerHTML=PALETTE.map(c=>`<button class="sw ${c===color?'on':''}" style="background:${c}" data-c="${c}" aria-label="${t('aColor',{n:c})}"></button>`).join('');
  $('palette').querySelectorAll('.sw').forEach(x=>x.onclick=()=>{color=x.dataset.c; if(tool==='eraser') tool='pen'; renderTools();});
  $('fName').oninput=e=>{draft().slots[cur].name=e.target.value;saveDraft();renderSlots();renderMeter();};
  $('fPrice').oninput=e=>{draft().slots[cur].price=e.target.value;saveDraft();renderMeter();renderSlots();};
  $('fPub').onchange=e=>{draft().slots[cur].pub=e.target.checked;saveDraft();};
  $('submitBtn').onclick=submitDrawings;
  bindPad(); applyZoom(); renderSlots(); renderMeter();
}
function renderTools(){
  document.querySelectorAll('#tools [data-t]').forEach(x=>x.classList.toggle('on',x.dataset.t===tool));
  document.querySelectorAll('#tools [data-s]').forEach(x=>x.classList.toggle('on',+x.dataset.s===size));
  document.querySelectorAll('#palette .sw').forEach(x=>x.classList.toggle('on',x.dataset.c===color && tool!=='eraser'));
}
function renderSlots(){
  $('slots').innerHTML=draft().slots.map((s,i)=>{
    const ok=s.strokes>0 && s.name.trim() && s.price!=='';
    return `<button class="slot ${i===cur?'on':''}" data-i="${i}">${s.img?`<img alt="" src="${s.img}">`:'<span class="ph"></span>'}
      <b class="sn">${i+1}</b><span class="sl">${t('slot',{i:i+1})}</span>${ok?' <span class="ok">✓</span>':''}</button>`;}).join('');
  $('slots').querySelectorAll('.slot').forEach(x=>x.onclick=()=>{ if(+x.dataset.i===cur) return; cur=+x.dataset.i; loadSlot(cur); renderSlots(); });
}
function loadSlot(i){
  const s=draft().slots[i]; undo=[]; pctx.clearRect(0,0,256,256);
  if(s.img){ const im=new Image(); im.onload=()=>pctx.drawImage(im,0,0); im.src=s.img; }
  $('fName').value=s.name; $('fPrice').value=s.price; $('fPub').checked=s.pub!==false;
}
function commit(delta=1){ const s=draft().slots[cur]; s.strokes=Math.max(0,s.strokes+delta); s.img=canvasToImg(pad); saveDraft(); renderSlots(); }
// Liñas, rectángulos e círculos: se case é un cadrado/círculo ou unha liña recta, axústase só
function drawShape(a,b){
  let w=b[0]-a[0], h=b[1]-a[1];
  pctx.globalCompositeOperation='source-over'; pctx.strokeStyle=color; pctx.lineWidth=size; pctx.beginPath();
  if(tool==='line'){
    const L=Math.hypot(w,h), ang=Math.atan2(h,w), st=Math.PI/4, sn=Math.round(ang/st)*st;
    const g=Math.abs(ang-sn)<0.12?sn:ang; pctx.moveTo(a[0],a[1]); pctx.lineTo(a[0]+L*Math.cos(g),a[1]+L*Math.sin(g));
  } else {
    const m=Math.max(Math.abs(w),Math.abs(h));
    if(Math.abs(Math.abs(w)-Math.abs(h))<0.15*m){ w=Math.sign(w||1)*m; h=Math.sign(h||1)*m; }
    if(tool==='rect') pctx.rect(a[0],a[1],w,h);
    else pctx.ellipse(a[0]+w/2,a[1]+h/2,Math.abs(w)/2,Math.abs(h)/2,0,0,Math.PI*2);
  }
  pctx.stroke();
}
function bindPad(){
  const wrap=pad.parentElement, pts=new Map();
  let mode=null, snap=null, start=null, curP=null, target=null, g=null;
  const toCanvas=e=>{ const r=pad.getBoundingClientRect(); return [(e.clientX-r.left)*256/r.width,(e.clientY-r.top)*256/r.height]; };
  const local=e=>{ const r=wrap.getBoundingClientRect(); return [e.clientX-r.left-wrap.clientLeft,e.clientY-r.top-wrap.clientTop]; };
  const seg=()=>{ pctx.beginPath(); pctx.moveTo(last[0],last[1]); pctx.lineTo(curP[0],curP[1]); pctx.stroke(); last=curP.slice(); };
  const cancelStroke=()=>{ if(mode==='draw'||mode==='shape'){ pctx.globalCompositeOperation='source-over'; if(undo.length) pctx.putImageData(undo.pop(),0,0); } };
  pad.onpointerdown=e=>{
    e.preventDefault(); pts.set(e.pointerId,local(e));
    if(pts.size===2){ // dous dedos: zoom e desprazamento, nunca pintar
      cancelStroke(); mode='gesture'; const [a,b]=[...pts.values()];
      g={d:Math.hypot(a[0]-b[0],a[1]-b[1])||1,m:[(a[0]+b[0])/2,(a[1]+b[1])/2],s:zoom.s,x:zoom.x,y:zoom.y}; return; }
    if(pts.size>2||mode==='gesture') return;
    pad.setPointerCapture(e.pointerId);
    undo.push(pctx.getImageData(0,0,256,256)); if(undo.length>25) undo.shift();
    const p=toCanvas(e);
    if(tool==='fill'){ flood(Math.max(0,Math.min(255,Math.floor(p[0]))),Math.max(0,Math.min(255,Math.floor(p[1]))),color); commit(); return; }
    if(tool==='line'||tool==='rect'||tool==='ellipse'){ mode='shape'; snap=undo[undo.length-1]; start=p; return; }
    mode='draw'; curP=p.slice(); last=p.slice(); target=p;
    pctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';
    pctx.strokeStyle=tool==='eraser'?'#000':color; pctx.lineWidth=size;
    pctx.beginPath(); pctx.moveTo(p[0],p[1]); pctx.lineTo(p[0]+.01,p[1]); pctx.stroke();
  };
  pad.onpointermove=e=>{
    if(pts.has(e.pointerId)) pts.set(e.pointerId,local(e));
    if(mode==='gesture'){
      if(pts.size<2) return; const [a,b]=[...pts.values()];
      const d=Math.hypot(a[0]-b[0],a[1]-b[1]), m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      const ns=Math.min(6,Math.max(1,g.s*d/g.d)), cx=(g.m[0]-g.x)/g.s, cy=(g.m[1]-g.y)/g.s;
      zoom={s:ns,x:m[0]-cx*ns,y:m[1]-cy*ns}; applyZoom(); return;
    }
    if(mode==='draw'){
      // suavizado: o pincel segue o dedo "con goma", así as curvas saen limpas
      const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];
      for(const ev of (evs.length?evs:[e])){
        target=toCanvas(ev); const k=smooth?0.3:1;
        curP[0]+=(target[0]-curP[0])*k; curP[1]+=(target[1]-curP[1])*k; seg();
      }
      return;
    }
    if(mode==='shape'){ pctx.putImageData(snap,0,0); drawShape(start,toCanvas(e)); }
  };
  const end=e=>{
    pts.delete(e.pointerId);
    if(mode==='draw'){
      if(smooth&&target){ for(let i=0;i<12;i++){ curP[0]+=(target[0]-curP[0])*.35; curP[1]+=(target[1]-curP[1])*.35; seg(); } }
      pctx.globalCompositeOperation='source-over'; mode=null; commit();
    } else if(mode==='shape'){ mode=null; commit(); }
    else if(mode==='gesture' && !pts.size) mode=null;
  };
  pad.onpointerup=end; pad.onpointercancel=end; pad.onlostpointercapture=end;
  // no ordenador: roda do rato para facer zoom
  pad.onwheel=e=>{ e.preventDefault(); const [mx,my]=local(e), ns=Math.min(6,Math.max(1,zoom.s*(e.deltaY<0?1.15:1/1.15)));
    const cx=(mx-zoom.x)/zoom.s, cy=(my-zoom.y)/zoom.s; zoom={s:ns,x:mx-cx*ns,y:my-cy*ns}; applyZoom(); };
}
// Recheo que non deixa ocos: enche a zona e despois pinta 2 px "por debaixo" do contorno
function flood(x,y,hex){
  const img=pctx.getImageData(0,0,256,256), d=img.data, W=256, N=W*W;
  const n=parseInt(hex.slice(1),16), fr=n>>16&255, fg=n>>8&255, fb=n&255;
  const i0=(y*W+x)*4, tr=d[i0], tg=d[i0+1], tb=d[i0+2], ta=d[i0+3];
  if(ta>250 && Math.abs(tr-fr)+Math.abs(tg-fg)+Math.abs(tb-fb)<10) return;
  const match=i=> ta<20 ? d[i+3]<60 : d[i+3]>200 && Math.abs(d[i]-tr)+Math.abs(d[i+1]-tg)+Math.abs(d[i+2]-tb)<90;
  const mask=new Uint8Array(N), st=[y*W+x];
  while(st.length){ const k=st.pop(); if(mask[k]||!match(k*4)) continue; mask[k]=1; const px=k%W;
    if(px>0) st.push(k-1); if(px<W-1) st.push(k+1); if(k>=W) st.push(k-W); if(k<N-W) st.push(k+W); }
  let grow=mask;
  for(let pass=0;pass<2;pass++){ const g=new Uint8Array(grow);
    for(let k=0;k<N;k++){ if(grow[k]) continue; const px=k%W;
      if((px>0&&grow[k-1])||(px<W-1&&grow[k+1])||(k>=W&&grow[k-W])||(k<N-W&&grow[k+W])) g[k]=2; }
    grow=g; }
  for(let k=0;k<N;k++){ const i=k*4;
    if(mask[k]){ d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255; }
    else if(grow[k]){ const a=d[i+3]/255; d[i]=Math.round(d[i]*a+fr*(1-a)); d[i+1]=Math.round(d[i+1]*a+fg*(1-a)); d[i+2]=Math.round(d[i+2]*a+fb*(1-a)); d[i+3]=255; } }
  pctx.putImageData(img,0,0);
}
function renderMeter(){
  const b=ME.budget, vals=draft().slots.map(s=>Math.max(0,parseInt(s.price)||0)), sum=vals.reduce((a,c)=>a+c,0), diff=b-sum;
  const cols=['#FF7AB6','#4DA8FF','#3DD68C'];
  $('bar').innerHTML=vals.map((v,i)=>`<span style="width:${Math.min(100,v/b*100)}%;background:${cols[i]}"></span>`).join('');
  const el=$('mText'); el.className='mtext '+(diff===0?'good':diff<0?'bad':'');
  el.textContent=diff===0?t('mPerfect',{b:yen(b)}):diff>0?t('mLeft',{x:yen(diff)}):t('mOver',{x:yen(-diff)});
  $('mSub').textContent=draft().slots.map((s,i)=>`${s.name.trim()||t('slot',{i:i+1})}: ${yen(vals[i])}`).join('  ·  ');
}
async function submitDrawings(){
  const D=draft(), b=ME.budget;
  for(let i=0;i<3;i++){ const s=D.slots[i];
    if(!s.strokes){ cur=i; renderDraw(); return toast(t('eDraw',{i:i+1})); }
    if(!s.name.trim()){ cur=i; renderDraw(); return toast(t('eName',{i:i+1})); }
    if(s.price===''||!Number.isInteger(+s.price)||+s.price<0||+s.price%10){ cur=i; renderDraw(); return toast(t('ePrice',{i:i+1})); } }
  const sum=D.slots.reduce((a,s)=>a+(+s.price),0);
  if(sum!==b) return toast(sum<b?t('eLeft',{x:yen(b-sum)}):t('eOver',{x:yen(sum-b)}));
  const btn=$('submitBtn'); btn.disabled=true;
  try{
    const was=ME.started;
    ME=await api.submit(D.slots.map(s=>({name:s.name.trim().slice(0,40),value:+s.price,img:s.img,public:s.pub!==false})));
    POOL=await api.pool();
    DRAFT=null; try{localStorage.removeItem(DKEY);}catch(e){} cur=0;
    sfx('coin'); toast(!was&&ME.started?t('tStarted'):t('tSubmitted')); go('machine');
  }catch(e){ btn.disabled=false; errToast(e); refresh(); }
}

// centrar: busca onde hai debuxo e móveo ao medio do lenzo
function centerDrawing(){
  const d=pctx.getImageData(0,0,256,256).data; let x0=256,y0=256,x1=-1,y1=-1;
  for(let y=0;y<256;y++) for(let x=0;x<256;x++) if(d[(y*256+x)*4+3]>8){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  if(x1<0) return;
  const dx=Math.round((256-(x1+x0+1))/2), dy=Math.round((256-(y1+y0+1))/2); if(!dx&&!dy) return;
  undo.push(pctx.getImageData(0,0,256,256)); if(undo.length>25) undo.shift();
  const tmp=document.createElement('canvas'); tmp.width=tmp.height=256; tmp.getContext('2d').drawImage(pad,0,0);
  pctx.clearRect(0,0,256,256); pctx.drawImage(tmp,dx,dy); commit();
}
const fmtCode=c=>c?String(c).match(/.{1,3}/g).join('-'):'';
function toolManual(){
  const rows=[['pen','hPen'],['line','hLine'],['rect','hRect'],['ellipse','hCircle'],['fill','hFill'],['eraser','hEraser'],
    ['undo','hUndo'],['center','hCenter'],[null,'hSize'],['smooth','hSmooth'],['zoom','hZoom'],['clear','hClear']];
  openModal(`<h3>${t('manualT')}</h3><div class="manual">${rows.map(([ic,k])=>`<div class="mrow">${ic?`<img src="${ICONS[ic]}" alt="">`:'<span class="mdots"><i></i><i></i><i></i></span>'}<p>${t(k)}</p></div>`).join('')}</div>
    <div class="stack"><button class="btn primary" id="manOk">${t('ok')}</button></div>`);
  $('manOk').onclick=closeModal;
}

/* =================== NOME =================== */
function askName(){
  openModal(`<h3>${t('nameT')}</h3><p class="sub">${t('nameB')}</p>
    <label class="f">${t('nameL')}<input id="nameIn" maxlength="20" placeholder="${esc(t('namePh'))}"></label>
    <div class="stack"><button class="btn primary" id="nameOk">${t('nameGo')}</button>
    ${api.online?`<details class="hasCode"><summary>${t('codeT')}</summary>
      <label class="f"><input id="codeIn0" placeholder="${esc(t('codePh'))}" autocomplete="off"></label>
      <button class="btn" id="useCode0">${t('useCode')}</button></details>`:''}</div>`,true);
  if(api.online) $('useCode0').onclick=async()=>{ const c=$('codeIn0').value.trim(); if(!c) return;
    try{ ME=await api.useCode(c); POOL=await api.pool(); closeModal(); toast(t('codeOk')); render(); showNews(); }catch(e){ errToast(e); } };
  $('nameOk').onclick=async()=>{
    const v=$('nameIn').value.trim(); if(!v) return toast(t('nameNeed'));
    $('nameOk').disabled=true;
    try{ ME=await api.join(v); POOL=await api.pool(); closeModal(); render();
      if(api.online&&ME.code){ openModal(`<h3>${t('codeT')}</h3><div class="code big"><code>${esc(fmtCode(ME.code))}</code></div><p class="sub">${t('codeB')}</p>
        <div class="stack"><button class="btn primary" id="codeOk">${t('ok')}</button></div>`); $('codeOk').onclick=closeModal; } }
    catch(e){ $('nameOk').disabled=false; errToast(e); }
  };
}

/* =================== INVENTARIO =================== */
function cardHTML(it){
  return `<button class="card ${it.mine?'mine':''}" data-id="${it.id}"><img src="${imgSrc(it.img)}" alt="${esc(it.name)}" loading="lazy" decoding="async"><div class="n">${esc(it.name)}</div>
    <div class="p">${yen(it.value)}</div><div class="a">${it.mine?t('byYou'):t('by',{a:esc(it.author)})}</div></button>`;
}
let invTab='inv', ALBUM=null;
async function renderInv(){
  const v=$('v-inv'), cap=ME.capacity, n=ME.inventory.length, s=ME.streak, nx=7-(s%7);
  const total=ME.inventory.reduce((a,i)=>a+i.value,0);
  const tabs=`<div class="seg"><button data-tab="inv" class="${invTab==='inv'?'on':''}">${t('tabInv')}</button><button data-tab="album" class="${invTab==='album'?'on':''}">${t('tabAlbum')}</button></div>`;
  if(invTab==='album'){
    v.innerHTML=tabs+`<p class="sub">${t('albumB')}</p><div id="albumGrid"></div>`;
    bindTabs(v);
    try{ ALBUM=await api.album(); }catch(e){ errToast(e); return; }
    if(view!=='inv'||invTab!=='album') return;
    $('albumGrid').innerHTML=ALBUM.length?`<div class="grid">${ALBUM.map(cardHTML).join('')}</div>`:`<div class="emptybox"><b>${t('albumEmpty')}</b></div>`;
    $('albumGrid').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>itemSheet(ALBUM.find(x=>x.id===b.dataset.id),false));
    return;
  }
  v.innerHTML=tabs+`<div class="invhead"><div><h2 style="margin:0">${t('invT')}</h2><span class="sub">${t('invSlots',{n,c:cap})}</span></div>
    <div style="text-align:right"><div class="total">${yen(total)}</div><span class="sub">${t('invTotal')}</span></div></div>
    <div class="cap"><span style="width:${Math.min(100,n/cap*100)}%"></span></div>
    <p class="sub">${t('invGrow')} ${s?(nx===1?t('invNext1'):t('invNextN',{n:nx})):t('invNoStreak')}</p>
    ${(ME.hearts||ME.laughs)?`<p class="sub"><b>${t('reactions',{h:ME.hearts||0,l:ME.laughs||0})}</b></p>`:''}
    ${n?`<div class="grid">${ME.inventory.map(cardHTML).join('')}</div>`:
      `<div class="emptybox"><b>${t('invEmptyT')}</b><p class="sub" style="margin:6px 0 12px">${t('invEmptyB')}</p><button class="btn primary" onclick="go('machine')">${t('goMachine')}</button></div>`}`;
  bindTabs(v);
  v.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>itemSheet(ME.inventory.find(x=>x.id===b.dataset.id),true));
}
function bindTabs(v){ v.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ invTab=b.dataset.tab; renderInv(); }); }
// ficha dun obxecto: compartir, regalar, devolver e denunciar
function itemSheet(it,owned){
  if(!it) return;
  openModal(`<div class="sheetitem"><img src="${imgSrc(it.img)}" alt=""><h3>${esc(it.name)}</h3>
    <div class="tprice">${yen(it.value)}</div><p class="sub">${it.mine?t('byYou'):t('by',{a:esc(it.author)})}</p>
    ${it.in_pool?`<p class="status-chip">${t('inPool')}</p>`:it.owner?`<p class="status-chip">${t('ownedBy',{o:esc(it.owner)})}</p>`:''}</div>
    ${it.mine?`<label class="pubchk sheetpub"><input type="checkbox" id="isPub" ${it.public?'checked':''}> ${t('pubChk')}</label>`:''}
    ${(it.likes!==undefined&&it.public)?`<div class="votes" id="isVotes">${voteHTML(it)}</div>`:''}
    <div class="stack"><button class="btn" id="isShare">${t('share')}</button>
    ${owned?`<button class="btn" id="isGift">${t('gift')}</button><button class="btn" id="isRel">${t('release')}</button>
    ${it.mine?'':`<button class="linkbtn" id="isRep">${t('report')}</button>`}`:''}
    <button class="btn" id="isClose">${t('close')}</button></div>`);
  $('isClose').onclick=closeModal; $('isShare').onclick=()=>shareItem(it);
  if($('isPub')) $('isPub').onchange=async e=>{ try{ const r=await api.setPublic(it.id,e.target.checked); it.public=r.public;
      const inv=ME.inventory.find(x=>x.id===it.id); if(inv) inv.public=r.public; if(view==='gal') renderGal(); }catch(err){ e.target.checked=!e.target.checked; errToast(err); } };
  if($('isVotes')) bindVotes(it);
  if(!owned) return;
  $('isRel').onclick=async e=>{ if(!e.target.dataset.sure){ e.target.dataset.sure='1'; e.target.textContent=t('sure'); return; }
    try{ ME=await api.release(it.id); POOL=await api.pool(); closeModal(); toast(t('tReturned',{n:it.name})); render(); }catch(err){ errToast(err); } };
  if($('isRep')) $('isRep').onclick=async e=>{ if(!e.target.dataset.sure){ e.target.dataset.sure='1'; e.target.textContent=t('reportSure'); return; }
    try{ ME=await api.report(it.id); POOL=await api.pool(); closeModal(); toast(t('reportedInv')); render(); }catch(err){ errToast(err); } };
  $('isGift').onclick=()=>giftSheet(it);
}
function voteHTML(it){
  const dis=it.mine?'disabled':'';
  return `<button class="vbtn ${it.my_vote===1?'on':''}" data-v="1" ${dis}><img src="${ICONS.heart}" alt="❤️"><b>${it.likes||0}</b></button>
    <button class="vbtn ${it.my_vote===-1?'on':''}" data-v="-1" ${dis}><img src="${ICONS.thumbdown}" alt="👎"><b>${it.dislikes||0}</b></button>
    ${it.mine?`<p class="sub" style="width:100%;margin:4px 0 0">${t('voteOwn')}</p>`:''}`;
}
function bindVotes(it){
  $('isVotes').querySelectorAll('.vbtn').forEach(b=>b.onclick=async()=>{
    const v=+b.dataset.v, nv=it.my_vote===v?0:v;
    try{ const r=await api.vote(it.id,nv); Object.assign(it,r); $('isVotes').innerHTML=voteHTML(it); bindVotes(it);
      const card=document.querySelector(`.frame[data-id="${it.id}"] .vcount`); if(card) card.innerHTML=voteMini(it); }
    catch(e){ errToast(e); }
  });
}
function voteMini(it){ return `<img src="${ICONS.heart}" alt="❤️">${it.likes||0} <img src="${ICONS.thumbdown}" alt="👎">${it.dislikes||0}`; }
function giftSheet(it){
  openModal(`<h3>${t('giftT')}</h3><p class="sub">«${esc(it.name)}» · ${yen(it.value)}</p>
    <label class="f"><input id="giftQ" maxlength="20" placeholder="${esc(t('giftPh'))}" autocomplete="off"></label>
    <div class="rowlist" id="giftList"></div><div class="stack"><button class="btn" id="giftClose">${t('close')}</button></div>`);
  $('giftClose').onclick=closeModal;
  let tm;
  $('giftQ').oninput=e=>{ clearTimeout(tm); const q=e.target.value.trim(); if(!q){ $('giftList').innerHTML=''; return; }
    tm=setTimeout(async()=>{
      let list=[]; try{ list=await api.find(q); }catch(err){ return errToast(err); }
      $('giftList').innerHTML=list.length?list.map(p=>`<button class="btn" data-to="${p.id}" data-n="${esc(p.name)}">${esc(p.name)}</button>`).join(''):`<p class="sub">${t('giftNone')}</p>`;
      $('giftList').querySelectorAll('[data-to]').forEach(b=>b.onclick=async()=>{
        try{ ME=await api.gift(it.id,b.dataset.to); closeModal(); toast(t('giftDone',{item:it.name,who:b.dataset.n})); render(); }catch(err){ errToast(err); }
      });
    },300); };
  setTimeout(()=>$('giftQ').focus(),50);
}

/* =================== GALERÍA =================== */
let galSort='new', galMine=false, GAL=[], galDone=false, galLoading=false;
async function renderGal(reset=true){
  const v=$('v-gal');
  if(reset){ GAL=[]; galDone=false;
    v.innerHTML=`<h2>${t('galT')}</h2><p class="sub">${t('galB')}</p>
      <div class="seg"><button data-gs="new" class="${galSort==='new'?'on':''}">${t('galNew')}</button><button data-gs="top" class="${galSort==='top'?'on':''}">${t('galTop')}</button><button data-gs="price" class="${galSort==='price'?'on':''}">${t('galPrice')}</button></div>
      <p class="sub rule">${t('galRule')}</p>
      <label class="minechk"><input type="checkbox" id="galMine" ${galMine?'checked':''}> ${t('galMine')}</label>
      <div class="gallery" id="galGrid"></div><div class="submit"><button class="btn" id="galMore" hidden>${t('galMore')}</button></div>`;
    v.querySelectorAll('[data-gs]').forEach(b=>b.onclick=()=>{ galSort=b.dataset.gs; renderGal(); });
    $('galMine').onchange=e=>{ galMine=e.target.checked; renderGal(); };
    $('galMore').onclick=()=>renderGal(false);
  }
  if(galLoading||galDone) return; galLoading=true;
  let page=[]; try{ page=await api.gallery(galSort,galMine,GAL.length); }catch(e){ errToast(e); }
  galLoading=false;
  if(view!=='gal') return;
  const start=GAL.length; GAL=GAL.concat(page); galDone=page.length<60;
  const grid=$('galGrid');
  if(!GAL.length){ grid.innerHTML=`<div class="emptybox"><b>${t('galEmpty')}</b></div>`; }
  else grid.insertAdjacentHTML('beforeend',page.map(it=>`<button class="frame" data-id="${it.id}"><span class="canvasbg"><img src="${imgSrc(it.img)}" alt="${esc(it.name)}" loading="lazy" decoding="async"></span>
    <span class="plaque"><b>${esc(it.name)}</b><span>${esc(it.author)}</span><span class="pval">${yen(it.value)}</span>
    ${it.public?`<span class="vcount">${voteMini(it)}</span>`:`<span class="vcount priv">${t('privTag')}</span>`}</span></button>`).join(''));
  grid.querySelectorAll('.frame').forEach((b,i)=>{ if(i>=start) b.onclick=()=>itemSheet(GAL.find(x=>x.id===b.dataset.id),false); });
  $('galMore').hidden=galDone;
}

/* =================== RANKING =================== */
let rankMode='rich', RANK=null;
async function renderRank(){
  const v=$('v-rank');
  try{ RANK=await api.ranking(); }catch(e){ errToast(e); if(!RANK) return; }
  if(view!=='rank') return;
  const list=RANK[rankMode]||[], meIn=list.some(p=>p.me);
  v.innerHTML=`<h2>${t('rankT')}</h2>
    <div class="seg"><button data-m="rich" class="${rankMode==='rich'?'on':''}">${t('rich')}</button><button data-m="poor" class="${rankMode==='poor'?'on':''}">${t('poor')}</button></div>
    <p class="sub">${rankMode==='rich'?t('richB'):t('poorB')}</p>
    <ol class="rank">${list.map((p,i)=>`<li class="${p.me?'me':''}"><span class="pos">${i+1}</span>
      <span><span class="who">${esc(p.name)}${p.me?' '+t('you'):''}</span><br><span class="cnt">${p.count===1?t('obj1'):t('objN',{n:p.count})}</span></span>
      <span class="val">${yen(p.total)}</span></li>`).join('')}</ol>
    ${rankMode==='poor'&&!meIn&&!ME.inventory.length?`<p class="sub" style="margin-top:12px">${t('notIn')}</p>`:''}`;
  v.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{rankMode=b.dataset.m;renderRank();});
}

/* =================== AXUSTES =================== */
$('setBtn').onclick=()=>{
  if(!ME) return;
  openModal(`<h3>${t('setT')}</h3>
    <label class="f">${t('nameL')}<input id="setName" maxlength="20" value="${esc(ME.name)}"></label>
    <div class="stack">
      <button class="btn" id="saveName">${t('setSave')}</button>
      <h3 style="margin-top:10px">${t('sndT')}</h3>
      <div class="toggles"><button class="btn small ${SND.fx?'go':''}" id="fxBtn">${t('sfxL')}: ${SND.fx?t('on'):t('off')}</button>
        <button class="btn small ${SND.music?'go':''}" id="musBtn">${t('musicL')}: ${SND.music?t('on'):t('off')}</button></div>
      ${api.online?`<h3 style="margin-top:10px">${t('codeT')}</h3><p class="sub" style="margin:0">${t('codeB')}</p>
        <div class="code"><code id="myCode">${esc(fmtCode(ME.code))}</code><button class="btn small" id="copyCode">${t('copy')}</button></div>
        <label class="f"><input id="codeIn" placeholder="${esc(t('codePh'))}" autocomplete="off"></label>
        <button class="btn" id="useCode">${t('useCode')}</button>`:''}
      ${api.online?'':`<p class="sub" style="margin:6px 0 0">${t('testB')}</p>
      <button class="btn go" id="nextDay">${t('nextDay')}</button>
      <button class="btn" id="simPeople">${t('sim')}</button>
      <button class="btn" id="resetBtn">${t('reset')}</button>`}
      <button class="btn" id="closeSet">${t('close')}</button>
    </div>`);
  $('closeSet').onclick=closeModal;
  const tog=(k,btn,label)=>{ SND[k]=!SND[k]; try{localStorage.setItem('gachapaint.'+k,SND[k]?'1':'0');}catch(e){}
    btn.classList.toggle('go',SND[k]); btn.textContent=`${t(label)}: ${SND[k]?t('on'):t('off')}`; if(k==='music') startMusic(); };
  $('fxBtn').onclick=e=>tog('fx',e.target,'sfxL');
  $('musBtn').onclick=e=>tog('music',e.target,'musicL');
  if(api.online){
    $('copyCode').onclick=async()=>{ try{ await navigator.clipboard.writeText(fmtCode(ME.code)); toast(t('copied')); }
      catch(e){ const r=document.createRange(); r.selectNodeContents($('myCode')); const sl=getSelection(); sl.removeAllRanges(); sl.addRange(r); } };
    $('useCode').onclick=async()=>{ const c=$('codeIn').value.trim(); if(!c) return;
      try{ ME=await api.useCode(c); POOL=await api.pool(); closeModal(); PH.balls=[]; toast(t('codeOk')); render(); }catch(e){ errToast(e); } };
  }
  $('saveName').onclick=async()=>{ const v=$('setName').value.trim(); if(!v) return toast(t('nameNeed'));
    try{ ME=await api.rename(v); toast(t('setSaved')); render(); }catch(e){ errToast(e); } };
  if(api.online) return;
  $('nextDay').onclick=async()=>{ ME=await api.nextDay(); POOL=await api.pool(); closeModal(); render();
    toast(ME.streak?t('dayStreak',{n:ME.streak===1?t('days1'):t('daysN',{n:ME.streak})}):t('dayNoStreak')); showNews(); };
  $('simPeople').onclick=async()=>{ const was=ME.started; ME=await api.simulate(); POOL=await api.pool(); closeModal(); render();
    toast(!was&&ME.started?t('tStarted'):t('simDone')); showNews(); };
  $('resetBtn').onclick=async e=>{
    if(!e.target.dataset.sure){ e.target.dataset.sure='1'; e.target.textContent=t('sure'); return; }
    await api.reset(); PH.balls=[]; DRAFT=null; try{localStorage.removeItem(DKEY);}catch(_){}
    closeModal(); toast(t('newGame')); go('machine'); askName();
  };
};

/* =================== ARRANQUE =================== */
setInterval(()=>{
  if(!api.online||!ME||busy||document.hidden||view!=='machine') return;
  api.pool().then(p=>{ POOL=p; if(!ME.started && p.started) refresh(); else renderMachine(); }).catch(()=>{});
},20000);
applyStatic();
if(api.hasPlayer()) refresh(); else askName();
