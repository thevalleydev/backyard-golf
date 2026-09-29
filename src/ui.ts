import * as THREE from 'three';
import { $, CLUBS, DEG, PCOLORS, PCSS, R, V, camera, scene } from './render.ts';
import { G, MODIFIERS, PROPDEF, TALLY, addressOf, ballMeshes, bump, clearGolfers, cp, dressKid, isUnlocked, makeBall, makeGolfer, marker, placeKid, setMarkerLabel, showZones, traceStart, walkTo } from './game.ts';
import { motionFallback, resetSwingBtn, showZone, updateLoft } from './input.ts';
import { SFX, audioInit, sfx } from './audio.ts';
import { H, OBJS, START, WATERI, XMAX, XMIN, ZMAX, ZMIN, groundInfo, near, resetGlass, tgt } from './world.ts';
import { collide, inZone } from './physics.ts';
import { gauss, shotModel } from './shot.ts';
import type { Player, SavedCourse, CourseHole } from './game-types.ts';
import type { Rule, WorldObject } from './world-types.ts';


/* ---------- UI helpers ---------- */
let toastTimer:ReturnType<typeof setTimeout>|undefined;
function input(id:string){const el=$(id);if(!(el instanceof HTMLInputElement)&&!(el instanceof HTMLSelectElement))throw new Error(`Expected input: ${id}`);return el;}
function child<T extends Element>(root:ParentNode,selector:string,ctor:{new (...args:never[]):T}):T{const el=root.querySelector(selector);if(!(el instanceof ctor))throw new Error(`Missing ${selector}`);return el;}
function toast(t:string,s?:string,ms=1300){const el=$('toast');child(el,'.t',HTMLElement).textContent=t;const se=child(el,'.s',HTMLElement);se.textContent=s||'';se.style.display=s?'inline-block':'none';
  el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),ms);}
const pick=<T>(a:readonly T[]):T=>a[Math.floor(Math.random()*a.length)];
const ENTITIES:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
const esc=(s:string|number)=>String(s).replace(/[&<>"]/g,c=>ENTITIES[c]);
function show(id:string,on:boolean){$(id).classList.toggle('hidden',!on);}

/* ---------- setup ---------- */
type Stats=Player['stats'];
type StatKey=keyof Stats;
type ClubKey=Player['club'];
interface SetupPlayer {name:string;club:ClubKey;prop:string;stance:'L'|'R';arm:'L'|'R';stats:Stats}
const defaults=(name:string,club:ClubKey):SetupPlayer=>({name,club,prop:'beer',stance:'R',arm:'R',stats:{pow:2,acc:2,con:2}});
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const clubKey=(v:unknown):v is ClubKey=>v==='eight'||v==='nine'||v==='pw';
const STATS:[StatKey,string,string][]=[['pow','Power','Max distance'],['acc','Accuracy','How close to your aim line'],['con','Consistency','Distance control, fewer mishits']];
const PTS=6,SMAX=4;
function fromSaved(v:unknown,i:number):SetupPlayer{
  const sp=record(v)?v:{},stats=record(sp.stats)?sp.stats:{},p=defaults(typeof sp.name==='string'?sp.name:`Player ${i+1}`,clubKey(sp.club)?sp.club:'nine');
  p.prop=typeof sp.prop==='string'?sp.prop:'beer';p.stance=sp.stance==='L'?'L':'R';p.arm=sp.arm==='L'?'L':'R';
  for(const [k] of STATS)if(typeof stats[k]==='number')p.stats[k]=stats[k];
  return p;
}
let setupPlayers:SetupPlayer[]=[defaults('Player 1','nine'),defaults('Player 2','pw')];
try{const s:unknown=JSON.parse(localStorage.getItem('byg_players')||'null');if(Array.isArray(s)&&s.length)setupPlayers=s.slice(0,4).map(fromSaved);}catch(e){}
function fixSP(sp:SetupPlayer){if(sp.stance!=='L')sp.stance='R';if(sp.arm!=='L')sp.arm='R';if(!clubKey(sp.club))sp.club='nine';if(!isUnlocked(sp.prop))sp.prop='beer';
  if(STATS.reduce((a,[k])=>a+(sp.stats[k]|0),0)>PTS)sp.stats={pow:2,acc:2,con:2};}
function initSetup(){setupPlayers.forEach(fixSP);renderCourses();}
const used=(sp:SetupPlayer)=>STATS.reduce((a,[k])=>a+sp.stats[k],0);
function renderSetup(){
  const pl=$('plist');pl.innerHTML='';
  setupPlayers.forEach((sp,i)=>{const row=document.createElement('div');row.className='prow';
    row.innerHTML=`<div class="ptop"><span class="dot" style="background:${PCSS[i]}"></span><input maxlength="12" value="${esc(sp.name)}" aria-label="Player ${i+1} name">${setupPlayers.length>1?'<button class="x" aria-label="Remove player">×</button>':''}</div>
    <div class="clubs">${Object.keys(CLUBS).filter(clubKey).map(k=>`<button data-k="${k}" class="${sp.club===k?'on':''}">${CLUBS[k].short}</button>`).join('')}</div>
    <div class="blurb">${CLUBS[sp.club].desc}</div>
    <div class="stats">${STATS.map(([k,l,d])=>`<div class="stat"><span title="${d}">${l}</span><div class="pips">${'<i class="on"></i>'.repeat(sp.stats[k])}${'<i></i>'.repeat(SMAX-sp.stats[k])}</div><button data-s="${k}" data-d="-1" aria-label="Less ${l}" ${sp.stats[k]<=0?'disabled':''}>−</button><button data-s="${k}" data-d="1" aria-label="More ${l}" ${sp.stats[k]>=SMAX||used(sp)>=PTS?'disabled':''}>+</button></div>`).join('')}
      <div class="ptsLeft">${PTS-used(sp)?`${PTS-used(sp)} point${PTS-used(sp)>1?'s':''} left`:'All points spent'}</div></div>
    <div class="hrow"><span>Stance</span><div class="clubs hands" data-f="stance"><button data-h="R" class="${sp.stance==='R'?'on':''}">Right</button><button data-h="L" class="${sp.stance==='L'?'on':''}">Left</button></div></div>
    <div class="hrow"><span>Swing arm</span><div class="clubs hands" data-f="arm"><button data-h="R" class="${sp.arm==='R'?'on':''}">Right</button><button data-h="L" class="${sp.arm==='L'?'on':''}">Left</button></div></div>
    <div class="hrow"><span>In hand</span><span></span></div><div class="clubs props">${Object.keys(PROPDEF).map(k=>isUnlocked(k)?`<button data-p="${k}" class="${sp.prop===k?'on':''}">${PROPDEF[k].name}</button>`:`<button data-lock="${k}" class="locked">🔒 ${PROPDEF[k].name.split(' ').slice(1).join(' ')}</button>`).join('')}</div>`;
    const nameInput=child(row,'input',HTMLInputElement);nameInput.addEventListener('input',()=>sp.name=nameInput.value);
    const x=row.querySelector<HTMLButtonElement>('.x');if(x)x.onclick=()=>{setupPlayers.splice(i,1);renderSetup();};
    row.querySelectorAll<HTMLButtonElement>('.clubs button[data-k]').forEach(b=>b.onclick=()=>{if(clubKey(b.dataset.k))sp.club=b.dataset.k;renderSetup();});
    row.querySelectorAll<HTMLButtonElement>('.hands button').forEach(b=>b.onclick=()=>{const f=b.parentElement?.dataset.f,h=b.dataset.h;if((f==='stance'||f==='arm')&&(h==='L'||h==='R'))sp[f]=h;renderSetup();});
    row.querySelectorAll<HTMLButtonElement>('.props button').forEach(b=>b.onclick=()=>{const k=b.dataset.lock;if(k){const l=PROPDEF[k]?.lock;if(l)toast('Locked',`${l[2]} (${Math.min(TALLY[l[0]]||0,l[1])}/${l[1]})`,1600);return;}if(b.dataset.p)sp.prop=b.dataset.p;renderSetup();});
    row.querySelectorAll<HTMLButtonElement>('.stat button').forEach(b=>b.onclick=()=>{const k=b.dataset.s,d=Number(b.dataset.d);if(k!=='pow'&&k!=='acc'&&k!=='con')return;const nv=sp.stats[k]+d;if(nv<0||nv>SMAX||(d>0&&used(sp)>=PTS))return;sp.stats[k]=nv;renderSetup();});
    pl.appendChild(row);});
  $('addP').style.display=setupPlayers.length>=4?'none':'';
}
$('addP').onclick=()=>{setupPlayers.push(defaults('Player '+(setupPlayers.length+1),pick(['eight','nine','pw'] as const)));renderSetup();};
$('holesSeg').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>{$('holesSeg').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');G.holes=Number(b.dataset.h);});
function segPick(id:string,fn:(d:DOMStringMap)=>void){$(id).querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>{$(id).querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');fn(b.dataset);});}
const CTRLTXT:Record<string,string>={swipe:'Thumb down anywhere on the bottom of the screen. Pull down to take it back: how far you pull is your power. Then flick up to hit. Flick too lazily and you lose some. Drifting sideways pushes or pulls it; a curved flick bends it.',
  phone:'Tap Swing, take the phone back to build power (watch the meter), then swing through the starting position. A faster through-swing preserves more power. Grip it tight or use a wrist strap.'};
function ctrlUI(){show('phoneOpts',G.ctrl!=='button');$('ctrlBlurb').textContent=CTRLTXT[G.ctrl]||'';}
segPick('ctrlSeg',d=>{if(d.c)G.ctrl=d.c;ctrlUI();});
segPick('sensSeg',d=>{G.maxRot=Number(d.s);});
/* saved courses: the exact order of targets, rules and tee spots from a round */
const COURSEKEY='byg_courses';
function loadCourses():SavedCourse[]{try{const c:unknown=JSON.parse(localStorage.getItem(COURSEKEY)||'[]');if(!Array.isArray(c))return[];
  return c.filter((course:unknown):course is SavedCourse=>record(course)&&typeof course.name==='string'&&Array.isArray(course.holes)&&course.holes.every((hole:unknown)=>record(hole)&&typeof hole.id==='string'&&typeof hole.ri==='number'&&Array.isArray(hole.tee)&&hole.tee.length===2&&hole.tee.every((n:unknown)=>typeof n==='number')));
}catch(e){return[];}}
function storeCourses(c:SavedCourse[]){try{localStorage.setItem(COURSEKEY,JSON.stringify(c));return true;}catch(e){return false;}}
function renderCourses(){const sel=input('courseSel'),cs=loadCourses();sel.innerHTML='<option value="">Freestyle: call holes as you go</option>'+cs.map((c,i)=>`<option value="${i}">${esc(c.name)} · ${c.holes.length} holes</option>`).join('');
  sel.value=G.courseIdx!=null&&cs[G.courseIdx]?String(G.courseIdx):'';onCourse();}
function onCourse(){const v=input('courseSel').value;G.courseIdx=v===''?null:+v;show('holesRow',G.courseIdx==null);show('courseDel',G.courseIdx!=null);}
$('courseSel').onchange=onCourse;
$('courseDel').onclick=()=>{const cs=loadCourses();if(G.courseIdx==null)return;cs.splice(G.courseIdx,1);storeCourses(cs);G.courseIdx=null;renderCourses();};
function saveCourse(inp:string){const holes=G.log.filter(Boolean);if(!holes.length){toast('Nothing to save','Finish a hole first',1200);return;}
  const name=input(inp).value.trim()||`Course ${new Date().toLocaleDateString()}`;const cs=loadCourses();cs.push({name,map:'crystal-spring',holes});
  toast(storeCourses(cs)?'Course saved':'Could not save',`${name} · ${holes.length} holes`,1500);input(inp).value='';}
$('saveBtn1').onclick=()=>saveCourse('saveName1');$('saveBtn2').onclick=()=>saveCourse('saveName2');
$('startBtn').onclick=()=>{ctrlUI();resetSwingBtn();audioInit();sfx('can',0.3);
  if(G.ctrl==='phone'){ // iOS needs the permission prompt inside this tap
    let pr:Promise<string>;try{const ctor:typeof DeviceMotionEvent & {requestPermission?:()=>Promise<string>}|undefined=typeof DeviceMotionEvent!=='undefined'?DeviceMotionEvent:undefined;pr=ctor?.requestPermission?ctor.requestPermission():Promise.resolve(ctor?'granted':'denied');}catch(e){pr=Promise.resolve('denied');}
    pr.then(r=>{if(r!=='granted')motionFallback('Motion access was denied');}).catch(()=>motionFallback('Motion access is blocked here'));
  }
  startGame();
};

function startGame(){
  resetGlass();
  try{localStorage.setItem('byg_players',JSON.stringify(setupPlayers));}catch(e){}
  ballMeshes.forEach(b=>{scene.remove(b.m);scene.remove(b.ring);});ballMeshes.length=0;clearGolfers();
  G.players=setupPlayers.map((sp,i)=>{const x=START.x+teeOffset(i,setupPlayers.length);return{name:(sp.name||'').trim()||('Player '+(i+1)),club:sp.club,prop:sp.prop,stance:sp.stance,arm:sp.arm,stats:{...sp.stats},color:PCOLORS[i],dark:new THREE.Color(PCOLORS[i]).multiplyScalar(0.6).getHex(),css:PCSS[i],
    ball:new V(x,H(x,START.z)+R,START.z),food:1,sips:0,eaten:0,won:false,prev:new V(),vel:new V(),strokes:0,done:false,card:[],k:makeGolfer()};});
  G.players.forEach((p,i)=>{ballMeshes.push(makeBall(i));dressKid(p);placeKid(p,p.ball,Math.atan2(-p.ball.x,-p.ball.z));});
  G.hole=1;G.caller=0;G.lastCall=null;G.modifier=null;G.lead=null;G.log=[];G.course=G.courseIdx!=null?loadCourses()[G.courseIdx]:null;if(G.course)G.holes=G.course.holes.length;
  show('setup',false);openCall();
}

/* ---------- calling a hole ---------- */
interface PickCandidate {o:WorldObject;sub:number|null;c:THREE.Vector3}
interface LeadCandidate extends PickCandidate {name:string;d:number}
let selObj:WorldObject|null=null,pendingModifier:string|null=null,leadCandidates:LeadCandidate[]=[];
function target():WorldObject{if(!G.target)throw new Error('No active target');return G.target;}
function rule():Rule{if(!G.rule)throw new Error('No active rule');return G.rule;}
function memberRules(o:WorldObject,sub:number|null):Rule[]{const m=sub==null?null:o.members?.[sub];return m&&o.subRules?o.subRules(m):o.rules;}
function openCall():void{
  G.phase='call';G.map=false;G.preview=null;selObj=null;pendingModifier=null;leadCandidates=[];marker.visible=false;G.target=null;G.rule=null;G.modifier=null;G.lead=null;show('leadPins',false);show('leadQuick',false);showZones();
  if(G.course)return courseHole();
  show('hud',false);show('controls',false);show('call',true);
  const caller=G.players[G.caller];
  $('callKicker').textContent=`Hole ${G.hole}${G.holes?' of '+G.holes:''}`;
  const grid=$('objGrid');grid.innerHTML='';
  const secs:[string,(o:WorldObject)=>boolean][]=[['Park, school & houses',o=>!o.cat],['Along the path',o=>o.cat==='path']];
  secs.forEach(([title,f])=>{const hd=document.createElement('div');hd.className='secHead';hd.textContent=title;grid.appendChild(hd);
  OBJS.filter(o=>o.rules.length&&f(o)).forEach(o=>{const b=document.createElement('button');b.innerHTML=`<span>${o.emoji}</span>${esc(o.name)}`;
    b.onclick=()=>selectObj(o);grid.appendChild(b);});});
  showGrid();startPick();
}
function showGrid(){const caller=G.players[G.caller];selObj=null;pendingModifier=null;leadCandidates=[];G.targetSub=null;G.preview=null;G.target=null;G.rule=null;G.modifier=null;G.lead=null;marker.visible=false;showZones();
  $('callTitle').textContent=G.players.length>1?`${caller.name}, pick a target`:'Pick a target';
  show('objGrid',true);show('ruleView',false);$('rndBtn').classList.remove('hidden');$('call').scrollTop=0;}
function selectObj(o:WorldObject,sub:number|null=null){selObj=o;pendingModifier=null;leadCandidates=[];G.preview=o;G.target=o;G.targetSub=sub;G.rule=null;G.modifier=null;G.lead=null;showZones();marker.visible=true;show('modifierView',false);show('leadView',false);show('ruleList',true);
  const m=sub!=null?o.members?.[sub]:null,rules=memberRules(o,sub);
  $('callTitle').textContent=`${o.emoji} ${m?m.name:o.name}`;show('objGrid',false);show('ruleView',true);$('rndBtn').classList.add('hidden');$('call').scrollTop=0;
  const rl=$('ruleList');rl.innerHTML='';
  rules.forEach(r=>{const b=document.createElement('button');
    const how={contact:'Any touch counts, even a bounce.',through:'Ball has to get into or through the yellow zone.',top:'Ball has to hit the top surface. Any touch from above counts.',brk:'You have to actually smash the glass. Hit it hard.'}[r.type]||'';
    b.innerHTML=`⛳ ${esc(r.label)}<small>${how}</small>`;
    b.onclick=()=>selectRule(o,r);rl.appendChild(b);});}
function selectRule(o:WorldObject,r:Rule){
  pendingModifier=null;G.rule=r;show('ruleList',false);show('leadView',false);show('modifierView',true);
  const list=$('modifierList');list.innerHTML='';
  const options:{key:string|null;label:string;how:string}[]=[{key:null,label:'Just hit the target',how:'No extra challenge.'},...Object.entries(MODIFIERS).map(([key,m])=>({key,...m}))];
  options.forEach(m=>{const b=document.createElement('button');b.innerHTML=`⛳ ${esc(m.label)}<small>${esc(m.how)}</small>`;
    b.onclick=()=>m.key==='bank'||m.key==='bounce'?chooseLead(m.key):playRule(o,r,m.key);list.appendChild(b);});
}
const LEAD_RANGE=60;
function nearbyLeads(){
  const dest=tgt(target(),G.players[G.caller].ball).c,candidates:LeadCandidate[]=[];
  OBJS.forEach(o=>{const add=(sub:number|null,c:THREE.Vector3,name:string)=>{if(o===G.target&&(G.targetSub==null||sub===G.targetSub))return;
      const d=Math.hypot(c.x-dest.x,c.z-dest.z);if(d<=LEAD_RANGE)candidates.push({o,sub,c,name,d});};
    if(o.members){const solid=new Set(o.cols.filter(c=>c.kind!=='leaf').map(c=>c.sub));
      o.members.forEach((m,i)=>{if(solid.has(i))add(i,m.c,m.name);});}
    else if(o.cols.some(c=>c.kind!=='leaf'))add(null,o.center,o.name);
  });
  return candidates.sort((a,b)=>a.d-b.d);
}
function chooseLead(modifier:string){
  pendingModifier=modifier;leadCandidates=nearbyLeads();const list=$('leadList');list.innerHTML='';
  if(!leadCandidates.length){pendingModifier=null;toast('No nearby targets','Pick a different target or skip the challenge',1600);return;}
  $('callTitle').textContent=`${modifier==='bank'?'Bank':'Bounce'} off what?`;
  leadCandidates.forEach(k=>{const b=document.createElement('button');b.innerHTML=`${k.o.emoji} ${esc(k.name)}<small>${k.d.toFixed(0)} m from the target</small>`;
    b.onclick=()=>playRule(target(),rule(),modifier,{id:k.o.id,sub:k.sub});list.appendChild(b);});
  show('modifierView',false);show('leadView',true);startLeadPick();
}
function startPick(){pendingModifier=null;leadCandidates=[];G.picking=true;const b=G.players[G.caller].ball;if(!G.pan||G.panHole!==G.hole){G.pan=new V(b.x,0,b.z);G.zoom=55;G.panHole=G.hole;}G.preview=null;G.target=null;G.targetSub=null;marker.visible=false;show('call',false);show('pickBar',true);show('pickBack',false);show('pickRnd',true);show('leadPins',false);show('leadQuick',false);
  $('pickTip').textContent=`Hole ${G.hole}${G.holes?' of '+G.holes:''}${G.players.length>1?' · '+G.players[G.caller].name+' calls it':''} · tap anything to target it`;}
function startLeadPick(){G.picking=true;const c=tgt(target(),G.players[G.caller].ball).c;G.pan=new V(c.x,0,c.z);G.zoom=40;show('call',false);show('pickBar',true);show('pickBack',true);show('pickRnd',false);show('leadPins',true);show('leadQuick',true);
  $('pickTip').textContent=`${pendingModifier==='bank'?'Bank':'Bounce'}: tap a highlighted object`;
  const chips=$('leadQuickList'),pins=$('leadPins');chips.innerHTML='';pins.innerHTML='';
  leadCandidates.slice(0,4).forEach(k=>{const b=document.createElement('button');b.textContent=`${k.o.emoji} ${k.name.split(' behind the ')[0]}`;b.title=k.name;
    b.onclick=()=>playRule(target(),rule(),pendingModifier,{id:k.o.id,sub:k.sub});chips.appendChild(b);});
  leadCandidates.slice(0,12).forEach(k=>{const b=document.createElement('button');b.textContent=k.o.emoji;b.title=k.name;b.setAttribute('aria-label',`First contact: ${k.name}`);
    b.onclick=()=>playRule(target(),rule(),pendingModifier,{id:k.o.id,sub:k.sub});pins.appendChild(b);});
}
function updateLeadPins(){if(!G.picking||!pendingModifier)return;camera.updateMatrixWorld();
  const v=new V(),pins=$('leadPins').querySelectorAll<HTMLButtonElement>('button'),occupied:[number,number][]=[];
  for(let i=0;i<pins.length;i++){const b=pins[i],k=leadCandidates[i];v.copy(k.c).project(camera);
    const x=(v.x+1)*innerWidth/2,y=(1-v.y)*innerHeight/2,visible=v.z>-1&&v.z<1&&x>25&&x<innerWidth-25&&y>30&&y<innerHeight-175&&occupied.every(([px,py])=>Math.hypot(px-x,py-y)>46);
    b.style.display=visible?'':'none';if(visible){b.style.left=x+'px';b.style.top=y+'px';occupied.push([x,y]);}}
}
function endPick(){G.picking=false;show('pickBar',false);show('leadPins',false);show('leadQuick',false);show('call',true);}
$('pickBtn').onclick=()=>pendingModifier?startLeadPick():startPick();
$('pickBack').onclick=()=>{endPick();if(pendingModifier){pendingModifier=null;show('leadView',false);show('modifierView',true);$('callTitle').textContent=`${target().emoji} ${G.targetSub!=null?target().members?.[G.targetSub]?.name??target().name:target().name}`;}};
$('allNearby').onclick=endPick;$('pickRnd').onclick=()=>{endPick();$('rndBtn').click();};
$('zoomIn').onclick=()=>{G.zoom=Math.max(15,G.zoom/1.3);};$('zoomOut').onclick=()=>{G.zoom=Math.min(170,G.zoom*1.3);};
function pickAt(sx:number,sy:number){const cands:PickCandidate[]=pendingModifier?[...leadCandidates]:[];if(!pendingModifier)OBJS.forEach(o=>{if(o.members){if(o.subRules)o.members.forEach((m,i)=>cands.push({o,sub:i,c:m.c}));}else if(o.rules.length)cands.push({o,sub:null,c:o.center});});
  let best:PickCandidate|null=null,bd=48*48;const v=new V();for(const k of cands){v.copy(k.c).project(camera);if(v.z>1)continue;const x=(v.x+1)/2*innerWidth,y=(1-v.y)/2*innerHeight,d=(x-sx)**2+(y-sy)**2;if(d<bd){bd=d;best=k;}}
  if(best){endPick();if(pendingModifier)playRule(target(),rule(),pendingModifier,{id:best.o.id,sub:best.sub});else selectObj(best.o,best.sub);}
  else toast('Nothing there',pendingModifier?'Tap a nearby object, or use the list':'Tap closer to a house or object',900);}
function playRule(o:WorldObject,r:Rule,modifier:string|null=null,lead:{id:string;sub?:number|null}|null=null){if(G.picking)endPick();pendingModifier=null;leadCandidates=[];G.target=o;G.rule=r;G.modifier=modifier;G.lead=modifier?lead:null;G.lastCall=o.id+o.rules.indexOf(r)+modifier+(G.lead?G.lead.id+G.lead.sub:'');
  const list=memberRules(o,G.targetSub),n=G.players.length,tee=G.players.reduce((a,p)=>a.add(p.ball),new V()).multiplyScalar(1/n);
  G.log[G.hole-1]={id:o.id,sub:G.targetSub,ri:Math.max(0,list.findIndex(x=>x.label===r.label)),modifier,lead:G.lead,tee:[+tee.x.toFixed(2),+tee.z.toFixed(2)]};startHole();}
function hasModifier(k:unknown):k is keyof typeof MODIFIERS{return k==='bank'||k==='bounce'||k==='path';}
function courseHole():void{ // replaying a saved course: same target, same rule, same tee spot
  const h=G.course?.holes[G.hole-1];if(!h)throw new Error('Saved course has no hole here');
  const o=OBJS.find(x=>x.id===h.id);if(!o){toast('Missing target','Skipping this hole',1200);G.hole++;return G.hole>G.holes?showFinal():openCall();}
  const lead=h.lead;
  if((h.modifier==='bounce'&&!lead)||(lead&&!OBJS.some(x=>x.id===lead.id&&(lead.sub==null||x.members&&x.members[lead.sub])))){toast('Missing first target','Skipping this hole',1200);G.hole++;return G.hole>G.holes?showFinal():openCall();}
  const n=G.players.length;G.players.forEach((p,i)=>{p.ball.set(h.tee[0]+teeOffset(i,n),0,h.tee[1]);p.ball.y=H(p.ball.x,p.ball.z)+R;p.vel.set(0,0,0);{const oc=o.members?o.members[h.sub??0].c:o.center;walkTo(p,Math.atan2(oc.x-p.ball.x,oc.z-p.ball.z));}});
  G.target=o;G.targetSub=h.sub??null;const list=memberRules(o,G.targetSub),r=list[h.ri]||list[0];
  G.preview=o;marker.visible=true;show('hud',false);show('controls',false);show('call',false);
  toast(`Hole ${G.hole} of ${G.holes}`,`${o.emoji} ${G.targetSub!=null?o.members?.[G.targetSub]?.name??o.name:o.name}: ${r.label}${hasModifier(h.modifier)?' · '+modifierText(h.modifier,lead??null):''}`,2200);
  setTimeout(()=>{if(G.phase==='call')playRule(o,r,hasModifier(h.modifier)?h.modifier:null,lead??null);},2300);}
$('backBtn').onclick=()=>{if(pendingModifier){pendingModifier=null;show('leadView',false);show('modifierView',true);$('callTitle').textContent=`${target().emoji} ${G.targetSub!=null?target().members?.[G.targetSub]?.name??target().name:target().name}`;return;}show('call',false);startPick();};
$('rndBtn').onclick=()=>{const list=OBJS.filter(o=>o.rules.length&&o.rules.every(r=>r.type!=='through'||r.zones?.length));let o:WorldObject,r:Rule,tries=0;
  do{o=pick(list);r=pick(o.rules);tries++;}while(G.lastCall===o.id+o.rules.indexOf(r)+'null'&&tries<10);
  playRule(o,r);toast('Surprise!',`${o.emoji} ${r.label}`,1600);};

function modifierText(modifier:string,lead:{id:string;sub?:number|null}|null){
  if(modifier==='path')return'Bounce on the path first';
  if(modifier==='bank'&&!lead)return'Bank off a house first';
  if(!lead)throw new Error('Missing challenge target');
  const o=OBJS.find(x=>x.id===lead.id);if(!o)throw new Error('Challenge target no longer exists');
  const name=lead.sub!=null?o.members?.[lead.sub]?.name??o.name:o.name;
  return`${modifier==='bank'?'Bank':'Bounce'} off ${name} first`;
}
let hcTimer:ReturnType<typeof setTimeout>|undefined;function holeCard(){$('hcK').textContent=`HOLE ${G.hole}${G.holes?' OF '+G.holes:''}`;$('hcR').textContent=rule().label;$('hcT').textContent=`${target().emoji} ${tgtName()}`;
  $('hcH').textContent=(HOWTXT[rule().type]||'')+(G.modifier?' '+(G.modifier==='path'?MODIFIERS.path.how:modifierText(G.modifier,G.lead)+'.'):'');$('holeCard').classList.add('show');clearTimeout(hcTimer);hcTimer=setTimeout(()=>$('holeCard').classList.remove('show'),3400);try{setMarkerLabel();}catch(e){}}
function startHole(){holeCard();
  show('call',false);show('hud',true);G.preview=null;showZones();marker.visible=true;
  G.players.forEach(p=>{p.strokes=0;p.done=false;p.won=false;});G.turn=G.caller;beginTurn();
}
function beginTurn(){
  const n=G.players.length;
  for(let k=0;k<n;k++){const i=(G.turn+k)%n;if(!G.players[i].done){G.cur=i;G.turn=i;return startAim();}}
  endHole();
}
function startAim(){
  const p=cp(),t=tgt(target(),p.ball).c;G.phase='aim';G.map=false;$('mapBtn').textContent='🗺️';
  G.yaw=Math.atan2(t.x-p.ball.x,t.z-p.ball.z);if(p.loft==null)p.loft=CLUBS[p.club].base;updateLoft();
  p.k.tripT=-1;p.k.g.rotation.x=0;dressKid(p);if(p.k.dest||p.k.g.position.distanceTo(addressOf(p,p.ball,G.yaw).pos)>0.3)walkTo(p,G.yaw);else placeKid(p,p.ball,G.yaw);p.k.clubPivot.rotation.z=p.k.addr;
  show('controls',true);resetSwingBtn();updateHUD();showZone();
  if(G.players.length>1)toast(`${p.name} up`,`${CLUBS[p.club].name} · stroke ${p.strokes+1}`,1000);
}
const tgtName=()=>G.targetSub!=null?target().members?.[G.targetSub]?.name??target().name:target().name;
const HOWTXT:Record<string,string>={contact:'Any touch counts, even a bounce.',through:'Get the ball into or through the yellow zone.',top:'Hit the top surface. Any touch from above counts.',brk:'Actually smash the glass. Hit it hard.'};
function updateHUD(){
  if(!G.target)return;const p=cp();
  $('hHole').textContent=String(G.hole);$('hCall').textContent=rule().label+(G.modifier?' · '+modifierText(G.modifier,G.lead):'');$('hTgt').textContent=`${target().emoji} ${tgtName()}`;
  const tc=tgt(target(),p.ball).c,d=Math.hypot(tc.x-p.ball.x,tc.z-p.ball.z);
  $('hSub').innerHTML=`<i style="background:${p.css}"></i>${esc(p.name)} · ${CLUBS[p.club].short} · stroke ${p.strokes+1} · ${d.toFixed(0)} m${G.phase==='flight'&&G.flags?.prerequisite&&G.modifier?' · first contact ✓':''}`;
}

/* ---------- swinging ---------- */
// Skill model: each shot draws a direction error and a distance error from normal distributions.
// Accuracy shrinks direction spread; Consistency shrinks distance spread and mishit odds; Power raises top speed.
// Bigger swings spread more. Values capped at 2.5 sigma so nothing is absurd.
function swing(power:number,sw?:{dir:number;curve:number}){
  if(G.phase!=='aim')return;
  const p=cp(),cl=CLUBS[p.club];p.prev.copy(p.ball);p.strokes++;
  const st=p.stats,pw=Math.max(0.04,power),sh=shotModel(p,pw);
  const hand=sw?0.6:1;let dirErr=gauss()*sh.sdDir*hand+sh.bias*hand+(sw?sw.dir:0),distF=1+gauss()*sh.sdDist,launchF=1+gauss()*0.04,mis=null;
  if(Math.random()<sh.mishit){mis=pick(['thin','fat','shank']);
    if(mis==='thin'){launchF*=0.35;distF*=0.9;}else if(mis==='fat'){distF*=0.45;launchF*=1.1;}
    else{dirErr+=(p.stance==='R'?-1:1)*(25+Math.random()*15);distF*=0.6;}}
  const loft=p.loft??cl.base,wob=dirErr,yaw=G.yaw+dirErr*DEG,ang=Math.max(2,loft*launchF)*DEG,
    s=pw*cl.v*(0.85+0.075*st.pow)*distF*(1-(loft-cl.base)*0.006);
  p.vel.set(Math.sin(yaw)*Math.cos(ang)*s,Math.sin(ang)*s,Math.cos(yaw)*Math.cos(ang)*s);
  G.flags={contact:false,through:false,top:false,broke:false,prerequisite:!G.modifier,t:0,still:0,wob,mis,sd:sh.sdDir,curve:sw?sw.curve:0,air:true};G.shotDir.set(Math.sin(yaw),0,Math.cos(yaw));
  sfx('swing',pw);G.phase='flight';show('controls',false);showZone();{const K=p.k;placeKid(p,p.ball,G.yaw);K.base=K.g.rotation.y;K.swingFrom=K.clubPivot.rotation.z;K.swingT=0;}G.map=false;traceStart(p);
  $('meterFill').style.width='0%';
}
function endShot(){
  const p=cp(),f=G.flags,r=rule(),o=target();if(!f)throw new Error('Shot has no results');G.phase='result';let ok=false,msg,sub='';
  if(r.type==='contact')ok=f.contact;else if(r.type==='through')ok=f.through;else if(r.type==='top')ok=f.top;else if(r.type==='brk')ok=f.broke;else ok=(r.zones??[]).some(n=>inZone(o.zones[n],p.ball));
  {const tc=tgt(o,p.ball).c;walkTo(p,Math.atan2(tc.x-p.ball.x,tc.z-p.ball.z),0.9);}
  if(ok){bump('holesWon');if(p.strokes===1)bump('aces');if(o.id==='gnome')bump('gnome');}
  if(ok){p.done=true;p.won=true;p.card[G.hole-1]=p.strokes;msg=p.strokes===1?'Ace!':pick(['Nailed it!','Called it!','Pure!','Money!']);sub=`${p.name} in ${p.strokes}`;}
  else{msg=pick(['Nope','Not quite','Keep swinging','Oof']);sub=`${p.strokes} down`+(f.mis?{thin:' · thinned it',fat:' · chunked it',shank:' · SHANK'}[f.mis]:Math.abs(f.wob)>f.sd*1.2?(f.wob>0?' · pulled it left':' · pushed it right'):'');}
  if(!ok&&G.modifier&&!f.prerequisite)sub+=G.modifier==='path'?' · need a path landing first':' · need to hit the first target';
  if(f.crash&&!ok){msg='CRASH!';sub='Window down · '+sub;}
  if(ok)sfx('win');
  toast(msg,sub,ok?1600:1100);
  if(PROPDEF[p.prop].use&&Math.random()<0.6)setTimeout(()=>{if(p.k.eatT<0)p.k.eatT=0;},350);
  setTimeout(()=>{const next=()=>{G.turn=(G.cur+1)%G.players.length;beginTurn();};const out=settleHole();
    if(out.length&&G.players.some(q=>!q.done)){toast(`${out.join(' & ')} ${out.length>1?'are':'is'} out`,'Already a stroke over',1300);setTimeout(next,1400);}else next();},ok?1700:1250);
}
const TEE_SPACING=1.8;
const teeOffset=(i:number,n:number)=>(i-(n-1)/2)*TEE_SPACING;
function teeUp(o:WorldObject){ // everyone restarts from one spot a few steps off the last target, on the side the winner came from
  const from=G.players[G.caller].ball.clone(),m=tgt(o,from),c=m.c,d=new V(from.x-c.x,0,from.z-c.z);if(d.lengthSq()<1)d.set(0,0,1);d.normalize();
  const side=new V(d.z,0,-d.x),n=G.players.length,yaw=Math.atan2(-d.x,-d.z);
  let r=m.r+3;const spot=new V(),ball=new V();
  for(let i=0;i<24;i++,r+=1.2){const a=i<12?0:(i%2?1:-1)*0.6,dx=d.x*Math.cos(a)-d.z*Math.sin(a),dz=d.x*Math.sin(a)+d.z*Math.cos(a);
    const x=Math.max(XMIN+5,Math.min(XMAX-5,c.x+dx*r)),z=Math.max(ZMIN+5,Math.min(ZMAX-5,c.z+dz*r));spot.set(x,H(x,z)+R,z);
    const clear=G.players.every((p,j)=>{ball.copy(spot).addScaledVector(side,teeOffset(j,n));ball.y=H(ball.x,ball.z)+R;
      if(ball.x<XMIN+2||ball.x>XMAX-2||ball.z<ZMIN+2||ball.z>ZMAX-2||groundInfo(ball)===WATERI)return false;
      const addr=addressOf(p,ball,yaw).pos;
      for(const point of [ball,new V(addr.x,addr.y+0.8,addr.z),new V(addr.x,addr.y+1.3,addr.z)])
        for(const k of near(point))if(k.kind!=='leaf'&&!k.off&&collide(k,point))return false;
      return true;});
    if(clear)break;}
  G.players.forEach((p,i)=>{p.ball.copy(spot).addScaledVector(side,teeOffset(i,n));p.ball.y=H(p.ball.x,p.ball.z)+R;p.vel.set(0,0,0);walkTo(p,yaw);});
}
// Once someone holes out in N, anyone who has already taken N strokes can't tie: they lose the hole at N+1 and stop playing it.
function settleHole(){const won=G.players.filter(p=>p.won);if(!won.length)return[];const best=Math.min(...won.map(p=>p.card[G.hole-1])),out:string[]=[];
  G.players.forEach(p=>{if(!p.done&&p.strokes>=best){p.done=true;p.card[G.hole-1]=best+1;out.push(p.name);}});return out;}
function endHole(){
  G.phase='between';marker.visible=false;show('controls',false);
  const sc=G.players.map(p=>p.card[G.hole-1]),best=Math.min(...sc),win=sc.map((s,i)=>s===best?i:-1).filter(i=>i>=0);
  const n=G.players.length;
  if(n>1){G.caller=win.length===1?win[0]:(G.caller+1)%n;
    toast(`Hole ${G.hole} done`,win.length===1?`${G.players[win[0]].name} wins it in ${best} and calls the next one`:`Tied at ${best}, honors rotate`,2300);}
  else toast(`Hole ${G.hole} done`,`${best} stroke${best>1?'s':''}`,1800);
  setTimeout(()=>{G.hole++;teeUp(target());if(G.holes&&G.hole>G.holes)showFinal();else openCall();},n>1?2400:1900);
}

/* ---------- scorecard ---------- */
function tableHTML(){
  const played=G.players.reduce((m,p)=>Math.max(m,p.card.length),0);
  let h='<tr><th>Player</th>';for(let i=1;i<=played;i++)h+=`<th>${i}</th>`;h+='<th>Total</th></tr>';
  G.players.forEach(p=>{h+=`<tr><td><span style="color:${p.css}">●</span> ${esc(p.name)}${p.eaten?` <small>${p.prop==='drink'?'🥤':'🌭'}×${p.eaten}</small>`:''}</td>`;let t=0;
    for(let i=0;i<played;i++){const s=p.card[i];if(s!=null)t+=s;h+=`<td>${s??'·'}</td>`;}h+=`<td class="tot">${t}</td></tr>`;});
  if(!played)h='<tr><td>No holes finished yet.</td></tr>';return h;
}
function totals(){return G.players.map(p=>p.card.reduce((a,b)=>a+(b||0),0));}
$('cardBtn').onclick=()=>{const parent=$('saveName1').parentElement;if(parent)parent.style.display=G.course?'none':'flex';$('cardTbl').innerHTML=tableHTML();show('cardModal',true);};
$('muteBtn').onclick=()=>{SFX.on=!SFX.on;$('muteBtn').textContent=SFX.on?'🔊':'🔇';audioInit();if(SFX.on)sfx('can',0.3);};
$('closeCard').onclick=()=>show('cardModal',false);
$('skipBtn').onclick=()=>{show('cardModal',false);if(G.phase!=='aim')return;G.players.forEach(p=>{if(!p.done){p.done=true;p.card[G.hole-1]=p.strokes;}});endHole();};
$('endBtn').onclick=()=>{show('cardModal',false);showFinal();};
function showFinal(){
  G.phase='final';show('hud',false);show('controls',false);show('call',false);marker.visible=false;bump('rounds');if(G.players.length>1)bump('games');
  const t=totals(),best=Math.min(...t),w=G.players.filter((p,i)=>t[i]===best).map(p=>p.name);
  $('finalTitle').textContent=G.players.length>1?(w.length>1?'Tie game':`${w[0]} wins`):'Round done';
  $('finalWinner').textContent=G.players.length>1?`${w.join(' & ')} with ${best} total. Low score takes it.`:`${best} strokes over ${G.players[0].card.length} holes.`;
  $('finalTbl').innerHTML=tableHTML();$('moreBtn').textContent=G.course?'Play this course again':'Play 9 more';const parent=$('saveName2').parentElement;if(parent)parent.style.display=G.course?'none':'flex';show('finalModal',true);
}
$('moreBtn').onclick=()=>{show('finalModal',false);if(G.course){startGame();return;}G.holes=(G.hole-1)+9;openCall();};
$('newBtn').onclick=()=>{show('finalModal',false);G.phase='setup';show('hud',false);renderSetup();renderCourses();show('setup',true);};
export { COURSEKEY, CTRLTXT, HOWTXT, LEAD_RANGE, PTS, SMAX, STATS, TEE_SPACING, beginTurn, chooseLead, courseHole, ctrlUI, endHole, endPick, endShot, esc, fixSP, gauss, hcTimer, holeCard, initSetup, leadCandidates, loadCourses, modifierText, nearbyLeads, onCourse, openCall, pendingModifier, pick, pickAt, playRule, renderCourses, renderSetup, saveCourse, segPick, selObj, selectObj, selectRule, settleHole, setupPlayers, shotModel, show, showFinal, showGrid, startAim, startGame, startHole, startLeadPick, startPick, storeCourses, swing, tableHTML, teeOffset, teeUp, tgtName, toast, toastTimer, totals, updateHUD, updateLeadPins, used };
