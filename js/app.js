// =====================================================================
// Gachapaint · interface
// =====================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let ME=null, POOL={started:false,goal:100,items:[]}, view='machine', busy=false;

/* ---------- cores por prezo (non por rareza) ---------- */
const TIERS=[
  {min:751,c:'#22E3F2',dark:true},
  {min:301,c:'#E0182D'},
  {min:101,c:'#FFC21A',dark:true},
  {min:51, c:'#A335EE'},
  {min:21, c:'#0070DD'},
  {min:6,  c:'#1EBF3A'},
  {min:0,  c:'#F2F2F5',dark:true},
];
const tierIx = v => TIERS.findIndex(x=>v>=x.min);
const tier = v => TIERS[tierIx(v)];
function rangeLabel(i){ const x=TIERS[i], up=TIERS[i-1]; return up ? `${yen(x.min)}–${Number(up.min-1).toLocaleString(I18N[LANG].locale)}` : `${yen(x.min)}+`; }
function verdict(v){ return t(v===0?'v0':v<=5?'v1':v<=20?'v2':v<=50?'v3':v<=100?'v4':v<=300?'v5':v<=750?'v6':'v7'); }

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
function errToast(e){ const c=e&&e.code; toast(c==='network'||c==='upload'?t('eNet'):c==='store'?t('eStore'):t('eGeneric')); }
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
}
async function refresh(){
  try{ const [m,p]=await Promise.all([api.me(),api.pool()]); const was=ME&&ME.started; ME=m; POOL=p;
    if(was===false && ME.started) toast(t('tStarted')); render(); }
  catch(e){ if(e.code==='no_player') askName(); else errToast(e); }
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
  POOL.items.forEach(it=>{ if(have.has(it.id)) return;
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
  [0,180,360,540,720,900].forEach((ms,i)=>setTimeout(()=>beep(300+i*40,.04),ms));
  PH.shake=60;
  let item;
  try{ item=await api.pull(); }
  catch(e){ busy=false; PH.shake=0; errToast(e); return refresh(); }
  POOL.items=POOL.items.filter(x=>x.id!==item.id); ME.pending=item; ME.pulls_left--;
  new Image().src=imgSrc(item.img); // só se descarga a imaxe da bola que saíu
  const ball=PH.balls.find(b=>b.id===item.id); if(ball) ball.keep=true;
  setTimeout(()=>{
    if(ball) ball.out=true;
    setTimeout(()=>{ busy=false; const m=$('mini'); m.classList.remove('show','wait'); void m.offsetWidth; beep(180,.12,'sine',.12); renderMachine(); },420);
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
  $('reveal').classList.add('on');
}
$('bigcap').onclick=()=>{
  if(revealState!=='closed') return;
  revealState='opening'; const st=$('stage'); st.classList.add('shaking');
  [0,120,240,360].forEach((ms,i)=>setTimeout(()=>beep(500+i*90,.05,'triangle'),ms));
  setTimeout(()=>{ st.classList.remove('shaking'); st.classList.add('open'); revealState='open';
    beep(880,.08,'sine',.08); setTimeout(()=>beep(1320,.15,'sine',.08),90); },560);
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

/* =================== DEBUXAR =================== */
let cur=0, tool='pen', size=8, color='#231C5C', undo=[], pad, pctx, drawing=false, last=null, DRAFT=null;
const DKEY='gachapaint.draft';
function draft(){
  if(!DRAFT){ try{ DRAFT=JSON.parse(localStorage.getItem(DKEY)); }catch(e){} }
  if(!DRAFT||!DRAFT.slots) DRAFT={slots:[0,1,2].map(()=>({img:null,strokes:0,name:'',price:''}))};
  return DRAFT;
}
function saveDraft(){ try{ localStorage.setItem(DKEY,JSON.stringify(DRAFT)); }catch(e){} }
const canDraw=()=>!ME.started||!ME.drew_today;
function renderDraw(){
  const v=$('v-draw');
  if(!canDraw()){ v.innerHTML=`<h2>${t('doneT')}</h2><p class="sub">${t('doneB')}</p><button class="btn primary" onclick="go('machine')">${t('goMachine')}</button>`; return; }
  const b=ME.budget, ns=ME.next_streak;
  v.innerHTML=`${!ME.started?`<div class="banner">${t('fillBanner',{n:POOL.items.length,g:ME.goal})}</div>`:''}
    <h2>${t('drawT')}</h2><p class="sub">${t('drawB',{b:yen(b)})}</p>
    ${b>100?`<div class="banner">${t('streakBanner',{n:ns,b:yen(b)})}</div>`:''}
    <div class="slots" id="slots"></div>
    <div class="padwrap"><canvas id="pad" width="256" height="256" aria-label="${t('aPad')}"></canvas></div>
    <div class="tools" id="tools"></div>
    <div class="palette" id="palette"></div>
    <div class="fields">
      <label class="f">${t('fName')}<input id="fName" maxlength="40" placeholder="${esc(t('fNamePh'))}"></label>
      <label class="f">${t('fPrice')}<input id="fPrice" type="number" inputmode="numeric" min="0" max="${b}" step="1" placeholder="0"></label>
    </div>
    <div class="meter"><div class="mtext" id="mText"></div><div class="bar" id="bar"></div><div id="mSub" style="font-size:13px;color:var(--muted)"></div></div>
    <div class="submit"><button class="btn primary" id="submitBtn">${t('submit')}</button></div>`;
  pad=$('pad'); pctx=pad.getContext('2d',{willReadFrequently:true}); pctx.lineCap='round'; pctx.lineJoin='round';
  loadSlot(cur);
  const T=$('tools');
  T.innerHTML=[['pen','tPen'],['fill','tFill'],['eraser','tEraser']].map(([k,l])=>`<button class="tool ${tool===k?'on':''}" data-t="${k}">${t(l)}</button>`).join('')
    + [3,8,16,30].map(s=>`<button class="tool ${size===s?'on':''}" data-s="${s}" aria-label="${t('aSize',{n:s})}"><span class="dotsz" style="width:${Math.max(5,s*.7)}px;height:${Math.max(5,s*.7)}px"></span></button>`).join('')
    + `<button class="tool" id="undoBtn">${t('tUndo')}</button><button class="tool" id="clearBtn">${t('tClear')}</button>`;
  T.querySelectorAll('[data-t]').forEach(x=>x.onclick=()=>{tool=x.dataset.t;renderTools();});
  T.querySelectorAll('[data-s]').forEach(x=>x.onclick=()=>{size=+x.dataset.s;renderTools();});
  $('undoBtn').onclick=()=>{ if(!undo.length) return; pctx.putImageData(undo.pop(),0,0); commit(-1); };
  $('clearBtn').onclick=()=>{ undo.push(pctx.getImageData(0,0,256,256)); pctx.clearRect(0,0,256,256); const s=draft().slots[cur]; s.strokes=0; s.img=null; saveDraft(); renderSlots(); };
  $('palette').innerHTML=PALETTE.map(c=>`<button class="sw ${c===color?'on':''}" style="background:${c}" data-c="${c}" aria-label="${t('aColor',{n:c})}"></button>`).join('');
  $('palette').querySelectorAll('.sw').forEach(x=>x.onclick=()=>{color=x.dataset.c; if(tool==='eraser') tool='pen'; renderTools();});
  $('fName').oninput=e=>{draft().slots[cur].name=e.target.value;saveDraft();renderSlots();renderMeter();};
  $('fPrice').oninput=e=>{draft().slots[cur].price=e.target.value;saveDraft();renderMeter();renderSlots();};
  $('submitBtn').onclick=submitDrawings;
  bindPad(); renderSlots(); renderMeter();
}
function renderTools(){
  document.querySelectorAll('#tools [data-t]').forEach(x=>x.classList.toggle('on',x.dataset.t===tool));
  document.querySelectorAll('#tools [data-s]').forEach(x=>x.classList.toggle('on',+x.dataset.s===size));
  document.querySelectorAll('#palette .sw').forEach(x=>x.classList.toggle('on',x.dataset.c===color && tool!=='eraser'));
}
function renderSlots(){
  $('slots').innerHTML=draft().slots.map((s,i)=>{
    const ok=s.strokes>0 && s.name.trim() && s.price!=='';
    return `<button class="slot ${i===cur?'on':''}" data-i="${i}"><img alt="" src="${s.img||'data:image/gif;base64,R0lGODlhAQABAAAAACw='}">
      ${t('slot',{i:i+1})}${ok?' <span class="ok">✓</span>':''}</button>`;}).join('');
  $('slots').querySelectorAll('.slot').forEach(x=>x.onclick=()=>{ if(+x.dataset.i===cur) return; cur=+x.dataset.i; loadSlot(cur); renderSlots(); });
}
function loadSlot(i){
  const s=draft().slots[i]; undo=[]; pctx.clearRect(0,0,256,256);
  if(s.img){ const im=new Image(); im.onload=()=>pctx.drawImage(im,0,0); im.src=s.img; }
  $('fName').value=s.name; $('fPrice').value=s.price;
}
function commit(delta=1){ const s=draft().slots[cur]; s.strokes=Math.max(0,s.strokes+delta); s.img=canvasToImg(pad); saveDraft(); renderSlots(); }
function bindPad(){
  const pos=e=>{const r=pad.getBoundingClientRect();return [(e.clientX-r.left)*256/r.width,(e.clientY-r.top)*256/r.height];};
  pad.onpointerdown=e=>{
    e.preventDefault(); pad.setPointerCapture(e.pointerId);
    undo.push(pctx.getImageData(0,0,256,256)); if(undo.length>25) undo.shift();
    const [x,y]=pos(e);
    if(tool==='fill'){ flood(Math.max(0,Math.min(255,Math.floor(x))),Math.max(0,Math.min(255,Math.floor(y))),color); commit(); return; }
    drawing=true; last=[x,y];
    pctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';
    pctx.strokeStyle=tool==='eraser'?'#000':color; pctx.lineWidth=size;
    pctx.beginPath(); pctx.moveTo(x,y); pctx.lineTo(x+.01,y); pctx.stroke();
  };
  pad.onpointermove=e=>{ if(!drawing) return; const [x,y]=pos(e);
    pctx.beginPath(); pctx.moveTo(last[0],last[1]); pctx.lineTo(x,y); pctx.stroke(); last=[x,y]; };
  const end=()=>{ if(drawing){ drawing=false; pctx.globalCompositeOperation='source-over'; commit(); } };
  pad.onpointerup=end; pad.onpointercancel=end;
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
    if(s.price===''||!Number.isInteger(+s.price)||+s.price<0){ cur=i; renderDraw(); return toast(t('ePrice',{i:i+1})); } }
  const sum=D.slots.reduce((a,s)=>a+(+s.price),0);
  if(sum!==b) return toast(sum<b?t('eLeft',{x:yen(b-sum)}):t('eOver',{x:yen(sum-b)}));
  const btn=$('submitBtn'); btn.disabled=true;
  try{
    const was=ME.started;
    ME=await api.submit(D.slots.map(s=>({name:s.name.trim().slice(0,40),value:+s.price,img:s.img})));
    POOL=await api.pool();
    DRAFT=null; try{localStorage.removeItem(DKEY);}catch(e){} cur=0;
    toast(!was&&ME.started?t('tStarted'):t('tSubmitted')); go('machine');
  }catch(e){ btn.disabled=false; errToast(e); refresh(); }
}

/* =================== NOME =================== */
function askName(){
  openModal(`<h3>${t('nameT')}</h3><p class="sub">${t('nameB')}</p>
    <label class="f">${t('nameL')}<input id="nameIn" maxlength="20" placeholder="${esc(t('namePh'))}"></label>
    <div class="stack"><button class="btn primary" id="nameOk">${t('nameGo')}</button></div>`,true);
  $('nameOk').onclick=async()=>{
    const v=$('nameIn').value.trim(); if(!v) return toast(t('nameNeed'));
    $('nameOk').disabled=true;
    try{ ME=await api.join(v); POOL=await api.pool(); closeModal(); render(); }
    catch(e){ $('nameOk').disabled=false; errToast(e); }
  };
}

/* =================== INVENTARIO =================== */
function cardHTML(it){
  return `<div class="card ${it.mine?'mine':''}"><img src="${imgSrc(it.img)}" alt="${esc(it.name)}" loading="lazy" decoding="async"><div class="n">${esc(it.name)}</div>
    <div class="p">${yen(it.value)}</div><div class="a">${it.mine?t('byYou'):t('by',{a:esc(it.author)})}</div>
    <button class="btn small" data-rel="${it.id}">${t('release')}</button></div>`;
}
function renderInv(){
  const v=$('v-inv'), cap=ME.capacity, n=ME.inventory.length, s=ME.streak, nx=7-(s%7);
  const total=ME.inventory.reduce((a,i)=>a+i.value,0);
  v.innerHTML=`<div class="invhead"><div><h2 style="margin:0">${t('invT')}</h2><span class="sub">${t('invSlots',{n,c:cap})}</span></div>
    <div style="text-align:right"><div class="total">${yen(total)}</div><span class="sub">${t('invTotal')}</span></div></div>
    <div class="cap"><span style="width:${Math.min(100,n/cap*100)}%"></span></div>
    <p class="sub">${t('invGrow')} ${s?(nx===1?t('invNext1'):t('invNextN',{n:nx})):t('invNoStreak')}</p>
    ${n?`<div class="grid">${ME.inventory.map(cardHTML).join('')}</div>`:
      `<div class="emptybox"><b>${t('invEmptyT')}</b><p class="sub" style="margin:6px 0 12px">${t('invEmptyB')}</p><button class="btn primary" onclick="go('machine')">${t('goMachine')}</button></div>`}`;
  v.querySelectorAll('[data-rel]').forEach(b=>b.onclick=async()=>{
    if(!b.dataset.sure){ b.dataset.sure='1'; b.textContent=t('sure'); return; }
    const it=ME.inventory.find(x=>x.id===b.dataset.rel);
    try{ ME=await api.release(it.id); POOL=await api.pool(); toast(t('tReturned',{n:it.name})); render(); }catch(e){ errToast(e); }
  });
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
      ${api.online?'':`<p class="sub" style="margin:6px 0 0">${t('testB')}</p>
      <button class="btn go" id="nextDay">${t('nextDay')}</button>
      <button class="btn" id="simPeople">${t('sim')}</button>
      <button class="btn" id="resetBtn">${t('reset')}</button>`}
      <button class="btn" id="closeSet">${t('close')}</button>
    </div>`);
  $('closeSet').onclick=closeModal;
  $('saveName').onclick=async()=>{ const v=$('setName').value.trim(); if(!v) return toast(t('nameNeed'));
    try{ ME=await api.rename(v); toast(t('setSaved')); render(); }catch(e){ errToast(e); } };
  if(api.online) return;
  $('nextDay').onclick=async()=>{ ME=await api.nextDay(); POOL=await api.pool(); closeModal(); render();
    toast(ME.streak?t('dayStreak',{n:ME.streak===1?t('days1'):t('daysN',{n:ME.streak})}):t('dayNoStreak')); };
  $('simPeople').onclick=async()=>{ const was=ME.started; ME=await api.simulate(); POOL=await api.pool(); closeModal(); render();
    toast(!was&&ME.started?t('tStarted'):t('simDone')); };
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
