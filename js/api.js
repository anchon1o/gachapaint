// =====================================================================
// Capa de datos. As dúas versións devolven exactamente o mesmo:
//   me   = {id,name,streak,next_streak,budget,drew_today,pulls_left,capacity,started,goal,pending,inventory}
//   item = {id,name,value,author,img,mine}
//   pool = {started,goal,items:[{id,value}]}
// =====================================================================
const CFG = window.GACHA_CONFIG || {};
const ONLINE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY);

function apiError(code){ const e=new Error(code); e.code=code; return e; }
const budgetFor = n => n>0 && n%30===0 ? 1000 : n>0 && n%10===0 ? 500 : 100;

/* ---------------------------- EN LIÑA ---------------------------- */
const BUCKET='gachapaint';
const BASE=(CFG.SUPABASE_URL||'').replace(/\/$/,'');
// Ruta da imaxe → enderezo. No modo proba as imaxes van dentro (data:...)
const imgSrc = img => !img ? '' : img.startsWith('data:') ? img : `${BASE}/storage/v1/object/public/${BUCKET}/${img}`;
const RemoteAPI = (()=>{
  const KEY='gachapaint.secret';
  let secret=null; try{ secret=localStorage.getItem(KEY); }catch(e){}
  async function rpc(fn,args){
    const headers={'apikey':CFG.SUPABASE_KEY,'Content-Type':'application/json'};
    if(!CFG.SUPABASE_KEY.startsWith('sb_')) headers.Authorization='Bearer '+CFG.SUPABASE_KEY;
    let r;
    try{ r=await fetch(BASE+'/rest/v1/rpc/'+fn,{method:'POST',headers,body:JSON.stringify(args||{})}); }
    catch(e){ throw apiError('network'); }
    const j=await r.json().catch(()=>null);
    if(!r.ok){ const m=(j&&j.message)||''; throw apiError(m.startsWith('gch:')?m.slice(4):'generic'); }
    return j;
  }
  async function uploadImg(dataUrl){
    const blob=await (await fetch(dataUrl)).blob();
    const ext=blob.type==='image/png'?'png':'webp';
    const id=(crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g,()=>(Math.random()*16|0).toString(16)));
    const path=`items/${id}.${ext}`;
    const headers={'apikey':CFG.SUPABASE_KEY,'Content-Type':blob.type,'x-upsert':'false','cache-control':'31536000'};
    if(!CFG.SUPABASE_KEY.startsWith('sb_')) headers.Authorization='Bearer '+CFG.SUPABASE_KEY;
    let r;
    try{ r=await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`,{method:'POST',headers,body:blob}); }
    catch(e){ throw apiError('network'); }
    if(!r.ok) throw apiError('upload');
    return path;
  }
  return {
    online:true,
    hasPlayer:()=>!!secret,
    async join(name){ const r=await rpc('gch_join',{p_name:name}); secret=r.secret; try{localStorage.setItem(KEY,secret);}catch(e){} return r.me; },
    async me(){ try{ return await rpc('gch_me',{p_secret:secret}); }
      catch(e){ if(e.code==='no_player'){ secret=null; try{localStorage.removeItem(KEY);}catch(_){} } throw e; } },
    rename:name=>rpc('gch_rename',{p_secret:secret,p_name:name}),
    pool:()=>rpc('gch_pool',{}),
    // as imaxes soben primeiro a Storage; na base de datos só queda a ruta
    async submit(items){
      const up=await Promise.all(items.map(async it=>({...it,img:await uploadImg(it.img)})));
      return rpc('gch_submit',{p_secret:secret,p_items:up});
    },
    pull:()=>rpc('gch_pull',{p_secret:secret}),
    keep:rel=>rpc('gch_keep',{p_secret:secret,p_release:rel||null}),
    release:id=>rpc('gch_release',{p_secret:secret,p_item:id}),
    ranking:()=>rpc('gch_ranking',{p_secret:secret}),
    seen:()=>rpc('gch_seen',{p_secret:secret}),
    react:(id,r)=>rpc('gch_react',{p_secret:secret,p_item:id,p_reaction:r}),
    report:id=>rpc('gch_report',{p_secret:secret,p_item:id}),
    album:()=>rpc('gch_album',{p_secret:secret}),
    find:q=>rpc('gch_find',{p_secret:secret,p_q:q}),
    gift:(id,to)=>rpc('gch_gift',{p_secret:secret,p_item:id,p_to:to}),
    // código de xogador para recuperar a partida noutro dispositivo
    getCode:()=>secret,
    async useCode(code){
      const old=secret; secret=String(code||'').trim();
      try{ const m=await rpc('gch_me',{p_secret:secret}); try{localStorage.setItem(KEY,secret);}catch(e){} return m; }
      catch(e){ secret=old; throw e.code==='network'?e:apiError('bad_code'); }
    },
  };
})();

/* --------------------------- MODO PROBA --------------------------- */
const LocalAPI = (()=>{
  const LS='gachapaint.local.v1';
  let S=null;
  const uid=()=>Math.random().toString(36).slice(2,10);
  const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
  const realDay=()=>Math.floor((Date.now()-new Date().getTimezoneOffset()*60000)/86400000);
  const today=()=>realDay()+S.offset;
  function save(){ try{ localStorage.setItem(LS,JSON.stringify(S)); }catch(e){ throw apiError('store'); } }
  function load(){ try{ return JSON.parse(localStorage.getItem(LS)); }catch(e){ return null; } }

  // dibuxos de exemplo
  function art(fn){ const c=document.createElement('canvas'); c.width=c.height=256; const x=c.getContext('2d');
    x.lineWidth=9; x.lineJoin='round'; x.lineCap='round'; x.strokeStyle='#231C5C'; fn(x); return canvasToImg(c); }
  const fs=(x,f)=>{x.fillStyle=f;x.fill();x.stroke();};
  const circ=(x,cx,cy,r,f)=>{x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);fs(x,f);};
  const ART=[
    x=>{x.beginPath();x.moveTo(50,195);x.lineTo(38,80);x.lineTo(88,140);x.lineTo(128,58);x.lineTo(168,140);x.lineTo(218,80);x.lineTo(206,195);x.closePath();fs(x,'#FFD23F');circ(x,128,168,15,'#E0182D');circ(x,84,172,10,'#4DA8FF');circ(x,172,172,10,'#3DD68C');},
    x=>{x.beginPath();x.moveTo(100,36);x.lineTo(162,36);x.lineTo(162,150);x.quadraticCurveTo(162,212,118,212);x.lineTo(66,212);x.quadraticCurveTo(36,212,40,184);x.quadraticCurveTo(46,158,84,158);x.lineTo(100,158);x.closePath();fs(x,'#4DA8FF');x.fillStyle='#fff';x.fillRect(104,62,54,14);x.fillRect(104,94,54,14);},
    x=>{x.beginPath();x.ellipse(128,160,92,62,0,0,Math.PI*2);fs(x,'#BDBDC7');circ(x,100,145,18,'#fff');circ(x,158,145,18,'#fff');x.fillStyle='#231C5C';x.beginPath();x.arc(104,148,7,0,7);x.fill();x.beginPath();x.arc(162,148,7,0,7);x.fill();},
    x=>{x.beginPath();x.rect(50,120,156,92);fs(x,'#FFB3C7');x.beginPath();x.rect(50,120,156,28);fs(x,'#fff');x.beginPath();x.rect(120,70,16,50);fs(x,'#4DA8FF');x.beginPath();x.ellipse(128,52,10,16,0,0,7);fs(x,'#FF9F1C');},
    x=>{x.beginPath();x.moveTo(30,130);x.arc(128,130,98,Math.PI,0);x.closePath();fs(x,'#E0182D');x.beginPath();x.moveTo(128,130);x.lineTo(128,205);x.arc(112,205,16,0,Math.PI);x.stroke();x.beginPath();x.moveTo(150,40);x.lineTo(138,70);x.lineTo(156,84);x.lineTo(142,118);x.stroke();},
    x=>{x.beginPath();for(let i=0;i<10;i++){const r=i%2?32:72,a=-Math.PI/2+i*Math.PI/5;x.lineTo(160+r*Math.cos(a),104+r*Math.sin(a));}x.closePath();fs(x,'#FFD23F');x.lineWidth=12;[['#FF5A7A',0],['#4DA8FF',22],['#3DD68C',44]].forEach(([c,o])=>{x.strokeStyle=c;x.beginPath();x.moveTo(30+o,226-o*.2);x.lineTo(104+o*.4,150+o*.2);x.stroke();});},
    x=>{x.beginPath();x.moveTo(44,86);x.quadraticCurveTo(100,236,222,118);x.quadraticCurveTo(118,184,44,86);fs(x,'#FFD23F');x.fillStyle='#8B5A2B';[[110,150,9],[150,160,7],[86,126,6]].forEach(([a,b,r])=>{x.beginPath();x.arc(a,b,r,0,7);x.fill();});},
    x=>{x.beginPath();x.rect(68,104,110,98);fs(x,'#fff');x.beginPath();x.arc(180,150,26,-Math.PI/2,Math.PI/2);x.stroke();x.beginPath();x.rect(68,104,110,16);fs(x,'#8B5A2B');[96,124,152].forEach(a=>{x.beginPath();x.moveTo(a,86);x.quadraticCurveTo(a-14,66,a,52);x.quadraticCurveTo(a+12,38,a,24);x.stroke();});},
    x=>{x.beginPath();x.moveTo(58,128);x.lineTo(196,128);x.stroke();[80,108,136,164].forEach(a=>{x.beginPath();x.moveTo(a,96);x.quadraticCurveTo(a+10,128,a,160);x.stroke();});x.beginPath();x.moveTo(196,92);x.lineTo(236,128);x.lineTo(196,164);x.closePath();fs(x,'#BDBDC7');x.beginPath();x.moveTo(58,128);x.lineTo(24,96);x.lineTo(24,160);x.closePath();fs(x,'#BDBDC7');},
  ];
  const BOTS=['Marta','Brais','Uxía','Iago','Noa','Xoán','Antía','Lúa','Pablo'];
  let artCache=[];
  function botBatch(){
    if(!artCache.length) artCache=ART.map(art);
    const kinds=[...ART.keys()].sort(()=>Math.random()-.5).slice(0,3), author=BOTS[rnd(0,BOTS.length-1)];
    const a=rnd(0,100), b=rnd(0,100-a), v=[a,b,100-a-b].sort(()=>Math.random()-.5);
    kinds.forEach((k,i)=>{ const id=uid(); S.items[id]={id,name:t('seeds')[k],value:v[i],author,img:artCache[k],mine:false}; S.pool.push(id); });
  }
  function fresh(){
    S={events:[],album:[],tandas:0,tandasDay:null,offset:0,name:'',streak:0,lastDay:null,drewDay:null,pullsDay:null,pulls:0,inv:[],items:{},pool:[],pending:null,seedDay:null,started:false,goal:100,
       bots:[{n:'Marta',c:18,t:412},{n:'Brais',c:9,t:236},{n:'Uxía',c:20,t:604},{n:'Iago',c:6,t:41},{n:'Noa',c:12,t:150},
             {n:'Xoán',c:15,t:3},{n:'Antía',c:4,t:3},{n:'Lúa',c:3,t:88},{n:'Pablo',c:11,t:97}]};
    for(let k=0;k<11;k++) botBatch();
  }
  // simulación: os bots levan algúns dos teus debuxos e reaccionan
  function botsTakeMine(){
    const mine=S.pool.filter(id=>S.items[id].mine);
    mine.sort(()=>Math.random()-.5).slice(0,rnd(0,Math.min(3,mine.length))).forEach(id=>{
      S.pool=S.pool.filter(x=>x!==id);
      S.events.push({id:uid(),kind:'took',who:BOTS[rnd(0,BOTS.length-1)],item:S.items[id].name,reaction:['love','meh',null][rnd(0,2)],seen:false});
    });
  }
  function tick(){
    if(!S){ S=load(); if(!S) fresh(); S.events=S.events||[]; S.album=S.album||[]; }
    const d=today();
    if(S.pullsDay!==d){ S.pullsDay=d; S.pulls=0; }
    if(S.seedDay!==d){ if(S.seedDay!==null){ botBatch(); botsTakeMine(); } S.seedDay=d; }
    if(!S.started && S.pool.length>=S.goal) S.started=true;
    save();
  }
  const curStreak=()=>{ const d=today(); return (S.lastDay!==null && S.lastDay>=d-1)?S.streak:0; };
  const nextStreak=()=>{ const d=today(); if(S.lastDay===d) return S.streak; if(S.lastDay===d-1) return S.streak+1; return 1; };
  const capacity=()=>20+Math.floor(curStreak()/7);
  const itemOut=id=>{ const it=S.items[id]; return {...it,author:it.mine?S.name:it.author}; };
  function me(){
    const d=today(), drew=S.drewDay===d, ns=nextStreak();
    return {id:'me',name:S.name,streak:curStreak(),next_streak:ns,budget:budgetFor(ns),drew_today:drew,
      pulls_left:S.started&&drew?Math.max(0,3-S.pulls):0,capacity:capacity(),started:S.started,goal:S.goal,
      pending:S.pending?itemOut(S.pending):null,
      inventory:S.inv.map(itemOut).sort((a,b)=>b.value-a.value),
      tandas_left:S.started?null:Math.max(0,5-(S.tandasDay===d?S.tandas:0)),
      events:S.events.filter(e=>!e.seen).slice(-20).reverse(),
      hearts:S.events.filter(e=>e.kind==='took'&&e.reaction==='love').length,
      laughs:S.events.filter(e=>e.kind==='took'&&e.reaction==='meh').length};
  }
  const ok=v=>Promise.resolve(v);
  const wrap=fn=>(...a)=>{ try{ tick(); return ok(fn(...a)); }catch(e){ return Promise.reject(e.code?e:apiError('generic')); } };
  return {
    online:false,
    hasPlayer:()=>{ tick(); return !!S.name; },
    join:wrap(name=>{ S.name=name; save(); return me(); }),
    me:wrap(()=>me()),
    rename:wrap(name=>{ S.name=name; save(); return me(); }),
    pool:wrap(()=>({started:S.started,goal:S.goal,items:S.pool.map(id=>({id,value:S.items[id].value}))})),
    submit:wrap(items=>{
      const d=today();
      if(S.started && S.drewDay===d) throw apiError('already_drew');
      if(!S.started && S.tandasDay===d && S.tandas>=5) throw apiError('tanda_limit');
      const sum=items.reduce((a,i)=>a+i.value,0); if(sum!==budgetFor(nextStreak())) throw apiError('sum');
      items.forEach(i=>{ const id=uid(); S.items[id]={id,name:i.name,value:i.value,author:S.name,img:i.img,mine:true}; S.pool.push(id); });
      S.streak=nextStreak(); S.lastDay=d; S.drewDay=d; S.tandas=S.tandasDay===d?S.tandas+1:1; S.tandasDay=d;
      if(!S.started && S.pool.length>=S.goal) S.started=true;
      save(); return me();
    }),
    pull:wrap(()=>{
      const m=me();
      if(!S.started) throw apiError('not_started'); if(!m.drew_today) throw apiError('need_draw');
      if(S.pending) throw apiError('pending'); if(m.pulls_left<=0) throw apiError('no_pulls'); if(!S.pool.length) throw apiError('empty');
      const w=S.pool.map(id=>S.items[id].mine?0.35:1), tot=w.reduce((a,b)=>a+b,0);
      let r=Math.random()*tot, i=0; for(;i<w.length-1;i++){ r-=w[i]; if(r<=0) break; }
      const id=S.pool.splice(i,1)[0]; S.pending=id; S.pulls++; if(!S.album.includes(id)) S.album.push(id); save(); return itemOut(id);
    }),
    keep:wrap(rel=>{
      if(!S.pending) throw apiError('no_pending');
      if(!rel){ if(S.inv.length>=capacity()) throw apiError('full'); S.inv.push(S.pending); }
      else if(rel===S.pending){ S.pool.push(rel); }
      else { if(!S.inv.includes(rel)) throw apiError('bad_item'); S.inv=S.inv.filter(x=>x!==rel); S.pool.push(rel); S.inv.push(S.pending); }
      S.pending=null; save(); return me();
    }),
    release:wrap(id=>{ if(!S.inv.includes(id)) throw apiError('bad_item'); S.inv=S.inv.filter(x=>x!==id); S.pool.push(id); save(); return me(); }),
    ranking:wrap(()=>{
      const mine={name:S.name,count:S.inv.length,total:S.inv.reduce((a,id)=>a+S.items[id].value,0),me:true};
      const all=[...S.bots.map(b=>({name:b.n,count:b.c,total:b.t,me:false})),mine];
      return {rich:[...all].sort((a,b)=>b.total-a.total||b.count-a.count),
              poor:all.filter(p=>p.count>0).sort((a,b)=>a.total-b.total||b.count-a.count)};
    }),
    seen:wrap(()=>{ S.events.forEach(e=>e.seen=true); save(); return {}; }),
    react:wrap(()=>({})),
    report:wrap(id=>{
      if(S.pending===id){ S.pending=null; S.pulls=Math.max(0,S.pulls-1); }
      else if(S.inv.includes(id)) S.inv=S.inv.filter(x=>x!==id); else throw apiError('bad_item');
      S.items[id].hidden=true; S.album=S.album.filter(x=>x!==id); save(); return me();
    }),
    album:wrap(()=>[...S.album].reverse().filter(id=>S.items[id]&&!S.items[id].hidden).map(itemOut)),
    find:wrap(q=>{ q=String(q).trim().toLowerCase(); return BOTS.filter(n=>n.toLowerCase().startsWith(q)).map(n=>({id:'bot:'+n,name:n})); }),
    gift:wrap((id,to)=>{ if(!S.inv.includes(id)) throw apiError('bad_item'); S.inv=S.inv.filter(x=>x!==id); save(); return me(); }),
    getCode:()=>null,
    useCode:()=>Promise.reject(apiError('bad_code')),
    // só no modo proba
    nextDay:wrap(()=>{ S.offset++; save(); tick(); return me(); }),
    simulate:wrap(()=>{ for(let k=0;k<10;k++) botBatch(); botsTakeMine(); if(!S.started && S.pool.length>=S.goal) S.started=true; save(); return me(); }),
    reset:()=>{ try{localStorage.removeItem(LS);}catch(e){} S=null; tick(); return ok(me()); },
  };
})();

// WebP ocupa moito menos ca PNG e mantén a transparencia (se o navegador non sabe, PNG)
function canvasToImg(c){ const w=c.toDataURL('image/webp',0.7); return w.startsWith('data:image/webp')?w:c.toDataURL('image/png'); }

const api = ONLINE ? RemoteAPI : LocalAPI;
