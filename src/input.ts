import * as THREE from 'three';
import type { WorldCollider, WorldObject } from './world-types.ts';
import { $, CLUBS, DEG, OUT, V, renderer, scene } from './render.ts';
import { audioInit } from './audio.ts';
import { G, cp } from './game.ts';
import { pickAt, show, swing, toast } from './ui.ts';
import { EMPTY, FADEG, GC, GRID, MFADE, MSOLID, TM, TREES, ZERO, near, pkey } from './world.ts';
import { collide } from './physics.ts';


/* ---------- input ---------- */
const swingBtn=$('swingBtn');
swingBtn.addEventListener('pointerdown',e=>{audioInit();if(G.phase!=='aim')return;e.preventDefault();if(G.ctrl==='phone'){armMotion();return;}G.charging=true;G.chargeT=0;swingBtn.classList.add('charging');try{swingBtn.setPointerCapture(e.pointerId);}catch(_){}});
function release(){if(!G.charging)return;G.charging=false;swingBtn.classList.remove('charging');swing(G.power);}
swingBtn.addEventListener('pointerup',release);swingBtn.addEventListener('pointercancel',release);
function holdRepeat(btn:HTMLElement,fn:()=>void){let iv:ReturnType<typeof setInterval>|undefined;btn.addEventListener('pointerdown',e=>{e.preventDefault();fn();clearInterval(iv);iv=setInterval(fn,50);});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>btn.addEventListener(ev,()=>clearInterval(iv)));}
holdRepeat($('lBtn'),()=>{if(G.phase==='aim')G.yaw+=0.5*DEG;});
holdRepeat($('rBtn'),()=>{if(G.phase==='aim')G.yaw-=0.5*DEG;});
function setLoft(d:number){if(G.phase!=='aim')return;const p=cp(),c=CLUBS[p.club];p.loft=Math.max(c.loft[0],Math.min(c.loft[1],(p.loft??c.base)+d));updateLoft();}
function updateLoft(){const p=cp(),c=CLUBS[p.club],loft=p.loft??c.base,off=loft-c.base;
  const tag=loft<=c.loft[0]+3?'Bump and run':off<-5?'Punch, low':off>14?'Flop, high':off>5?'Lofted':'Stock';
  $('loftVal').innerHTML=`<b>${loft}°</b><small>${tag}</small>`;}
holdRepeat($('loftUp'),()=>setLoft(1));holdRepeat($('loftDn'),()=>setLoft(-1));
$('mapBtn').onclick=()=>{G.map=!G.map;$('mapBtn').textContent=G.map?'🎯':'🗺️';};
let drag:{x:number}|null=null;const cv=renderer.domElement;
const PTRS=new Map<number,{x:number;y:number}>();let pinch0=0,tapStart:{x:number;y:number;t:number;moved:number}|null=null;
cv.addEventListener('pointerdown',e=>{if(G.phase==='aim')drag={x:e.clientX};
  if(G.picking){PTRS.set(e.pointerId,{x:e.clientX,y:e.clientY});if(PTRS.size===1)tapStart={x:e.clientX,y:e.clientY,t:performance.now(),moved:0};
    if(PTRS.size===2){const [a,b]=[...PTRS.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);tapStart=null;}}});
addEventListener('pointermove',e=>{const pr=PTRS.get(e.pointerId);if(!G.picking||!pr)return;const dx=e.clientX-pr.x,dy=e.clientY-pr.y;
  if(PTRS.size===1){const k=1.27*G.zoom/innerHeight;G.pan.x-=dx*k;G.pan.z-=dy*k;if(tapStart)tapStart.moved+=Math.abs(dx)+Math.abs(dy);}
  pr.x=e.clientX;pr.y=e.clientY;
  if(PTRS.size===2){const [a,b]=[...PTRS.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch0>0){G.zoom=Math.max(15,Math.min(170,G.zoom*pinch0/d));}pinch0=d;}});
const ptrUp=(e:PointerEvent)=>{if(!G.picking){PTRS.clear();return;}PTRS.delete(e.pointerId);
  if(tapStart&&PTRS.size===0){if(tapStart.moved<10&&performance.now()-tapStart.t<500)pickAt(e.clientX,e.clientY);tapStart=null;}};
addEventListener('pointerup',ptrUp);addEventListener('pointercancel',ptrUp);
cv.addEventListener('wheel',e=>{if(!G.picking)return;e.preventDefault();G.zoom=Math.max(15,Math.min(170,G.zoom*(e.deltaY>0?1.12:0.89)));},{passive:false});
addEventListener('pointermove',e=>{if(!drag||G.phase!=='aim')return;const dx=e.clientX-drag.x;drag.x=e.clientX;G.yaw-=dx*(G.map?0.008:0.005);});
addEventListener('pointerup',()=>drag=null);addEventListener('pointercancel',()=>drag=null);
addEventListener('keydown',e=>{if(G.phase!=='aim'||e.target instanceof HTMLInputElement)return;
  if(e.key==='ArrowUp')setLoft(1);else if(e.key==='ArrowDown')setLoft(-1);else if(e.key==='ArrowLeft')G.yaw+=1*DEG;else if(e.key==='ArrowRight')G.yaw-=1*DEG;
  else if(e.code==='Space'&&!e.repeat&&!G.charging){e.preventDefault();G.charging=true;G.chargeT=0;swingBtn.classList.add('charging');}});
addEventListener('keyup',e=>{if(e.code==='Space')release();});

/* ---------- swipe to swing ---------- */
// Backswing = how far you pull down (shown live on the gauge and by the golfer's club): that's the power.
// Then flick up: a committed flick keeps full power, a lazy one loses up to 40%. Sideways drift = push/pull, bowed path = hook/slice.
// Accuracy damps how much a sloppy flick hurts.
const zoneEl=$('swingZone');
interface SwipePoint {x:number;y:number;t:number}
interface SwipeState {id:number;pts:SwipePoint[];y0:number;low:SwipePoint;lowI:number;back:number;up:number}
let SW:SwipeState|null=null;
function showZone(){const on=G.ctrl==='swipe'&&G.phase==='aim';zoneEl.classList.toggle('hidden',!on);if(!on)swGauge(0,false);}
const BACKMAX=()=>innerHeight*0.26;                 // pull this far for full power
const TEMPOS:Record<number,number>={650:0.9,1000:1.4,1500:2.0};
const TEMPO=()=>TEMPOS[G.maxRot]||1.4; // flick speed (screens/s) that keeps full power
function swGauge(back:number,locked:boolean){$('swFill').style.height=(back*100).toFixed(0)+'%';$('swPct').textContent=back>0.01?Math.round(back*100)+'%':'';
  $('swTop').style.display=locked?'block':'none';$('swTop').style.top=(back*100).toFixed(0)+'%';$('swHint').style.opacity=back>0.01?'0':'1';}
zoneEl.addEventListener('pointerdown',e=>{if(G.phase!=='aim'||G.ctrl!=='swipe'||SW)return;e.preventDefault();audioInit();try{zoneEl.setPointerCapture(e.pointerId);}catch(_){}
  const q={x:e.clientX,y:e.clientY,t:performance.now()};SW={id:e.pointerId,pts:[q],y0:q.y,low:q,lowI:0,back:0,up:0};swGauge(0,false);});
zoneEl.addEventListener('pointermove',e=>{if(!SW||e.pointerId!==SW.id)return;const list=e.getCoalescedEvents?e.getCoalescedEvents():[e];
  for(const ce of list){const q={x:ce.clientX,y:ce.clientY,t:performance.now()};SW.pts.push(q);if(q.y>=SW.low.y){SW.low=q;SW.lowI=SW.pts.length-1;}}
  const q=SW.pts[SW.pts.length-1];SW.back=Math.min(1,Math.max(0,SW.low.y-SW.y0)/BACKMAX());SW.up=Math.max(0,SW.low.y-q.y);
  swGauge(SW.back,SW.up>12);});
function flickSpeed(state:SwipeState){const P=state.pts;let best=0; // peak upward speed over any ~60 ms window after the low point
  for(let i=P.length-1;i>state.lowI;i--){for(let j=i-1;j>=state.lowI;j--){const dt=P[i].t-P[j].t;if(dt>=40){best=Math.max(best,(P[j].y-P[i].y)/innerHeight/(dt/1000));break;}}}return best;}
function swipeEnd(e:PointerEvent){if(!SW||e.pointerId!==SW.id)return;const P=SW.pts,L=SW.low,E=P[P.length-1],up=L.y-E.y,back=SW.back,K=cp().k;
  if(back<0.04||up<30){SW=null;swGauge(0,false);K.clubPivot.rotation.z=K.addr;if(back>=0.04)toast('Flick up to hit it','Your backswing was set; flick up from there',1000);return;}
  const v=flickSpeed(SW),tempo=Math.max(0.6,Math.min(1,0.6+0.4*v/TEMPO()));
  const power=Math.max(0.03,back*tempo);
  const dx=E.x-L.x,drift=Math.atan2(dx,up)/DEG;
  const seg=P.slice(SW.lowI),M=seg[Math.floor(seg.length/2)],len=Math.hypot(E.x-L.x,E.y-L.y)||1;
  const bow=((E.x-L.x)*(M.y-L.y)-(E.y-L.y)*(M.x-L.x))/len,k=1.25-0.15*cp().stats.acc;
  const sw={dir:-drift*0.3*k,curve:Math.max(-0.35,Math.min(0.35,bow/up))*0.45*k};
  SW=null;swGauge(0,false);$('meterFill').style.width='0%';
  if(tempo<0.85)setTimeout(()=>toast('Lazy flick',`Lost ${Math.round((1-tempo)*100)}% of your power`,1000),200);
  swing(power,sw);showZone();}
zoneEl.addEventListener('pointerup',swipeEnd);zoneEl.addEventListener('pointercancel',swipeEnd);

/* ---------- phone-swing motion control ---------- */
// Integrate rotation on the axis chosen at takeback; velocity alone cannot distinguish a flick from a swing.
let lastMotion=0;
const PHONE_BACK=100,PHONE_MIN_BACK=35,PHONE_MIN_BACK_MS=180,PHONE_MIN_THROUGH_MS=100;
function resetSwingBtn(){G.armed=false;G.motion=null;$('meterFill').style.width='0%';swingBtn.classList.remove('charging');show('swingBtn',G.ctrl!=='swipe');show('swipePad',false);$('controls').classList.toggle('swipeMode',G.ctrl==='swipe');showZone();
  swingBtn.textContent=G.ctrl==='phone'?'Tap to swing':'Swing';
  $('hint').textContent=G.ctrl==='phone'?'Drag the yard to aim · tap, then swing your phone':G.ctrl==='swipe'?'Drag the yard to aim · pull down on the pad, flick up':'Drag the yard to aim · hold Swing, let go for power';}
function motionFallback(why:string){G.ctrl='swipe';resetSwingBtn();toast('Swipe mode',why+'. Try opening the link in Safari or Chrome.',3200);}
function armMotion(){G.armed=true;G.armAt=performance.now();G.motion=null;lastMotion=0;swingBtn.textContent='Take it back';swingBtn.classList.add('charging');
  $('hint').textContent='Take the phone back, then swing through its starting position';}
const argmax=(c:readonly number[])=>{let i=0;for(let k=1;k<3;k++)if(Math.abs(c[k])>Math.abs(c[i]))i=k;return i;};
addEventListener('devicemotion',e=>{
  const r=e.rotationRate;if(!r||![r.alpha,r.beta,r.gamma].some(Number.isFinite))return;
  const now=performance.now();lastMotion=now;
  if(!G.armed||G.phase!=='aim')return;
  const c=[r.alpha||0,r.beta||0,r.gamma||0],m=G.motion;
  if(!m){const axis=argmax(c);if(Math.abs(c[axis])>=35)G.motion={axis,sign:Math.sign(c[axis]),angle:0,peak:0,started:now,last:now,throughAt:0,throughPeak:0};return;}
  const dt=(now-m.last)/1000;m.last=now;
  if(dt<=0||dt>0.12){G.motion=null;return;}
  const rate=c[m.axis]*m.sign;
  if(Math.abs(rate)<8)return;
  m.angle=Math.max(-PHONE_BACK,Math.min(PHONE_BACK*1.5,m.angle+rate*dt));
  if(!m.throughAt){
    m.peak=Math.max(m.peak,m.angle);
    if(rate< -35&&m.peak>=PHONE_MIN_BACK&&now-m.started>=PHONE_MIN_BACK_MS){
      m.throughAt=now;swingBtn.textContent='Swing through';$('hint').textContent='Swing through the starting position';}
    else if(m.angle<=0){G.motion=null;return;}
  }else{
    if(rate<0)m.throughPeak=Math.max(m.throughPeak,-rate);
    if(m.angle<=0&&now-m.throughAt>=PHONE_MIN_THROUGH_MS&&m.throughPeak>=80){
      const tempo=Math.max(0.6,Math.min(1,0.6+0.4*m.throughPeak/(G.maxRot*0.4)));
      const power=Math.max(0.05,Math.min(1,m.peak/PHONE_BACK)*tempo);
      G.armed=false;G.motion=null;swingBtn.classList.remove('charging');swingBtn.textContent='Tap to swing';swing(power);}
  }
});
function motionTick(){
  if(!G.armed)return;const now=performance.now();
  const m=G.motion,back=m?Math.min(1,Math.max(0,m.angle)/PHONE_BACK):0;
  $('meterFill').style.width=(back*100).toFixed(0)+'%';
  cp().k.clubPivot.rotation.z=cp().k.addr-back*2.3;
  if(now-G.armAt>1500&&!lastMotion)return motionFallback('No motion data from this viewer');
  if(now-G.armAt>10000){resetSwingBtn();toast('Timed out','Tap Swing when you\'re ready',1200);}
}

/* ---------- camera occlusion ---------- */
function segD(A:THREE.Vector3,B:THREE.Vector3,P:THREE.Vector3){const abx=B.x-A.x,aby=B.y-A.y,abz=B.z-A.z,l2=abx*abx+aby*aby+abz*abz||1,t=Math.max(0,Math.min(1,((P.x-A.x)*abx+(P.y-A.y)*aby+(P.z-A.z)*abz)/l2));
  return Math.hypot(P.x-A.x-abx*t,P.y-A.y-aby*t,P.z-A.z-abz*t);}
const FMAT=new Map<THREE.Material,THREE.Material>();
const fadedOf=(m:THREE.Material)=>{const cached=FMAT.get(m);if(cached)return cached;const f=m.clone();f.transparent=true;f.opacity=0.2;f.depthWrite=false;FMAT.set(m,f);return f;};
const originalMaterials=new WeakMap<THREE.Mesh,THREE.Material>();
function fadeObjMeshes(o:WorldObject,on:boolean){o.g.traverse(m=>{if(!(m instanceof THREE.Mesh)||m.userData.zone||Array.isArray(m.material))return;
  if(m.material===OUT){m.visible=!on;return;}
  if(on){const original=originalMaterials.get(m)||m.material;originalMaterials.set(m,original);m.material=fadedOf(original);}
  else{const original=originalMaterials.get(m);if(original)m.material=original;}});}
const OBJBY:Record<string,WorldObject>={};
function fadeKey(k:string,on:boolean){const g=FADEG[k];if(g){g.mesh.material=on?MFADE:MSOLID;g.out.visible=!on;}const o=OBJBY[k];if(o&&!o.members)fadeObjMeshes(o,on);}
// trees are instanced: an occluding tree is pulled from the instances and a see-through copy stands in for it
const GHOSTMAT=new THREE.MeshLambertMaterial({color:0x4aa336,transparent:true,opacity:0.2,depthWrite:false}),GHOSTTRK=new THREE.MeshLambertMaterial({color:0x6b4423,transparent:true,opacity:0.2,depthWrite:false});
const GCAN=new THREE.IcosahedronGeometry(1,1),GTRK=new THREE.CylinderGeometry(0.75,1,1,6),ghosts=new Map<number,THREE.Group>();
function treeMeshes(){const {can,out,trk}=TM;if(!can||!out||!trk)throw new Error('Tree instances are not built');return{can,out,trk};}
function setTree(i:number,vis:boolean){const t=TREES[i],{can,out,trk}=treeMeshes(),matrices=t.mc;if(!t.mt||!matrices)throw new Error('Tree matrices are not built');
  trk.setMatrixAt(i,vis?t.mt:ZERO);[0,1].forEach(k=>{can.setMatrixAt(i*2+k,vis?matrices[k][0]:ZERO);out.setMatrixAt(i*2+k,vis?matrices[k][1]:ZERO);});
  if(vis){const gh=ghosts.get(i);if(gh){scene.remove(gh);ghosts.delete(i);}}
  else if(!ghosts.has(i)){const gh=new THREE.Group();const add=(geo:THREE.BufferGeometry,mt:THREE.Material,M:THREE.Matrix4)=>{const m=new THREE.Mesh(geo,mt);M.decompose(m.position,m.quaternion,m.scale);gh.add(m);};
    add(GTRK,GHOSTTRK,t.mt);matrices.forEach(([cm])=>add(GCAN,GHOSTMAT,cm));scene.add(gh);ghosts.set(i,gh);}}
let hidT=new Set<number>(),hidK=new Set<string>();const tmpT=new V(),sP=new V();
function segHits(c:WorldCollider,A:THREE.Vector3,B:THREE.Vector3){if(segD(A,B,c.c)>c.br+0.4)return false;if(c.kind==='leaf')return segD(A,B,c.c)<c.r+0.3;
  const L=A.distanceTo(B),n=Math.max(2,Math.ceil(L/0.4));for(let i=0;i<n;i++){sP.copy(A).lerp(B,i/n);if(collide(c,sP))return true;}return false;}
function updateOcclusion(on:boolean,A?:THREE.Vector3,B?:THREE.Vector3){const nT=new Set<number>(),nK=new Set<string>();
  if(on&&(!A||!B))throw new Error('Occlusion needs both camera and target positions');
  if(on&&A&&B){const cells=new Set<number>(),dx=B.x-A.x,dz=B.z-A.z,n=Math.ceil(Math.hypot(dx,dz)/3)+1;
    for(let i=0;i<=n;i++){const cx=Math.floor((A.x+dx*i/n)/GC),cz=Math.floor((A.z+dz*i/n)/GC);for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++)cells.add(pkey(cx+ox,cz+oz));}
    for(const k of cells)for(const c of (GRID.get(k)||EMPTY)){
      if(c.ti!=null){if(nT.has(c.ti))continue;const t=TREES[c.ti];
        const nearTrunk=Math.hypot(A.x-t.x,A.z-t.z)<3&&A.y>t.y-0.2&&A.y<t.y+t.th+0.5;
        if(nearTrunk||segD(A,B,tmpT.set(t.x,t.y+t.th+t.r*0.55,t.z))<t.r+0.5||segD(A,B,tmpT.set(t.x,t.y+t.th*0.5,t.z))<0.9)nT.add(c.ti);continue;}
      if(!c.obj||c.thru)continue;const key=c.fk||(c.obj.members?null:c.obj.id);
      if(!key||nK.has(key))continue;if(segHits(c,A,B))nK.add(key);}}
  let dirty=false;hidT.forEach(i=>{if(!nT.has(i)){setTree(i,true);dirty=true;}});nT.forEach(i=>{if(!hidT.has(i)){setTree(i,false);dirty=true;}});
  if(dirty){const {trk,can,out}=treeMeshes();trk.instanceMatrix.needsUpdate=can.instanceMatrix.needsUpdate=out.instanceMatrix.needsUpdate=true;}
  hidK.forEach(k=>{if(!nK.has(k))fadeKey(k,false);});nK.forEach(k=>{if(!hidK.has(k))fadeKey(k,true);});hidT=nT;hidK=nK;}
export { BACKMAX, FMAT, GCAN, GHOSTMAT, GHOSTTRK, GTRK, OBJBY, PHONE_BACK, PHONE_MIN_BACK, PHONE_MIN_BACK_MS, PHONE_MIN_THROUGH_MS, PTRS, SW, TEMPO, argmax, armMotion, cv, drag, fadeKey, fadeObjMeshes, fadedOf, flickSpeed, ghosts, hidK, hidT, holdRepeat, lastMotion, motionFallback, motionTick, pinch0, ptrUp, release, resetSwingBtn, sP, segD, segHits, setLoft, setTree, showZone, swGauge, swingBtn, swipeEnd, tapStart, tmpT, updateLoft, updateOcclusion, zoneEl };
