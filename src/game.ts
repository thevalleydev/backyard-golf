import * as THREE from 'three';
import { OUT, PCOLORS, R, V, mat, part, scene } from './render.ts';
import { endShot, toast, updateHUD } from './ui.ts';
import { H, OBJS, XMAX, XMIN, ZMAX, ZMIN, breakGlass, groundInfo, groundN, near, pathDist, roadSurf } from './world.ts';
import { hitSound, sfx } from './audio.ts';
import { collide, throughZone } from './physics.ts';
import { T } from './main.ts';


/* ---------- game state ---------- */
import type { GameState, Player, ShotFlags } from './game-types.ts';
import type { WorldCollider } from './world-types.ts';
const G:GameState={phase:'setup',players:[],hole:1,holes:9,caller:0,turn:0,cur:0,target:null,rule:null,modifier:null,lead:null,yaw:0,map:false,preview:null,power:0,charging:false,chargeT:0,flags:null,shotDir:new V(0,0,1),lastCall:null,ctrl:'swipe',maxRot:1000,armed:false,picking:false,pan:new V(),zoom:55,armAt:0,motion:null,targetSub:null,simT:0,courseIdx:null,course:null,log:[]};
const cp=()=>G.players[G.cur];

const MODIFIERS={
  bank:{label:'Bank off a nearby target',how:'On the scoring shot, hit the selected object before the target.'},
  bounce:{label:'Bounce off a nearby target',how:'On the scoring shot, bounce on top of the selected object before the target.'},
  path:{label:'Bounce on the path first',how:'Land on a path, then hit the target on that same shot (not the next swing).'}
};
const canScore=()=>!G.modifier||!!G.flags?.prerequisite;
const isTgt=(c:WorldCollider)=>c.obj===G.target&&(G.targetSub==null||c.sub===G.targetSub)&&(!G.rule?.part||c.part===G.rule.part);
const isLead=(c:WorldCollider)=>G.lead?c.obj&&c.obj.id===G.lead.id&&(G.lead.sub==null||c.sub===G.lead.sub):c.obj&&c.obj.id==='houses';
function markFirstContact(f:ShotFlags){if(f.prerequisite)return;f.prerequisite=true;updateHUD();toast(G.modifier==='path'?'Path bounce!':'First contact!','Now hit the target',1100);}
function activeShot(){const {flags,rule,target}=G;if(!flags||!rule||!target)throw new Error('Physics requires an active shot');return{flags,rule,target};}
function physStep(p:Player,h:number){
  const {flags:f,rule,target}=activeShot(),pos=p.ball,v=p.vel,sinkFrom=rule.type==='through'&&target.id==='cornhole'?pos.clone():null;
  let sup:WorldCollider|'ground'|null=null,supN:THREE.Vector3|null=null;
  v.y-=9.8*h;if(f.curve&&f.air){const vx=v.x,vz=v.z;v.x+=-vz*f.curve*h;v.z+=vx*f.curve*h;}pos.addScaledVector(v,h);
  const gh=H(pos.x,pos.z)+(roadSurf(pos.x,pos.z)<0?0.1:0);
  let gi=null;
  if(pos.y<gh+R+0.02&&v.y<0.6){const N=groundN(pos.x,pos.z);pos.y=gh+R/N.y;const vn=v.dot(N);gi=groundInfo(pos);
    if(G.modifier==='path'&&f.air&&vn< -0.1&&pathDist(pos.x,pos.z)<1.35&&roadSurf(pos.x,pos.z)>0)markFirstContact(f);
    if(vn<0&&-vn>1.5)hitSound('ground',gi.snd,-vn);
    if(vn<0){const iv=-vn;if(iv>1.0){v.addScaledVector(N,-1.36*vn);const k=Math.max(0.55,1-iv*0.035);const vt=v.clone().addScaledVector(N,-v.dot(N));v.addScaledVector(vt,k-1);}else v.addScaledVector(N,-vn);}
    sup='ground';supN=N;}
  for(const c of near(pos)){
    if(c.kind==='leaf'){ // foliage: passes through but drags the ball down and knocks it around a little
      if(pos.distanceToSquared(c.c)<c.r*c.r){const sp=v.length();v.multiplyScalar(Math.exp(-h*(1.1+sp*0.05)));
        v.x+=(Math.random()-0.5)*h*5;v.y+=(Math.random()-0.5)*h*5;v.z+=(Math.random()-0.5)*h*5;
        if(G.simT-(c.lt??-9)>0.4&&sp>2)hitSound(c,'leaf',sp);c.lt=G.simT;
        if(isTgt(c)&&canScore())f.contact=true;}
      continue;}
    if(c.off||Math.abs(pos.x-c.c.x)>c.br+R||Math.abs(pos.z-c.c.z)>c.br+R||Math.abs(pos.y-c.c.y)>c.br+R)continue;
    const hit=collide(c,pos);if(!hit)continue;
    pos.addScaledVector(hit.n,hit.pen);
    const vn=v.dot(hit.n);
    if(c.glass&&-vn>6){if(c.obj&&c.obj.id==='cars')hitSound('alarm'+c.sub,'alarm',10);breakGlass(c);v.multiplyScalar(0.5);f.crash=true;if(isTgt(c)&&canScore()){f.broke=true;f.contact=true;}if(G.modifier==='bank'&&!G.lead&&isLead(c))markFirstContact(f);continue;} // smashed: keeps going at half speed
    if(vn<0){let e=c.rest??0.42;if(-vn<(c.bouncy?0.45:0.8))e=0;v.addScaledVector(hit.n,-(1+e)*vn);if(-vn>1.2)hitSound(c,c.snd,-vn);if(c.obj&&c.obj.id==='cars'&&-vn>5)hitSound('alarm'+c.sub,'alarm',10);}
    if(isTgt(c)&&canScore()){f.contact=true;if(hit.n.y>0.6)f.top=true;}
    if(isLead(c)&&vn< -0.3&&((G.modifier==='bank')||(G.modifier==='bounce'&&hit.n.y>0.6)))markFirstContact(f);
    if(hit.n.y>0.55){sup=c;supN=hit.n;}
  }
  if(sup&&supN){let dec=2.6;
    if(sup==='ground')dec=(gi||groundInfo(pos)).dec;else dec=sup.fric??3;
    const vn=v.dot(supN),vt=v.clone().addScaledVector(supN,-vn),s=vt.length();
    if(s>0){vt.multiplyScalar(Math.max(0,s-dec*h)/s);v.copy(vt).addScaledVector(supN,vn);}
  }else v.multiplyScalar(1-0.05*h);
  if(rule.type==='through'&&canScore()&&rule.zones?.some(n=>throughZone(target.zones[n],sinkFrom,pos)))f.through=true;
  f.air=!sup;return sup;
}
function simStep(h:number){
  const p=cp(),f=G.flags;if(!f)throw new Error('Simulation requires an active shot');
  const n=Math.max(1,Math.ceil(p.vel.length()*h/R)),step=h/n;let sup;
  for(let i=0;i<n;i++){f.t+=step;G.simT=(G.simT||0)+step;sup=physStep(p,step);}
  const pos=p.ball;
  if(sup&&p.vel.length()<0.25){f.still+=h;if(f.still>0.2){p.vel.set(0,0,0);return endShot();}}else f.still=0;
  // if the ball has barely moved in the last half second and it's on or near the ground, call it stopped
  if(!f.chk){f.chk=pos.clone();f.chkT=f.t;}
  if(f.chk&&f.t-(f.chkT??f.t)>=0.5){const moved=pos.distanceTo(f.chk);f.chk.copy(pos);f.chkT=f.t;
    if(f.t>1&&moved<0.12&&pos.y-H(pos.x,pos.z)<0.6){p.vel.set(0,0,0);return endShot();}}
  if(f.t>14||pos.x<XMIN-30||pos.x>XMAX+30||pos.z<ZMIN-30||pos.z>ZMAX+30){p.vel.set(0,0,0);endShot();}
}

/* ---------- visuals: balls, character, markers ---------- */
const ballMeshes:import('./game-types.ts').BallVisual[]=[];
function makeBall(i:number){const m=part(new THREE.IcosahedronGeometry(R,1),0xffffff,scene,0,0,0,0.015);m.castShadow=true;
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.26,0.38,20),new THREE.MeshBasicMaterial({color:PCOLORS[i]}));ring.rotation.x=-Math.PI/2;scene.add(ring);
  return{m,ring};}
const coneGeo=new THREE.BufferGeometry();coneGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9),3));
const aimCone=new THREE.Line(coneGeo,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.55}));aimCone.frustumCulled=false;scene.add(aimCone);aimCone.visible=false;
const launchG=new THREE.Group(),launchPivot=new THREE.Group();launchG.add(launchPivot);
part(new THREE.CylinderGeometry(0.035,0.035,1.5,6),0xffe14d,launchPivot,0,0.75,0,0.02);
part(new THREE.ConeGeometry(0.11,0.3,6),0xffe14d,launchPivot,0,1.6,0,0.02);scene.add(launchG);launchG.visible=false;
const TRN=900,trGeo=new THREE.BufferGeometry();trGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(TRN*3),3));trGeo.setDrawRange(0,0);
const tracer=new THREE.Line(trGeo,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.85}));tracer.frustumCulled=false;scene.add(tracer);let trN=0,trAcc=0;
function traceStart(p:Player){trN=0;trGeo.setDrawRange(0,0);tracer.material.color.set(p.css);tracer.material.opacity=0.9;}
function traceTick(){if(G.phase!=='flight'||!G.players.length)return;const b=cp().ball;if(trN<TRN){trGeo.attributes.position.setXYZ(trN++,b.x,b.y,b.z);trGeo.setDrawRange(0,trN);trGeo.attributes.position.needsUpdate=true;}}
const shadow=new THREE.Mesh(new THREE.CircleGeometry(0.2,16),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.25,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
const aimDots:THREE.Mesh[]=[];for(let i=0;i<12;i++){const d=new THREE.Mesh(new THREE.CircleGeometry(0.09,10),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.9-i*0.06,depthWrite:false}));d.rotation.x=-Math.PI/2;scene.add(d);aimDots.push(d);}
const marker=new THREE.Group();{const c=part(new THREE.ConeGeometry(0.45,0.9,4),0xffe14d,marker,0,0,0,0.05);c.rotation.x=Math.PI;}scene.add(marker);marker.visible=false;
const mlCv=document.createElement('canvas');mlCv.width=512;mlCv.height=128;const mlTex=new THREE.CanvasTexture(mlCv);
const mlSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:mlTex,depthTest:false,transparent:true}));mlSpr.scale.set(3.2,0.8,1);mlSpr.position.y=1.15;mlSpr.renderOrder=10;marker.add(mlSpr);
function setMarkerLabel(){const x=mlCv.getContext('2d');if(!x)throw new Error('Cannot draw marker label');x.clearRect(0,0,512,128);const t=(G.rule?G.rule.label:'').toUpperCase();let fs=54;x.font=`900 ${fs}px "Arial Black", Arial, sans-serif`;
  while(x.measureText(t).width>480&&fs>24){fs-=3;x.font=`900 ${fs}px "Arial Black", Arial, sans-serif`;}
  x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';x.lineWidth=12;x.strokeStyle='#1d1a16';x.strokeText(t,256,64);x.fillStyle='#ffe14d';x.fillText(t,256,64);mlTex.needsUpdate=true;mlSpr.visible=!!t;}

// cutout golfers: one per player, all out in the world. One arm swings the club, the other is busy with whatever they're holding.
const DOWN=new V(0,-1,0),MOUTH=new V();
const CY=(a:number,b:number,h:number,s=10)=>new THREE.CylinderGeometry(a,b,h,s),BX=(x:number,y:number,z:number)=>new THREE.BoxGeometry(x,y,z),IC=(r:number,d=1)=>new THREE.IcosahedronGeometry(r,d);
interface PropDef {name:string;pose:string;use:string|null;lock?:[string,number,string];build(g:THREE.Group):void}
// hand items: pose = where the arm holds it, use = sip / bite / nothing. Locked ones unlock from play.
const PROPDEF:Record<string,PropDef>={
  beer:{name:'🍺 Beer',pose:'raise',use:'sip',build:g=>{part(CY(0.07,0.07,0.2,12),0xc9d3dc,g,0,0.06,0,0.02);part(CY(0.072,0.072,0.09,12),0x1f5fbf,g,0,0.05,0,0);part(CY(0.05,0.068,0.03,12),0xc9d3dc,g,0,0.175,0,0.01);}},
  drink:{name:'🥤 Red cup',pose:'raise',use:'sip',build:g=>{part(CY(0.1,0.075,0.22),0xd62828,g,0,0.06,0,0.02);part(CY(0.101,0.101,0.03),0xffffff,g,0,0.16,0,0);}},
  hotdog:{name:'🌭 Hot dog',pose:'front',use:'bite',build:g=>{part(BX(0.34,0.09,0.12),0xe0b064,g,0,0.04,0,0.02);const d=part(CY(0.035,0.035,0.42,6),0xb5452b,g,0,0.09,0,0.015);d.rotation.z=Math.PI/2;part(BX(0.3,0.015,0.03),0xf2c94c,g,0,0.13,0,0);}},
  back:{name:'✋ Behind back',pose:'back',use:null,build:g=>{}},
  pizza:{name:'🍕 Pizza slice',pose:'front',use:'bite',lock:['dogs',3,'Finish 3 hot dogs'],build:g=>{const m=part(CY(0.24,0.24,0.03,3),0xf2c14e,g,0,0.05,0,0.02);m.rotation.y=Math.PI/2;[[0.05,0.02],[-0.06,-0.04],[0.02,-0.1]].forEach(([x,z])=>part(CY(0.03,0.03,0.035,8),0xc0392b,g,x,0.055,z,0));}},
  corndog:{name:'🌽 Corn dog',pose:'front',use:'bite',lock:['slices',3,'Finish 3 pizza slices'],build:g=>{part(BX(0.02,0.3,0.02),0xd9b38c,g,0,0.0,0,0.01);part(CY(0.05,0.045,0.24,8),0xc98b3a,g,0,0.2,0,0.02);}},
  coffee:{name:'☕ Coffee',pose:'raise',use:'sip',lock:['rounds',3,'Finish 3 rounds'],build:g=>{part(CY(0.07,0.065,0.14,12),0xffffff,g,0,0.06,0,0.02);const h=part(new THREE.TorusGeometry(0.04,0.012,6,10),0xffffff,g,0.08,0.06,0,0.01);h.rotation.y=Math.PI/2;part(CY(0.066,0.066,0.01,12),0x5b3a24,g,0,0.125,0,0);}},
  icecream:{name:'🍦 Ice cream',pose:'raise',use:'bite',lock:['aces',1,'Get an ace'],build:g=>{const c=part(new THREE.ConeGeometry(0.06,0.18,8),0xd9a45b,g,0,0.0,0,0.015);c.rotation.x=Math.PI;part(IC(0.075),0xffb3c7,g,0,0.13,0,0.015);}},
  phone:{name:'📱 Phone',pose:'phone',use:null,lock:['windows',3,'Break 3 windows'],build:g=>{part(BX(0.09,0.17,0.015),0x1d1a16,g,0,0.06,0,0.01);part(BX(0.075,0.14,0.005),0x7fd0ff,g,0,0.06,-0.01,0);}},
  turkey:{name:'🍗 Turkey leg',pose:'front',use:'bite',lock:['holesWon',10,'Win 10 holes'],build:g=>{part(IC(0.1),0xa0522d,g,0,0.12,0,0.02).scale.set(0.9,1.3,0.9);part(CY(0.025,0.025,0.16,6),0xf5f0e0,g,0,-0.02,0,0.01);}},
  gnome:{name:'🧙 Stolen gnome',pose:'front',use:null,lock:['gnome',1,'Win a hole on the garden gnome'],build:g=>{part(new THREE.ConeGeometry(0.1,0.2,8),0x2f80ed,g,0,0.1,0,0.015);part(IC(0.06),0xffd9b3,g,0,0.24,0,0.01);part(new THREE.ConeGeometry(0.07,0.15,8),0xd62828,g,0,0.35,0,0.01);}},
  trophy:{name:'🏆 Trophy',pose:'raise',use:null,lock:['games',1,'Win a full game'],build:g=>{part(CY(0.1,0.05,0.14,10),0xf2c94c,g,0,0.16,0,0.02);part(CY(0.02,0.02,0.1,6),0xf2c94c,g,0,0.05,0,0.01);part(BX(0.12,0.04,0.12),0x5b3a24,g,0,-0.01,0,0.01);}},
};
/* play stats unlock hand items (kept on this device) */
let TALLY:Record<string,number>={};try{TALLY=JSON.parse(localStorage.getItem('byg_stats')||'{}')||{};}catch(e){TALLY={};}
const isUnlocked=(k:string)=>{const l=PROPDEF[k]&&PROPDEF[k].lock;return !!PROPDEF[k]&&(!l||(TALLY[l[0]]||0)>=l[1]);};
const KNOWN=new Set(Object.keys(PROPDEF).filter(isUnlocked));
function bump(k:string,n=1){TALLY[k]=(TALLY[k]||0)+n;try{localStorage.setItem('byg_stats',JSON.stringify(TALLY));}catch(e){}
  Object.keys(PROPDEF).forEach(pk=>{if(isUnlocked(pk)&&!KNOWN.has(pk)){KNOWN.add(pk);setTimeout(()=>{toast('Unlocked!',`${PROPDEF[pk].name} is in the hand menu now`,2400);sfx('win');},1900);}});}
function offPose(pose:string,s:number,w:number){ // arm direction from the shoulder in the golfer's frame (+z toward the ball). s: -1 trail side, +1 lead side
  if(pose==='raise')return new V(s*0.25,0.4+w*0.06,0.88);if(pose==='front')return new V(-s*0.15,-0.25+w*0.05,0.95);
  if(pose==='phone')return new V(-s*0.22,0.05+w*0.02,0.95);return new V(-s*0.3,-0.8,-0.5);}
function makeGolfer():import('./game-types.ts').Golfer{
  const g=new THREE.Group(),props:Record<string,THREE.Group>={};
  const legs=[-0.14,0.14].map(x=>{const hip=new THREE.Group();hip.position.set(x,0.47,0);g.add(hip);part(CY(0.11,0.12,0.4,8),0x2c3e66,hip,0,-0.22,0,0.045);part(BX(0.19,0.1,0.3),0x1d1a16,hip,0,-0.42,0.05,0.03);return hip;});
  const shirt=part(CY(0.3,0.35,0.55,12),0xff5a36,g,0,0.74,0,0.045);
  part(IC(0.43),0xffd9b3,g,0,1.3,0,0.045);
  const cap=part(new THREE.SphereGeometry(0.45,12,6,0,Math.PI*2,0,Math.PI/2),0xff5a36,g,0,1.36,0,0.04),brim=part(BX(0.5,0.05,0.34),0xff5a36,g,0,1.4,0.44,0.03);
  [-0.15,0.15].forEach(x=>{part(IC(0.13),0xffffff,g,x,1.3,0.33,0.025);part(IC(0.05,0),0x1d1a16,g,x*0.85,1.3,0.45,0);});part(BX(0.17,0.035,0.02),0x1d1a16,g,0,1.1,0.39,0);
  const arm=(par:THREE.Object3D)=>{part(CY(0.075,0.075,0.5,6),0xffd9b3,par,0,-0.25,0,0.03);const sl=part(CY(0.11,0.1,0.2,8),0xff5a36,par,0,-0.08,0,0.03);part(IC(0.09,0),0xffd9b3,par,0,-0.5,0,0.025);return sl;};
  const clubPivot=new THREE.Group();g.add(clubPivot);const lean=new THREE.Group();lean.rotation.x=-0.5;clubPivot.add(lean);const s1=arm(lean);
  const cl=new THREE.Group();cl.position.y=-0.5;cl.rotation.x=-0.5;lean.add(cl);part(BX(0.035,0.62,0.035),0x9aa3a8,cl,0,-0.31,0,0.015);part(BX(0.2,0.07,0.07),0x444444,cl,0.06,-0.62,0,0.02);
  const offPivot=new THREE.Group();g.add(offPivot);const s2=arm(offPivot),propHand=new THREE.Group();propHand.position.y=-0.52;offPivot.add(propHand);
  for(const k in PROPDEF){const pg=new THREE.Group();PROPDEF[k].build(pg);props[k]=pg;propHand.add(pg);}
  g.traverse(m=>{if(m instanceof THREE.Mesh){m.castShadow=m.material!==OUT;}});scene.add(g);
  return {g,props,legs,shirt,cap,brim,s1,s2,clubPivot,offPivot,propHand,addr:0.25,offSide:1,swingT:-1,swingFrom:0,tripT:-1,tripWait:0,eatT:-1,eatIn:3+Math.random()*8,walkPh:0,dest:null,ph:Math.random()*6,base:0,walkDelay:0};}
function applyFood(p:Player){const pr=p.k.props[p.prop];if(!pr)return;if(p.prop==='hotdog')pr.scale.set(p.food,1,1);else if(PROPDEF[p.prop].use==='bite')pr.scale.setScalar(0.35+0.65*p.food);else pr.scale.setScalar(1);}
function dressKid(p:Player){const K=p.k;[K.shirt,K.s1,K.s2].forEach(m=>m.material=mat(p.color));K.cap.material=K.brim.material=mat(p.dark);
  for(const k in K.props)K.props[k].visible=k===p.prop;applyFood(p);
  const trail=p.stance===p.arm;K.offSide=trail?1:-1;K.clubPivot.position.set(trail?-0.22:0.22,0.92,0.14);K.addr=trail?0.25:-0.25;
  K.offPivot.position.set(K.offSide*0.3,0.92,0.02);if(K.swingT<0)K.clubPivot.rotation.z=K.addr;}
function idleKid(p:Player){const K=p.k,def=PROPDEF[p.prop],w=Math.sin(T*2.2+K.ph);let dir=offPose(def.pose,K.offSide,w).normalize(),tilt=0;
  if(K.eatT>=0&&def.use){tilt=Math.sin(Math.PI*Math.min(1,K.eatT/1.4));dir=dir.clone().lerp(MOUTH.set(-K.offSide*0.3,0.26,0.34).normalize(),tilt).normalize();}
  K.offPivot.quaternion.setFromUnitVectors(DOWN,dir);K.propHand.quaternion.copy(K.offPivot.quaternion).invert();if(def.use==='sip'&&tilt)K.propHand.rotateX(-0.9*tilt);}
function consume(p:Player){const def=PROPDEF[p.prop];
  if(def.use==='sip'){p.sips++;sfx('sip');if(p.sips>=6){p.sips=0;p.eaten++;bump(p.prop==='beer'?'beers':'drinks');}}
  else if(def.use==='bite'){p.food-=0.17;sfx('bite');if(p.food<0.3){p.eaten++;p.food=1;bump(p.prop==='hotdog'?'dogs':p.prop==='pizza'?'slices':'bites');}applyFood(p);}}
function addressOf(p:Player,ball:THREE.Vector3,yaw:number){const L=new V(Math.cos(yaw),0,-Math.sin(yaw)),rh=p.stance==='R',sg=rh?1:-1;
  return{pos:new V(ball.x+L.x*0.75*sg,ball.y-R,ball.z+L.z*0.75*sg),ry:rh?yaw-Math.PI/2:yaw+Math.PI/2,sx:rh?1:-1};}
function placeKid(p:Player,ball:THREE.Vector3,yaw:number){const a=addressOf(p,ball,yaw),g=p.k.g;g.position.copy(a.pos);g.rotation.x=0;g.rotation.y=a.ry;g.scale.x=a.sx;p.k.dest=null;p.k.tripT=-1;p.k.legs.forEach(l=>l.rotation.x=0);}
function walkTo(p:Player,yaw:number,delay=0){p.k.dest=addressOf(p,p.ball,yaw);p.k.walkDelay=delay;}
const angLerp=(a:number,b:number,t:number)=>{let d=((b-a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;return a+d*t;};
function stepGolfer(p:Player,dt:number){const K=p.k,g=K.g;
  if(K.swingT>=0){K.swingT=Math.min(1,K.swingT+dt/0.22);const e=1-Math.pow(1-K.swingT,3);K.clubPivot.rotation.z=K.swingFrom+(2.9-K.swingFrom)*e;g.rotation.y=K.base+g.scale.x*0.45*Math.sin(e*Math.PI/2);if(K.swingT>=1)K.swingT=-1;}
  if(K.tripT>=0){K.tripT+=dt;g.rotation.x=1.25*Math.sin(Math.PI*Math.min(1,K.tripT/1.1));K.legs[0].rotation.x=0.5;K.legs[1].rotation.x=-0.5;
    if(K.tripT>=1.1){K.tripT=-1;g.rotation.x=0;K.legs.forEach(l=>l.rotation.x=0);}}
  else if(K.dest&&K.swingT<0){if(K.walkDelay>0){K.walkDelay-=dt;}else{const dest=K.dest,d=dest.pos,dx=d.x-g.position.x,dz=d.z-g.position.z,dist=Math.hypot(dx,dz),sp=(p===cp()&&G.phase==='aim')?12:5.5;
    if(dist<0.06){const D=K.dest;K.dest=null;g.position.copy(D.pos);g.rotation.y=D.ry;g.scale.x=D.sx;K.legs.forEach(l=>l.rotation.x=0);K.clubPivot.rotation.z=K.addr;}
    else if(G.phase==='call'||G.phase==='between'){K.tripWait=Math.max(0,K.tripWait-dt);
      if(K.tripWait===0&&Math.random()<dt*0.2){K.tripT=0;K.tripWait=3;sfx('thunk',0.25);}}
    if(K.tripT<0&&dist>=0.06){const st=Math.min(dist,sp*dt);g.position.x+=dx/dist*st;g.position.z+=dz/dist*st;g.position.y=H(g.position.x,g.position.z);g.scale.x=dest.sx;
      g.rotation.y=angLerp(g.rotation.y,dist<0.8?dest.ry:Math.atan2(dx,dz)*1+(g.scale.x<0?0:0),Math.min(1,dt*10));
      K.walkPh+=st*3.4;K.legs[0].rotation.x=Math.sin(K.walkPh)*0.7;K.legs[1].rotation.x=-Math.sin(K.walkPh)*0.7;K.clubPivot.rotation.z=K.addr+Math.sin(K.walkPh)*0.25;}}}
  if(K.eatT>=0){const pr=K.eatT;K.eatT+=dt;if(pr<0.7&&K.eatT>=0.7)consume(p);if(K.eatT>1.4)K.eatT=-1;}
  else if(PROPDEF[p.prop].use&&!(p===cp()&&(G.charging||G.armed||G.phase==='flight'))){K.eatIn-=dt;if(K.eatIn<=0){K.eatT=0;K.eatIn=7+Math.random()*9;}}
  idleKid(p);}
function clearGolfers(){G.players.forEach(p=>{if(p.k)scene.remove(p.k.g);});}

function showZones(){OBJS.forEach(o=>{for(const k in o.zones)o.zones[k].mesh.visible=false;});
  if(G.rule?.zones&&G.target)G.rule.zones.forEach(n=>{const z=G.target?.zones[n];if(z)z.mesh.visible=true;});}
export { BX, CY, DOWN, G, IC, KNOWN, MODIFIERS, MOUTH, PROPDEF, TALLY, TRN, addressOf, aimCone, aimDots, angLerp, applyFood, ballMeshes, bump, canScore, clearGolfers, coneGeo, consume, cp, dressKid, idleKid, isLead, isTgt, isUnlocked, launchG, launchPivot, makeBall, makeGolfer, markFirstContact, marker, mlCv, mlSpr, mlTex, offPose, physStep, placeKid, setMarkerLabel, shadow, showZones, simStep, stepGolfer, trAcc, trGeo, trN, traceStart, traceTick, tracer, walkTo };
