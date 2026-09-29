import * as THREE from 'three';
import { XMIN, XMAX, ZMIN, ZMAX, PADS, sstep, rawH, H, TG, meshH, groundN, addPad, padRect } from './terrain.ts';
import { HOUSES, WALLN, WALLC, ROOFC, POOLS, ANCH } from './map-data.ts';
import { WX, WZ, faceAt, poly, inPoly, WOODS, PARKTREES, FIELD, SANDP, inWoods } from './map.ts';
import { DEG, OUT, Q, R, V, mat, part, scene, toon } from './render.ts';
import { inZone } from './physics.ts';
import { MATSND, sfx } from './audio.ts';
import { G, bump } from './game.ts';
import { OBJBY } from './input.ts';
import type { WorldObject, WorldCollider, ColliderDraft, Rule, ZoneReady, GlassInfo, TargetMember } from './world-types.ts';
import type { Zone } from './physics.ts';


/* ---------- world objects & colliders ---------- */
const OBJS:WorldObject[]=[];
const COLL:WorldCollider[]=[], FRICZ:{z:Zone;dec:number}[]=[];
let seed=11;const rnd=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

// paths (px polylines)
const PATHS=[
  [[820,20],[870,150],[905,215],[940,300],[1000,430],[1060,530],[1125,620],[1165,700],[1190,760]],
  [[1190,760],[1135,790],[1100,840],[1060,915]],
  [[1060,915],[985,925],[900,890],[815,850]],
  [[1060,915],[1110,980],[1140,1060],[1165,1130],[1160,1200],[1110,1290],[1060,1370],[1035,1430]],
  [[1190,760],[1280,715],[1420,700],[1550,685],[1620,660],[1680,560],[1760,430],[1830,375],[1895,300],[1935,210],[1945,100],[1990,20]],
  [[1420,700],[1455,790],[1495,900]],
  [[590,1330],[850,1330],[950,1380],[1035,1430],[1140,1465]],
  [[1140,1465],[1300,1455],[1450,1460],[1560,1465],[1690,1470]],
  [[1690,1470],[1700,1330],[1690,1270]],
  [[1690,1470],[1740,1580],[1780,1700]],
  [[1690,1470],[1800,1420],[1950,1360],[2150,1350]],
  [[1140,1465],[1145,1600],[1110,1640],[1030,1700]],
  [[190,1060],[560,1060],[660,1150]],[[380,860],[380,1060]]
];
type Segment=[number,number,number,number];
const PGRID=new Map<number,Segment[]>(),PC=6,pkey=(ix:number,iz:number)=>ix*100000+iz;
const ROADS=[ // px polylines; cul-de-sacs are round
  [[60,110],[140,170],[330,240],[480,290],[600,285],[760,235],[900,185],[1060,120],[1200,95],[1330,95],[1460,110],[1590,160],[1700,250],[1800,340],[1890,410],[2000,440],[2176,440]], // Crystal Spring Dr
  [[410,295],[380,420],[352,520],[345,650],[352,780],[362,830]], // Mirror Light Pl
  [[705,270],[715,400],[730,520],[740,640],[752,760],[780,830]], // Morning Wind Pl
  [[1305,110],[1308,260],[1340,340],[1385,420],[1410,488]], // Gray Owl Pl
  [[2176,800],[2000,810],[1850,822],[1700,842],[1560,872],[1500,905]], // Thunder Hill Pl
  [[2176,1160],[2000,1182],[1850,1210],[1750,1240],[1690,1272]], // Sea Wind
  [[0,1545],[600,1545]], // school drive
  [[560,1712],[900,1705],[1250,1700],[1600,1702],[1950,1700]] // south street
];
const CULS:[number,number][]=
  [[362,830],[780,830],[1410,488],[1500,905],[1690,1272]].map(([px,py]):[number,number]=>[WX(px),WZ(py)]);
const RHALF=4,CULR=10,RSEG:Segment[]=[];
const ROADCURVES=ROADS.map(pl=>{const c=new THREE.CatmullRomCurve3(pl.map(([px,py])=>new V(WX(px),0,WZ(py))));const pts=c.getSpacedPoints(Math.max(2,Math.ceil(c.getLength()/2)));
  for(let i=0;i<pts.length-1;i++)RSEG.push([pts[i].x,pts[i].z,pts[i+1].x,pts[i+1].z]);return pts;});
const RGRID=new Map<number,Segment[]>();RSEG.forEach(s=>{for(let ix=Math.floor((Math.min(s[0],s[2])-8)/PC);ix<=Math.floor((Math.max(s[0],s[2])+8)/PC);ix++)for(let iz=Math.floor((Math.min(s[1],s[3])-8)/PC);iz<=Math.floor((Math.max(s[1],s[3])+8)/PC);iz++){const k=pkey(ix,iz);if(!RGRID.has(k))RGRID.set(k,[]);RGRID.get(k)?.push(s);}});
const segNear=(s:Segment,x:number,z:number):[number,number]=>{const dx=s[2]-s[0],dz=s[3]-s[1],t=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/(dx*dx+dz*dz||1)));return[s[0]+dx*t,s[1]+dz*t];};
function roadSurf(x:number,z:number){ // distance to the edge of pavement (negative = on the road)
  let best=99;const l=RGRID.get(pkey(Math.floor(x/PC),Math.floor(z/PC)));if(l)for(const s of l){const [nx,nz]=segNear(s,x,z);best=Math.min(best,Math.hypot(x-nx,z-nz)-RHALF);}
  for(const [cx,cz] of CULS)best=Math.min(best,Math.hypot(x-cx,z-cz)-CULR);return best;}
function roadNearest(x:number,z:number){let bd=1e9,bx0=0,bz0=0;for(const s of RSEG){const [nx,nz]=segNear(s,x,z),d=Math.hypot(x-nx,z-nz)-RHALF;if(d<bd){bd=d;bx0=nx;bz0=nz;}}
  for(const [cx,cz] of CULS){const d=Math.hypot(x-cx,z-cz)-CULR;if(d<bd){bd=d;bx0=cx;bz0=cz;}}return{d:bd,x:bx0,z:bz0};}
// house layout: every house turns its front door to the nearest street and sits back from the curb
const HL:{x:number;z:number;a:number;rd:number}[]=[];
function pathDist(x:number,z:number){const l=PGRID.get(pkey(Math.floor(x/PC),Math.floor(z/PC)));if(!l)return 99;let best=99;
  for(const s of l){const dx=s[2]-s[0],dz=s[3]-s[1],t=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-s[0]-dx*t,z-s[1]-dz*t));}return best;}
const PATHCURVES=PATHS.map(pl=>{const c=new THREE.CatmullRomCurve3(pl.map(([px,py])=>new V(WX(px),0,WZ(py))));const pts=c.getSpacedPoints(Math.max(2,Math.ceil(c.getLength()/1.5)));
  for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],s:Segment=[a.x,a.z,b.x,b.z];
    for(let ix=Math.floor((Math.min(a.x,b.x)-3)/PC);ix<=Math.floor((Math.max(a.x,b.x)+3)/PC);ix++)for(let iz=Math.floor((Math.min(a.z,b.z)-3)/PC);iz<=Math.floor((Math.max(a.z,b.z)+3)/PC);iz++){const k=pkey(ix,iz);if(!PGRID.has(k))PGRID.set(k,[]);PGRID.get(k)?.push(s);}}
  return pts;});
const GRASSI={dec:2.6,snd:'grass'},PATHI={dec:1.3,snd:'path'},WOODI={dec:4.5,snd:'soft'},SANDI={dec:9,snd:'sand'},WATERI={dec:14,snd:'water'};
function groundInfo(p:THREE.Vector3){for(const fz of FRICZ)if(inZone(fz.z,p))return fz.dec>12?WATERI:SANDI;
  if(inPoly(SANDP,p.x,p.z))return SANDI;if(pathDist(p.x,p.z)<1.35||roadSurf(p.x,p.z)<0)return PATHI;if(inWoods(p.x,p.z))return WOODI;return GRASSI;}

// push a point out of any house footprint (11x8 m, rotated) plus a margin
function clearHouse(x:number,z:number,m:number):[number,number]{for(let it=0;it<8;it++){let moved=false;
  for(const h of HL){const hx=h.x,hz=h.z,a=h.a,c=Math.cos(a),s=Math.sin(a),dx=x-hx,dz=z-hz;
    let lx=dx*c-dz*s,lz=dx*s+dz*c;const ex=5.5+m-Math.abs(lx),ez=4+m-Math.abs(lz);
    if(ex>0&&ez>0){if(ex<ez)lx=Math.sign(lx||1)*(5.5+m+0.1);else lz=Math.sign(lz||1)*(4+m+0.1);x=hx+lx*c+lz*s;z=hz-lx*s+lz*c;moved=true;}}
  if(!moved)break;}return[x,z];}
function makeObj(id:string,name:string,emoji:string,x:number,z:number,ry:number,rules:Rule[]=[],padR:number|null=1.5,clr=1.5):WorldObject{MKEY=id;if(padR!==null&&clr){[x,z]=clearHouse(x,z,clr);const rn=roadNearest(x,z);if(rn.d<clr+1&&id!=='school'){const dx=x-rn.x,dz=z-rn.z,l=Math.hypot(dx,dz)||1,want=l+(clr+1-rn.d);x=rn.x+dx/l*want;z=rn.z+dz/l*want;}}const g=new THREE.Group();const y=padR===null?0:padR?addPad(x,z,padR):H(x,z);g.position.set(x,y,z);g.rotation.y=ry||0;scene.add(g);
  const o:WorldObject={id,name,emoji,g,cols:[],zones:{},rules,fz:[],cur:g,center:new V(x,y,z),top:y,size:new V(1,1,1)};OBJS.push(o);return o;}
const par=(o:WorldObject)=>o.cur||o.g;
interface MergeItem {geo:THREE.BufferGeometry;col:number;node:THREE.Object3D;pos:THREE.Vector3;rot:THREE.Euler;t:number;key:string}
const MERGE:MergeItem[]=[];
let MKEY='misc';
const FADEG:import('./world-types.ts').FadeGroups={};
function mergeVis(geo:THREE.BufferGeometry,col:number,node:THREE.Object3D,x:number,y:number,z:number,rot:THREE.Euler,t=0.035){MERGE.push({geo,col,node,pos:new V(x,y,z),rot:rot.clone(),t,key:MKEY});}
const MSOLID=toon({vertexColors:true}),MFADE=toon({vertexColors:true,transparent:true,opacity:0.2,depthWrite:false});
function buildMerged(){scene.updateMatrixWorld(true);const groups:Record<string,MergeItem[]>={};MERGE.forEach(e=>(groups[e.key]=groups[e.key]||[]).push(e));
  const col=new THREE.Color(),m=new THREE.Matrix4(),q=new Q();
  for(const key in groups){const P:number[]=[],N:number[]=[],C:number[]=[],OP:number[]=[],ON:number[]=[];
    const push=(g:THREE.BufferGeometry,A:number[],Bn:number[],cl:THREE.Color|null)=>{const pa=g.attributes.position.array,na=g.attributes.normal.array;for(let i=0;i<pa.length;i++){A.push(pa[i]);Bn.push(na[i]);}if(cl)for(let i=0;i<pa.length/3;i++)C.push(cl.r,cl.g,cl.b);};
    for(const e of groups[key]){m.compose(e.pos,q.setFromEuler(e.rot),new V(1,1,1)).premultiply(e.node.matrixWorld);
      const ni=(gg:THREE.BufferGeometry)=>gg.index?gg.toNonIndexed():gg.clone();const g=ni(e.geo).applyMatrix4(m);col.setHex(e.col);push(g,P,N,col);
      if(e.t>0){e.geo.computeBoundingBox();const sz=new V();if(!e.geo.boundingBox)throw new Error('Geometry has no bounds');e.geo.boundingBox.getSize(sz);
        const og=ni(e.geo);og.scale((sz.x+2*e.t)/Math.max(sz.x,1e-3),(sz.y+2*e.t)/Math.max(sz.y,1e-3),(sz.z+2*e.t)/Math.max(sz.z,1e-3));og.applyMatrix4(m);push(og,OP,ON,null);}}
    const mk=(A:number[],Bn:number[],withC:boolean)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(A,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Bn,3));if(withC)g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));return g;};
    const mesh=new THREE.Mesh(mk(P,N,true),MSOLID),out=new THREE.Mesh(mk(OP,ON,false),OUT);scene.add(mesh);scene.add(out);FADEG[key]={mesh,out};}}
interface ShapeOpts {rx?:number;ry?:number;rz?:number;merge?:boolean|number;nomerge?:boolean;t?:number;nocol?:boolean;part?:string;rest?:number;fric?:number;bouncy?:boolean;snd?:string;rt?:number;seg?:number;det?:number;sc?:[number,number,number];leaf?:boolean}
function bx(o:WorldObject,w:number,h:number,d:number,col:number,x:number,y:number,z:number,op:ShapeOpts={}){const e=new THREE.Euler(op.rx||0,op.ry||0,op.rz||0);let m=null;if(op.merge!==false&&!op.nomerge)mergeVis(new THREE.BoxGeometry(w,h,d),col,par(o),x,y,z,e,op.t??0.035);else{m=part(new THREE.BoxGeometry(w,h,d),col,par(o),x,y,z,op.t);m.rotation.copy(e);}
  if(!op.nocol)o.cols.push({kind:'obb',node:par(o),lc:new V(x,y,z),h:new V(w/2,h/2,d/2),lq:new Q().setFromEuler(e),part:op.part,rest:op.rest??0.42,fric:op.fric,bouncy:op.bouncy,snd:op.snd});return m;}
function cy(o:WorldObject,r:number,h:number,col:number,x:number,y:number,z:number,op:ShapeOpts={}){const rt=op.rt??r;let m=null;if(op.merge!==false&&!op.nomerge)mergeVis(new THREE.CylinderGeometry(rt,r,h,op.seg||10),col,par(o),x,y,z,new THREE.Euler(),op.t??0.035);else m=part(new THREE.CylinderGeometry(rt,r,h,op.seg||10),col,par(o),x,y,z,op.t);
  if(!op.nocol)o.cols.push({kind:'cyl',node:par(o),lc:new V(x,y,z),r:Math.max(r,rt),hh:h/2,part:op.part,rest:op.rest??0.42,fric:op.fric,bouncy:op.bouncy,snd:op.snd});return m;}
function cone(o:WorldObject,r:number,h:number,col:number,x:number,y:number,z:number,op:ShapeOpts={}){const m=part(new THREE.ConeGeometry(r,h,op.seg||8),col,par(o),x,y,z,op.t);
  if(!op.nocol)o.cols.push({kind:'cyl',node:par(o),lc:new V(x,y,z),r:r*0.6,hh:h/2,part:op.part,rest:op.rest??0.3});return m;}
function sp(o:WorldObject,r:number,col:number,x:number,y:number,z:number,op:ShapeOpts={}){const m=part(new THREE.IcosahedronGeometry(r,op.det??1),col,par(o),x,y,z,op.t);if(op.sc)m.scale.set(op.sc[0],op.sc[1],op.sc[2]);
  if(!op.nocol)o.cols.push({kind:op.leaf?'leaf':'sph',node:par(o),lc:new V(x,y,z),r:r*(op.sc?Math.max(...op.sc):1)*0.95,part:op.part,rest:op.rest??0.3,mesh:m});return m;}
const ZMAT=new THREE.MeshBasicMaterial({color:0xffe14d,transparent:true,opacity:0.3,depthWrite:false});
interface ZoneSpec {x?:number;y?:number;z?:number;r?:number;w?:number;h:number;d?:number;rx?:number;ry?:number;rz?:number}
function zone(o:WorldObject,name:string,s:ZoneSpec,fric?:number):ZoneReady{
  const lc=new V(s.x||0,s.y||0,s.z||0),node=par(o);let z:ZoneReady;
  if(s.r){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(s.r,s.r,s.h,24),ZMAT);
    z={kind:'cyl',lc,c:lc.clone(),r:s.r,hh:s.h/2,node,mesh};}
  else{if(s.w==null||s.d==null)throw new Error(`Invalid zone: ${name}`);
    const h=new V(s.w/2,s.h/2,s.d/2),lq=new Q().setFromEuler(new THREE.Euler(s.rx||0,s.ry||0,s.rz||0));
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(s.w,s.h,s.d),ZMAT);
    z={kind:'obb',lc,c:lc.clone(),h,lq,q:lq.clone(),qi:lq.clone().invert(),node,mesh};}
  z.mesh.position.copy(lc);if(z.kind==='obb'&&z.lq)z.mesh.quaternion.copy(z.lq);
  z.mesh.visible=false;z.mesh.userData.zone=true;node.add(z.mesh);
  o.zones[name]=z;if(fric)o.fz.push({z,dec:fric});return z;}
const tq=new Q();
function assertCollider(c:ColliderDraft):asserts c is ColliderDraft & WorldCollider{
  if(!c.c||c.br==null||(c.kind==='obb'&&(!c.q||!c.qi)))
    throw new Error('Collider was not finalized');
}
function finalize(o:WorldObject){o.g.updateMatrixWorld(true);
  if(!o.members){const box=new THREE.Box3();o.g.children.forEach(ch=>{if(!ch.userData.zone)box.expandByObject(ch);});
    o.center=box.getCenter(new V());o.top=box.max.y;o.size=box.getSize(new V());}
  for(const c of o.cols){c.obj=o;if(!c.snd)c.snd=c.part==='leaves'?'leaf':c.bouncy?'boing':c.rest<0.1?'soft':MATSND[o.id]||'wood';
    const nd=c.node||o.g;c.c=c.lc.clone().applyMatrix4(nd.matrixWorld);
    if(c.kind==='obb'){c.q=nd.getWorldQuaternion(new Q()).multiply(c.lq);c.qi=c.q.clone().invert();c.br=c.h.length();}
    else if(c.kind==='cyl')c.br=Math.hypot(c.r,c.hh??0);else if(c.kind==='ring')c.br=Math.hypot(c.ro,c.hh);else c.br=c.r;
    assertCollider(c);COLL.push(c);}
  for(const k in o.zones){const z=o.zones[k],nd=z.node||o.g;z.c=z.lc.clone().applyMatrix4(nd.matrixWorld);if(z.kind==='obb'){if(!z.lq)throw new Error('Box zone needs local rotation');z.q=nd.getWorldQuaternion(new Q()).multiply(z.lq);z.qi=z.q.clone().invert();}}
  if(!o.members){const box=new THREE.Box3();o.g.children.forEach(ch=>{if(!ch.userData.zone)box.expandByObject(ch);});
    o.cols.forEach(c=>{assertCollider(c);if(c.kind==='obb'){for(let k=0;k<8;k++)box.expandByPoint(new V(k&1?c.h.x:-c.h.x,k&2?c.h.y:-c.h.y,k&4?c.h.z:-c.h.z).applyQuaternion(c.q).add(c.c));}
      else{const e=c.kind==='cyl'?c.r:c.br;box.expandByPoint(new V(c.c.x-e,c.c.y-(c.hh||e),c.c.z-e));box.expandByPoint(new V(c.c.x+e,c.c.y+(c.hh||e),c.c.z+e));}});
    if(box.isEmpty())box.setFromCenterAndSize(o.g.position,new V(1,1,1));o.center=box.getCenter(new V());o.top=box.max.y;o.size=box.getSize(new V());}
  o.fz.forEach(f=>FRICZ.push(f));}
// where to aim / put the marker for a target; grouped targets (houses, pools) use their nearest member
function tgt(o:WorldObject,from:THREE.Vector3){if(o.members&&o===G.target&&G.targetSub!=null)return o.members[G.targetSub];if(!o.members)return{c:o.center,top:o.top,r:Math.max(o.size.x,o.size.z)/2};
  let b=o.members[0],bd=1e9;for(const m of o.members){const d=(m.c.x-from.x)**2+(m.c.z-from.z)**2;if(d<bd){bd=d;b=m;}}return b;}

// glass
interface GlassPane {
  kind:'obb';node:THREE.Object3D;lc:THREE.Vector3;h:THREE.Vector3;lq:THREE.Quaternion;
  part:string;rest:number;snd:string;glass:GlassInfo;
  c?:THREE.Vector3;q?:THREE.Quaternion;qi?:THREE.Quaternion;br?:number;off?:boolean;
}
function assertGlass(c:GlassPane):asserts c is GlassPane & {c:THREE.Vector3;q:THREE.Quaternion;qi:THREE.Quaternion;br:number}{
  if(!c.c||!c.q||!c.qi||c.br==null)throw new Error('Glass pane is not finalized');
}
const GLASS:GlassPane[]=[],GLASSMAT=new THREE.MeshLambertMaterial({color:0xbfe9ff,transparent:true,opacity:0.85}),BROKEMAT=new THREE.MeshBasicMaterial({color:0x1b2026});
function glassPane(o:WorldObject,x:number,y:number,z:number,w:number,h:number,ry=0){
  const c:GlassPane={kind:'obb',node:par(o),lc:new V(x,y,z),h:new V(w/2,h/2,0.05),lq:new Q().setFromEuler(new THREE.Euler(0,ry,0)),part:'glass',rest:0.35,snd:'thunk',glass:{w,h}};
  o.cols.push(c);GLASS.push(c);}
let GI:THREE.InstancedMesh|null=null,GB:THREE.InstancedMesh|null=null;const ZERO=new THREE.Matrix4().makeScale(0,0,0);
function buildGlass(){const g=new THREE.BoxGeometry(1,1,0.06),intact=new THREE.InstancedMesh(g,GLASSMAT,GLASS.length),broken=new THREE.InstancedMesh(g,BROKEMAT,GLASS.length);
  GI=intact;GB=broken;
  GLASS.forEach((c,i)=>{assertGlass(c);c.glass.i=i;c.glass.m=new THREE.Matrix4().compose(c.c,c.q,new V(c.glass.w,c.glass.h,1));intact.setMatrixAt(i,c.glass.m);broken.setMatrixAt(i,ZERO);});
  scene.add(intact);scene.add(broken);}
function setGlass(c:WorldCollider,broken:boolean){
  if(!GI||!GB||!c.glass||c.glass.i==null||!c.glass.m)throw new Error('Glass instances are not built');
  GI.setMatrixAt(c.glass.i,broken?ZERO:c.glass.m);GB.setMatrixAt(c.glass.i,broken?c.glass.m:ZERO);GI.instanceMatrix.needsUpdate=GB.instanceMatrix.needsUpdate=true;}
interface Shard {mesh:THREE.Mesh;v:THREE.Vector3;life:number}
const SHARDS:Shard[]=[],SHARDGEO=new THREE.TetrahedronGeometry(0.09);
function breakGlass(c:WorldCollider){if(c.kind!=='obb'||!c.glass)throw new Error('Only glass panes can break');
  c.off=true;setGlass(c,true);sfx('glass');bump('windows');
  const nrm=new V(0,0,1).applyQuaternion(c.q);
  for(let i=0;i<16;i++){const m=new THREE.Mesh(SHARDGEO,GLASSMAT);m.position.copy(c.c).add(new V((Math.random()-0.5)*c.h.x*2,(Math.random()-0.5)*c.h.y*2,0).applyQuaternion(c.q));
    const v=nrm.clone().multiplyScalar(1+Math.random()*2.5).add(new V((Math.random()-0.5)*2,Math.random()*2,(Math.random()-0.5)*2));scene.add(m);SHARDS.push({mesh:m,v,life:4});}}
function updateShards(dt:number){for(let i=SHARDS.length-1;i>=0;i--){const shard=SHARDS[i],m=shard.mesh;shard.life-=dt;
  if(shard.life<=0){scene.remove(m);SHARDS.splice(i,1);continue;}
  const g=H(m.position.x,m.position.z)+0.03;if(m.position.y>g){shard.v.y-=9.8*dt;m.position.addScaledVector(shard.v,dt);m.rotation.x+=dt*8;m.rotation.z+=dt*6;}else m.position.y=g;}}
function resetGlass(){GLASS.forEach(c=>{if(c.off){assertGlass(c);c.off=false;setGlass(c,false);}});SHARDS.forEach(shard=>scene.remove(shard.mesh));SHARDS.length=0;}
function textTex(lines:string[],fg:string,bg:string|null,w=256,h=128,px=46){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const x=cv.getContext('2d');if(!x)throw new Error('Canvas texture unavailable');
  if(bg){x.fillStyle=bg;x.fillRect(0,0,w,h);}x.fillStyle=fg;x.textAlign='center';x.textBaseline='middle';x.font=`900 ${px}px "Arial Black", Arial, sans-serif`;
  lines.forEach((l,i)=>x.fillText(l,w/2,h/2+(i-(lines.length-1)/2)*px*1.05));return new THREE.CanvasTexture(cv);}
function decal(o:WorldObject,tex:THREE.Texture,w:number,h:number,x:number,y:number,z:number,ry=0){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,transparent:true}));m.position.set(x,y,z);m.rotation.y=ry;par(o).add(m);return m;}

// static trees (not targets): trunk is solid, canopy is soft foliage the ball can pass through
const TREES:import('./world-types.ts').Tree[]=[];
const STATIC:WorldCollider[]=[];
const TM:import('./world-types.ts').TreeMeshes={};
function addTree(x:number,z:number,r:number,th:number){const y=H(x,z);TREES.push({x,z,y,r,th});
  const ti=TREES.length-1;STATIC.push({kind:'cyl',c:new V(x,y+th/2,z),r:0.18+r*0.06,hh:th/2,rest:0.35,snd:'wood',obj:null,br:Math.hypot(0.4,th/2),ti});
  STATIC.push({kind:'leaf',c:new V(x,y+th+r*0.55,z),r:r,snd:'leaf',obj:null,br:r,ti});}

const HOUSEPOS:{x:number;y:number;z:number;a:number;g:THREE.Group}[]=[];
const START=new V(WX(1215),0,WZ(735));
HOUSES.forEach(([px,py])=>{let x=WX(px),z=WZ(py);const rn=roadNearest(x,z);const dx=rn.x-x,dz=rn.z-z,l=Math.hypot(dx,dz)||1;
  if(rn.d<10.5){const push=10.5-rn.d;x-=dx/l*push;z-=dz/l*push;}HL.push({x,z,a:Math.atan2(dx,dz),rd:rn.d});});
// nudge apart any houses the turning made overlap
for(let it=0;it<6;it++)for(let i=0;i<HL.length;i++)for(let j=i+1;j<HL.length;j++){const a=HL[i],b=HL[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<12.5&&d>0.01){const m=(12.5-d)/2;a.x-=dx/d*m;a.z-=dz/d*m;b.x+=dx/d*m;b.z+=dz/d*m;}}

function where(x:number,z:number){if(inWoods(x,z))return'in the woods';let b=ANCH[0],bd=1e9;for(const a of ANCH){const d=(a[0]-x)**2+(a[1]-z)**2;if(d<bd){bd=d;b=a;}}return b[2];}
const JUNK:[string,string,string,(o:WorldObject)=>void,[string,string,string?][]][]=[
  ['cone','Traffic Cone','🚧',o=>{cone(o,0.18,0.55,0xff7a1a,0,0.33,0,{seg:10});bx(o,0.4,0.05,0.4,0xff7a1a,0,0.025,0);bx(o,0.2,0.07,0.2,0xffffff,0,0.4,0,{nocol:true,t:0});},[['Hit the cone','contact']]],
  ['lamp','Lamp Post','💡',o=>{cy(o,0.07,4.2,0x2d3136,0,2.1,0,{part:'pole'});bx(o,0.45,0.3,0.45,0x2d3136,0,4.3,0,{part:'lamp'});bx(o,0.35,0.12,0.35,0xfff3b0,0,4.1,0,{nocol:true,t:0});},[['Hit the pole','contact','pole'],['Hit the lamp up top','contact','lamp']]],
  ['dogbin','Dog Bag Station','🐕',o=>{cy(o,0.05,1.3,0x3f6b4a,0,0.65,0);bx(o,0.3,0.4,0.15,0x3f6b4a,0,1.25,0.08);cy(o,0.25,0.7,0x3f6b4a,0.45,0.35,0,{seg:10});},[['Hit the dog bag station','contact']]],
  ['frisbee','Lost Frisbee','🥏',o=>{cy(o,0.14,0.04,0xff3b7f,0,0.02,0,{seg:14,t:0.015});},[['Hit the frisbee','contact']]],
  ['bball','Stray Basketball','🏀',o=>{sp(o,0.13,0xe4772b,0,0.13,0,{t:0.015});},[['Hit the basketball','contact']]],
  ['bike','Kid\'s Bike','🚲',o=>{[-0.45,0.45].forEach(x=>{const t=part(new THREE.TorusGeometry(0.3,0.04,6,14),0x222222,par(o),x,0.05,0,0.015);t.rotation.x=Math.PI/2;});
     bx(o,0.95,0.06,0.06,0x2f80ed,0,0.07,0,{t:0.015});bx(o,0.5,0.06,0.06,0x2f80ed,0.15,0.07,0.12,{ry:0.6,t:0.015});o.cols.push({kind:'obb',node:par(o),lc:new V(0,0.08,0),h:new V(0.8,0.1,0.32),lq:new Q(),rest:0.3,snd:'metal'});},[['Hit the bike','contact']]],
  ['chair','Lawn Chair','🪑',o=>{bx(o,0.8,0.07,0.7,0x3aa0a0,0,0.32,0,{part:'seat'});bx(o,0.8,0.62,0.06,0x3aa0a0,0,0.63,-0.38,{rx:-0.25});
     [-0.36,0.36].forEach(x=>bx(o,0.08,0.27,0.7,0xcccccc,x,0.14,0,{part:'frame'}));
     bx(o,0.8,0.27,0.08,0x3aa0a0,0,0.14,0.34,{part:'frame'});
     [[-0.36,0.28],[0.36,0.28],[-0.36,-0.28],[0.36,-0.28]].forEach(([x,z])=>cy(o,0.025,0.3,0xcccccc,x,0.15,z,{nocol:true,t:0.01}));},[['Hit the chair','contact'],['Hit the seat from above','top','seat']]],
  ['cooler','Cooler','🧊',o=>{bx(o,0.7,0.4,0.42,0x2f6fd0,0,0.2,0);bx(o,0.72,0.07,0.44,0xffffff,0,0.43,0,{part:'lid'});},[['Hit the cooler','contact'],['Hit the lid','top','lid']]],
  ['marker','Path Marker','🪧',o=>{bx(o,0.12,1.1,0.12,0x6b4423,0,0.55,0);bx(o,0.4,0.25,0.04,0x2f5a3a,0,1.0,0.08,{nocol:true,t:0.015});},[['Hit the path marker','contact']]],
  ['rock','Big Rock','🪨',o=>{sp(o,0.6,0x8a8a86,0,0.25,0,{det:0,sc:[1.2,0.7,1],rest:0.45});},[['Hit the rock','contact'],['Hit the top of the rock','top']]],
  ['bottle','Water Bottle','🧴',o=>{cy(o,0.04,0.22,0x9fd8ff,0,0.11,0,{seg:8,t:0.01});},[['Hit the water bottle','contact']]],
  ['skate','Skateboard','🛹',o=>{bx(o,0.8,0.03,0.22,0x333333,0,0.1,0,{t:0.015});[-0.28,0.28].forEach(x=>bx(o,0.06,0.06,0.2,0xf2c94c,x,0.05,0,{nocol:true,t:0.01}));},[['Hit the skateboard','contact']]],
  ['pumpkin','Pumpkin','🎃',o=>{sp(o,0.28,0xf28a1a,0,0.22,0,{sc:[1,0.8,1]});cy(o,0.03,0.12,0x4a7a2a,0,0.47,0,{nocol:true,t:0.01});},[['Smash the pumpkin','contact']]],
  ['leash','Leash Your Dog Sign','🦮',o=>{cy(o,0.05,1.8,0x9aa3a8,0,0.9,0,{part:'post'});bx(o,0.6,0.45,0.03,0xfafafa,0,1.6,0.05,{part:'sign'});decal(o,textTex(['LEASH','YOUR DOG'],'#2f5a3a',null,256,128,40),0.55,0.4,0,1.6,0.075);},[['Hit the post','contact','post'],['Ring the sign','contact','sign']]],
];
const MATX:Record<string,string>={cone:'plastic',lamp:'metal',dogbin:'metal',frisbee:'plastic',bball:'boing',bike:'metal',chair:'plastic',cooler:'plastic',marker:'wood',rock:'wood',bottle:'plastic',skate:'wood',pumpkin:'soft',leash:'metal'};
function pathJunk(){ // walk every path, drop a random item every ~24 m, alternating sides, away from other targets and houses
  const placed=OBJS.filter(o=>!o.members&&o.center).map(o=>[o.g.position.x,o.g.position.z]);OBJS.forEach(o=>{if(o.members&&o.id!=='houses')o.members.forEach(m=>placed.push([m.c.x,m.c.z]));});let n=0,side=1;
  PATHCURVES.forEach((pts,pi)=>{if(pi>=12)return;for(let i=6;i<pts.length-4;i+=16){const a=pts[i],b=pts[i+1],tx=b.x-a.x,tz=b.z-a.z,l=Math.hypot(tx,tz)||1;side=-side;
    let x=a.x-tz/l*2.1*side,z=a.z+tx/l*2.1*side;if(x<XMIN+8||x>XMAX-8||z<ZMIN+8||z>ZMAX-8)continue;
    if(placed.some(([px,pz])=>(px-x)**2+(pz-z)**2<14*14))continue;
    const [cx,cz]=clearHouse(x,z,1.5);if(Math.hypot(cx-x,cz-z)>0.1||pathDist(cx,cz)<1.7||roadSurf(cx,cz)<1.5)continue;
    const [kind,nm,em,build,rules]=JUNK[Math.floor(rnd()*JUNK.length)],id=`${kind}${n++}`;MATSND[id]=MATX[kind];
    const o=makeObj(id,`${nm} ${where(x,z)}`,em,x,z,rnd()*6.28,rules.map(([label,type,part])=>({label,type,part})),1,0);o.cat='path';build(o);finalize(o);placed.push([x,z]);}});}
/* ---------- yards: driveways, parked cars, bushes, flowers, patios, grills, sheds, hoops, back fences ---------- */
function groupObj(id:string,name:string,emoji:string,rules:Rule[],subRules:WorldObject['subRules']|null){
  const o=makeObj(id,name,emoji,0,0,0,rules,null);
  const members:TargetMember[]=[];
  return Object.assign(o,{members,subRules});
}
function member(o:WorldObject,hi:number,lx:number,lz:number,lry:number,name:string,top:number,r=1.5){const h=HOUSEPOS[hi],c=Math.cos(h.a),s=Math.sin(h.a),x=h.x+lx*c+lz*s,z=h.z-lx*s+lz*c,y=H(x,z);
  if(!o.members)throw new Error(`Object ${o.id} is not grouped`);
  const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=h.a+lry;o.g.add(g);o.cur=g;MKEY='h'+hi;o._c0=o.cols.length;o.members.push({c:new V(x,y+top*0.5,z),top:y+top,r,name});return g;}
function endMember(o:WorldObject,hi:number){if(!o.members||o._c0==null)throw new Error(`Object ${o.id} has no active member`);const idx=o.members.length-1;for(let k=o._c0;k<o.cols.length;k++){o.cols[k].sub=idx;o.cols[k].fk='h'+hi;}o.cur=o.g;}
const localToWorld=(hi:number,lx:number,lz:number):[number,number]=>{const h=HOUSEPOS[hi],c=Math.cos(h.a),s=Math.sin(h.a);return[h.x+lx*c+lz*s,h.z-lx*s+lz*c];};
function spotFree(hi:number,lx:number,lz:number,rad:number,okRoad=false){const [x,z]=localToWorld(hi,lx,lz);if(pathDist(x,z)<rad+1.6)return false;if(!okRoad&&roadSurf(x,z)<rad+0.3)return false;
  for(let j=0;j<HOUSES.length;j++){if(j===hi)continue;const h=HOUSEPOS[j],c=Math.cos(h.a),s=Math.sin(h.a),dx=x-h.x,dz=z-h.z,ax=dx*c-dz*s,az=dx*s+dz*c;if(Math.abs(ax)<5.5+rad+1&&Math.abs(az)<4+rad+1)return false;}
  for(const o of OBJS){if(o.members||!o.center||o.id==='school')continue;const r=Math.max(o.size.x,o.size.z)/2;if(Math.hypot(x-o.center.x,z-o.center.z)<r+rad+1)return false;}
  const pools=OBJS.find(o=>o.id==='pools');if(pools?.members?.some(m=>Math.hypot(x-m.c.x,z-m.c.z)<rad+5))return false;
  if(inPoly(FIELD,x,z)||inPoly(SANDP,x,z))return false;if(YARD.some(([yx,yz,yr,yh])=>yh!==hi&&Math.hypot(x-yx,z-yz)<rad+yr+0.6))return false;return true;}
const YARD:[number,number,number,number][]=[],DRIVES:[[number,number],[number,number]][]=[];const claim=(hi:number,lx:number,lz:number,r:number)=>{const [x,z]=localToWorld(hi,lx,lz);YARD.push([x,z,r,hi]);};
function yardClear(hi:number,lx:number,lz:number,r:number){if(!spotFree(hi,lx,lz,r))return false;const [wx,wz]=localToWorld(hi,lx,lz);
  return !YARD.some(([x,z,rad,owner])=>owner===hi&&Math.hypot(x-wx,z-wz)<rad+r);}
const CARC=[0xd62828,0x2f80ed,0xf2f2f2,0x333333,0x9aa3a8,0x2e7d4f,0xf2c94c,0x6b3f8a,0x8b1e1e];
function yards(){
  const cars=groupObj('cars','Any Parked Car','🚗',[{label:'Hit any parked car',type:'contact'},{label:'Break any car window',type:'brk',part:'glass'}],m=>[{label:'Hit this car',type:'contact'},{label:'Break this car\'s windshield',type:'brk',part:'glass'}]);
  const grills=groupObj('grills','Any Grill','🍖',[{label:'Hit any grill',type:'contact'}],m=>[{label:'Hit this grill',type:'contact'},{label:'Hit the grill lid from above',type:'top'}]);
  const sheds=groupObj('sheds','Any Shed','🛖',[{label:'Hit any shed',type:'contact'}],m=>[{label:'Hit this shed',type:'contact'},{label:'Land a shot on the shed roof',type:'top'}]);
  const hoops=groupObj('hoops','Any Basketball Hoop','🏀',[{label:'Swish any hoop',type:'through',zones:[]}],m=>[{label:'Swish it through this hoop',type:'through',zones:m.zone?[m.zone]:[]},{label:'Hit the backboard',type:'contact',part:'board'}]);
  const fences=groupObj('fences','Back Fences','🪵',[],null);
  const playsets=groupObj('playsets','Backyard Play Sets','🛝',[{label:'Hit any play set',type:'contact'},{label:'Hit a play set slide',type:'contact',part:'slide'}],m=>[{label:'Hit this play set',type:'contact'},{label:'Hit this slide',type:'contact',part:'slide'},{label:'Hit the platform from above',type:'top',part:'platform'}]);
  const kiddie=groupObj('kiddie','Kiddie Pools','💦',[{label:'Splash into any kiddie pool',type:'through',zones:[]}],m=>[{label:'Splash into this kiddie pool',type:'through',zones:m.zone?[m.zone]:[]},{label:'Hit the pool rim',type:'contact',part:'rim'}]);
  const gardens=groupObj('gardens','Vegetable Gardens','🥕',[{label:'Hit any garden bed',type:'contact',part:'bed'}],m=>[{label:'Hit this garden bed',type:'contact',part:'bed'},{label:'Land in this garden',type:'through',zones:m.zone?[m.zone]:[]}]);
  const bush:[number,number,number,number][]=[],flowers=[0xff6fa8,0xffd23f,0xffffff,0xb07cff,0xff7a3d];
  HOUSEPOS.forEach((h,i)=>{const nm=houseName(i),hn=nm.charAt(0).toLowerCase()+nm.slice(1);MKEY='h'+i;
    const side=rnd()<0.5?1:-1;
    // driveway: from the garage straight out to the curb; car parked on it; maybe a hoop beside it; mailbox at the street
    let L=0;for(let t=0.5;t<34;t+=0.5){const [wx,wz]=localToWorld(i,side*3.3,4.1+t);if(pathDist(wx,wz)<1.4){L=0;break;}if(roadSurf(wx,wz)<0.2){L=t+0.8;break;}}
    let blocked=false;for(let t=1;t<L-1;t+=1.5)if(!spotFree(i,side*3.3,4.1+t,1.4,true)){blocked=true;break;}
    if(L>1&&!blocked){for(let t=0;t<L;t+=1.5)claim(i,side*3.3,4.1+t,1.8);
      const a0=localToWorld(i,side*3.3,4.1),a1=localToWorld(i,side*3.3,4.1+L);DRIVES.push([a0,a1]);
      mergeVis(new THREE.BoxGeometry(2.8,2.4,0.08),0xe8e2d4,HOUSEPOS[i].g,side*3.3,1.2,4.05,new THREE.Euler(),0.03);
      {const [mx,mz]=localToWorld(i,side*5.3,4.1+L-1.2),hy=H(mx,mz)-HOUSEPOS[i].y;mergeVis(new THREE.BoxGeometry(0.1,1.1,0.1),0x5b3d2e,HOUSEPOS[i].g,side*5.3,hy+0.55,4.1+L-1.2,new THREE.Euler(),0.015);
       mergeVis(new THREE.BoxGeometry(0.34,0.3,0.5),[0x2b2b2b,0x2f5a3a,0x8b1e1e][i%3],HOUSEPOS[i].g,side*5.3,hy+1.2,4.1+L-1.2,new THREE.Euler(),0.02);}
      if(L>=6.5&&rnd()<0.85){const cc=CARC[Math.floor(rnd()*CARC.length)],ry=rnd()<0.5?0:Math.PI;member(cars,i,side*3.3,6.9,ry,`${['Red','Blue','White','Black','Silver','Green','Yellow','Purple','Maroon'][CARC.indexOf(cc)]} car at the ${hn}`,1.6,2.4);
        bx(cars,1.8,0.7,4.2,cc,0,0.62,0,{merge:1,part:'body',snd:'metal'});bx(cars,1.62,0.62,2.2,cc,0,1.28,-0.25,{merge:1,part:'body',snd:'metal'});
        [[-0.86,1.35],[0.86,1.35],[-0.86,-1.35],[0.86,-1.35]].forEach(([wx,wz])=>{mergeVis(new THREE.CylinderGeometry(0.33,0.33,0.24,10),0x1d1a16,cars.cur,wx,0.33,wz,new THREE.Euler(0,0,Math.PI/2),0.02);});
        glassPane(cars,0,1.3,0.87,1.45,0.48);glassPane(cars,0,1.3,-1.37,1.45,0.45,Math.PI);
        [[-0.82,-0.25],[0.82,-0.25]].forEach(([gx,gz])=>glassPane(cars,gx,1.3,gz,1.9,0.42,Math.PI/2*(gx<0?-1:1)));
        endMember(cars,i);}
      const hz0=4.1+Math.min(L*0.55,9);
      if(L>=5&&rnd()<0.35&&spotFree(i,side*5.4,hz0,0.8)){claim(i,side*5.4,hz0,1);const zn='hz'+hoops.members.length;member(hoops,i,side*5.3,hz0,-side*Math.PI/2,`Hoop at the ${hn}`,3.2,1);
        cy(hoops,0.06,3.1,0x333333,0,1.55,0,{merge:1});bx(hoops,1.2,0.8,0.05,0xffffff,0,3.0,0.12,{merge:1,part:'board'});
        mergeVis(new THREE.TorusGeometry(0.275,0.025,6,16),0xff6a00,hoops.cur,0,2.62,0.45,new THREE.Euler(Math.PI/2,0,0),0.01);
        hoops.cols.push({kind:'ring',node:hoops.cur,lc:new V(0,2.62,0.45),ri:0.25,ro:0.3,hh:0.03,part:'rim',rest:0.4,snd:'metal'});
        zone(hoops,zn,{r:0.24,h:0.24,y:2.5,z:0.45});hoops.members[hoops.members.length-1].zone=zn;if(!hoops.rules[0].zones)throw new Error('Hoop zones missing');hoops.rules[0].zones.push(zn);endMember(hoops,i);}}
    // bushes + flower bed along the front
    for(let k=0;k<4;k++){const bx0=-4.5+k*3+(rnd()-0.5);if(Math.abs(bx0)<1||Math.abs(bx0-side*3.3)<2)continue;const r=0.5+rnd()*0.35;
      mergeVis(new THREE.IcosahedronGeometry(r,1),[0x3f8f2f,0x4f9e38,0x2f7a36][k%3],HOUSEPOS[i].g,bx0,r*0.75,4.7,new THREE.Euler(),0.03);
      const [wx,wz]=localToWorld(i,bx0,4.7);bush.push([wx,H(wx,wz)+r*0.75,wz,r]);
      for(let f=0;f<3;f++)mergeVis(new THREE.IcosahedronGeometry(0.1,0),flowers[(k+f+i)%5],HOUSEPOS[i].g,bx0+(rnd()-0.5)*1.4,0.12,5.4+rnd()*0.4,new THREE.Euler(),0);}
    // patio + grill
    if(spotFree(i,-1,-6.2,1.5)){claim(i,-1,-6,2.2);mergeVis(new THREE.BoxGeometry(4.4,0.06,3.2),0xc9bfae,HOUSEPOS[i].g,-1,0.03,-5.8,new THREE.Euler(),0);
      if(rnd()<0.6){member(grills,i,-2.4,-6.2,rnd()*6,`Grill behind the ${hn}`,1.1,0.8);
        mergeVis(new THREE.SphereGeometry(0.36,10,6,0,Math.PI*2,Math.PI/2,Math.PI/2),0x1d1a16,grills.cur,0,0.9,0,new THREE.Euler(),0.02);
        mergeVis(new THREE.SphereGeometry(0.36,10,6,0,Math.PI*2,0,Math.PI/2),0x2b2b2b,grills.cur,0,0.92,0,new THREE.Euler(),0.02);
        [0,2.1,4.2].forEach(a=>mergeVis(new THREE.CylinderGeometry(0.02,0.02,0.9,5),0x555555,grills.cur,Math.cos(a)*0.25,0.45,Math.sin(a)*0.25,new THREE.Euler(),0));
        grills.cols.push({kind:'sph',node:grills.cur,lc:new V(0,0.9,0),r:0.37,rest:0.45,snd:'metal'});endMember(grills,i);}}
    const yardX=i%2?3.4:-3.4,yardZ=-9.3,kind=i%3;
    if(yardClear(i,yardX,yardZ,kind===0?2.2:1.6)){
      claim(i,yardX,yardZ,kind===0?2.4:1.8);
      if(kind===0){
        member(playsets,i,yardX,yardZ,0,`Play set behind the ${hn}`,2.5,2.3);
        [ [-0.8,-0.55],[0.8,-0.55],[-0.8,0.55],[0.8,0.55] ].forEach(([x,z])=>cy(playsets,0.07,2.4,0x9a6a3c,x,1.2,z,{merge:1}));
        bx(playsets,1.9,0.14,1.4,0xdca859,0,1.7,0,{part:'platform',merge:1});
        bx(playsets,2,0.12,1.5,0x34865b,0,2.48,0,{merge:1});
        bx(playsets,0.65,0.08,2.5,0xf2c94c,0,0.9,1.55,{rx:0.7,part:'slide',merge:1});
        [-0.3,0.3].forEach(x=>bx(playsets,0.06,0.2,2.5,0xe4812b,x,0.94,1.55,{rx:0.7,merge:1}));
        endMember(playsets,i);
      }else if(kind===1){
        const zn='pool'+kiddie.members.length;member(kiddie,i,yardX,yardZ,0,`Kiddie pool behind the ${hn}`,0.4,1);
        cy(kiddie,0.95,0.18,0x43bde8,0,0.12,0,{nocol:true,merge:1});
        cy(kiddie,0.83,0.02,0x86d8ed,0,0.22,0,{nocol:true,merge:1,t:0});
        kiddie.cols.push({kind:'ring',node:kiddie.cur,lc:new V(0,0.23,0),ri:0.78,ro:0.96,hh:0.12,part:'rim',rest:0.3,snd:'plastic'});
        zone(kiddie,zn,{r:0.76,h:0.35,y:0.27});kiddie.members[kiddie.members.length-1].zone=zn;if(!kiddie.rules[0].zones)throw new Error('Kiddie pool zones missing');kiddie.rules[0].zones.push(zn);endMember(kiddie,i);
      }else{
        const zn='garden'+gardens.members.length;member(gardens,i,yardX,yardZ,0,`Garden behind the ${hn}`,0.5,1.5);
        bx(gardens,2.6,0.08,1.7,0x49392a,0,0.08,0,{nocol:true,merge:1,t:0});
        [-0.84,0.84].forEach(z=>bx(gardens,2.8,0.3,0.12,0x96704b,0,0.22,z,{part:'bed',merge:1}));
        [-1.34,1.34].forEach(x=>bx(gardens,0.12,0.3,1.8,0x96704b,x,0.22,0,{part:'bed',merge:1}));
        for(let x=-0.85;x<=0.9;x+=0.85)for(let z=-0.42;z<=0.5;z+=0.9){
          mergeVis(new THREE.ConeGeometry(0.22,0.5,5),0x4f9e38,gardens.cur,x,0.45,z,new THREE.Euler(),0);
          gardens.cols.push({kind:'cyl',node:gardens.cur,lc:new V(x,0.45,z),r:0.16,hh:0.25,rest:0.1,snd:'leaf'});}
        zone(gardens,zn,{w:2.4,h:0.55,d:1.5,y:0.34});gardens.members[gardens.members.length-1].zone=zn;endMember(gardens,i);
      }
    }
    // shed in a back corner
    const sx=rnd()<0.5?-4.3:4.3;
    if(rnd()<0.45&&yardClear(i,sx,-10,1.8)){claim(i,sx,-10,1.9);member(sheds,i,sx,-10,0,`Shed behind the ${hn}`,3,1.8);const sc=[0xc0392b,0x7a8f5a,0xd8cfb8,0x6b7a8f][i%4];
      bx(sheds,2.6,2.2,2.2,sc,0,1.1,0,{merge:1});bx(sheds,2.9,0.12,1.35,0x4a3f38,0,2.5,0.55,{rx:0.6,merge:1});bx(sheds,2.9,0.12,1.35,0x4a3f38,0,2.5,-0.55,{rx:-0.6,merge:1});
      mergeVis(new THREE.BoxGeometry(0.9,1.7,0.05),0x5b3d2e,sheds.cur,0,0.85,1.12,new THREE.Euler(),0);endMember(sheds,i);}
    // back fence, only the stretches that don't hit a path or another yard
    member(fences,i,0,0,0,'fence',1.2);const fz=-13;
    const segs=[];for(let x0=-7;x0<7;x0+=2)segs.push([x0+1,fz,0]);for(let z0=-5;z0>fz;z0-=2){segs.push([-7,z0-1,Math.PI/2]);segs.push([7,z0-1,Math.PI/2]);}
    const fc=[0xb88a5a,0xe8e2d4,0x8a6a4a][i%3];
    segs.forEach(([lx,lz,ry])=>{if(!yardClear(i,lx,lz,0.8))return;claim(i,lx,lz,1);const e=new THREE.Euler(0,ry,0);
      mergeVis(new THREE.BoxGeometry(2,0.12,0.06),fc,fences.cur,lx,0.45,lz,e,0);mergeVis(new THREE.BoxGeometry(2,0.12,0.06),fc,fences.cur,lx,1.0,lz,e,0);
      for(let t=-0.9;t<=0.91;t+=0.3){const px=lx+(ry?0:t),pz=lz+(ry?t:0);mergeVis(new THREE.BoxGeometry(0.1,1.2,0.04),fc,fences.cur,px,0.6,pz,e,0.012);}
      fences.cols.push({kind:'obb',node:fences.cur,lc:new V(lx,0.6,lz),h:new V(1,0.6,0.05),lq:new Q().setFromEuler(e),rest:0.3,snd:'wood'});});
    endMember(fences,i);});
  [cars,grills,sheds,hoops,fences,playsets,kiddie,gardens].forEach(o=>{o.cur=o.g;finalize(o);});MKEY='misc';
  bush.forEach(([x,y,z,r])=>STATIC.push({kind:'leaf',c:new V(x,y,z),r:r+0.1,snd:'leaf',obj:null,br:r+0.1}));
  fences.members=[];} // fences aren't a target
function houseName(i:number){const street=i<14?'Morning Wind':i<20?'Mirror Light':i<29?'Gray Owl':i<39?'Crystal Spring':i<49?'Thunder Hill':i<56?'Sea Wind':'the south path';return`${WALLN[i%WALLN.length]} house on ${street}`;}
function buildWorld(){
  addPad(START.x,START.z,2.5);let o:WorldObject;

  // ---- houses (one grouped target) ----
  o=makeObj('houses','Any House','🏘️',0,0,0,[{label:'Hit any house',type:'contact'},{label:'Break any window',type:'brk',part:'glass'}],null);const houseMembers:TargetMember[]=[];o.members=houseMembers;
  HOUSES.forEach((_,i)=>{MKEY='h'+i;const x=HL[i].x,z=HL[i].z,y=addPad(x,z,12),hg=new THREE.Group();hg.position.set(x,y,z);hg.rotation.y=HL[i].a;o.g.add(hg);o.cur=hg;
    const wc=WALLC[i%WALLC.length],rc=ROOFC[(i*3)%ROOFC.length];
    bx(o,11,3.2,8,wc,0,1.6,0,{merge:1});
    bx(o,11.8,0.22,4.7,rc,0,4.05,2.1,{rx:0.397,merge:1});bx(o,11.8,0.22,4.7,rc,0,4.05,-2.1,{rx:-0.397,merge:1});
    bx(o,1.1,2.1,0.1,0x5b3d2e,0,1.05,4.04,{nocol:true,t:0,merge:1});
    [-3.2,3.2].forEach(wx=>{glassPane(o,wx,1.9,4.04,1.5,1.1);glassPane(o,wx,1.9,-4.04,1.5,1.1,Math.PI);});
    glassPane(o,0,1.9,-4.04,1.2,1.1,Math.PI);
    o.cols.forEach(c=>{if(c.sub==null){c.sub=i;c.fk='h'+i;}});HOUSEPOS[i]={x,y,z,a:HL[i].a,g:hg};
    const street=i<14?'Morning Wind':i<20?'Mirror Light':i<29?'Gray Owl':i<39?'Crystal Spring':i<49?'Thunder Hill':i<56?'Sea Wind':'the south path';
    houseMembers.push({c:new V(x,y+2,z),top:y+5.3,r:6.5,name:`${WALLN[i%WALLN.length]} house on ${street}`});});
  o.subRules=m=>[{label:'Hit this house',type:'contact'},{label:'Break a window on this house',type:'brk',part:'glass'}];
  o.cur=o.g;MKEY='misc';finalize(o);

  // ---- backyard pools (grouped) ----
  o=makeObj('pools','Any Backyard Pool','🏊',0,0,0,[],null);const poolMembers:TargetMember[]=[];o.members=poolMembers;const pz:string[]=[];
  POOLS.forEach(([px,py,rd],i)=>{let [x,z]=clearHouse(WX(px),WZ(py),4.5);{const rn=roadNearest(x,z);if(rn.d<5){const dx=x-rn.x,dz=z-rn.z,l=Math.hypot(dx,dz)||1,want=l+5-rn.d;x=rn.x+dx/l*want;z=rn.z+dz/l*want;}}const y=addPad(x,z,5),pg=new THREE.Group();pg.position.set(x,y,z);pg.rotation.y=rd*DEG;o.g.add(pg);o.cur=pg;
    bx(o,4,0.06,7,0x52c3ef,0,0.02,0,{nocol:true,t:0});
    [[4.6,0.3,0,3.65],[4.6,0.3,0,-3.65],[0.3,7.6,2.15,0],[0.3,7.6,-2.15,0]].forEach(([w,d,cx,cz])=>bx(o,w,0.08,d,0xf2efe6,cx,0.04,cz,{nocol:true,t:0.02}));
    zone(o,'p'+i,{w:4,h:1.2,d:7,y:0.45},14);pz.push('p'+i);poolMembers.push({c:new V(x,y,z),top:y+0.2,r:4,zone:'p'+i,name:`Pool #${i+1}`});});
  o.subRules=m=>[{label:'Splash it in this pool',type:'through',zones:m.zone?[m.zone]:[]}];
  o.rules=[{label:'Splash it in any pool',type:'through',zones:pz}];o.cur=o.g;finalize(o);

  // ---- tennis court ----
  MKEY='court';o=makeObj('court','Tennis Court','🎾',WX(1072),WZ(748),-0.05,[{label:'Get it inside the court',type:'through',zones:['court']},{label:'Hit the net',type:'contact',part:'net'},{label:'Hit the fence',type:'contact',part:'fence'}],18);
  bx(o,17,0.06,30,0x3f8f6a,0,0.03,0,{nocol:true,t:0,merge:1});bx(o,11,0.07,24,0x3a6fa0,0,0.035,0,{nocol:true,t:0,merge:1});
  [[0.08,24,5.5,0],[0.08,24,-5.5,0],[0.08,24,4.1,0],[0.08,24,-4.1,0],[11,0.08,0,12],[11,0.08,0,-12],[8.2,0.08,0,6.4],[8.2,0.08,0,-6.4],[0.08,12.8,0,0]].forEach(([w,d,x,z])=>bx(o,w,0.075,d,0xffffff,x,0.04,z,{nocol:true,t:0,merge:1}));
  [-6,6].forEach(x=>cy(o,0.05,1.07,0x333333,x,0.53,0,{part:'net',t:0.015}));
  {const n=new THREE.Mesh(new THREE.BoxGeometry(12,0.9,0.03),new THREE.MeshBasicMaterial({color:0x1d1a16,transparent:true,opacity:0.55}));n.position.set(0,0.5,0);o.g.add(n);
   bx(o,12,0.08,0.05,0xffffff,0,0.96,0,{nocol:true,t:0});o.cols.push({kind:'obb',node:o.g,lc:new V(0,0.5,0),h:new V(6,0.47,0.04),lq:new Q(),part:'net',rest:0.05,snd:'soft'});}
  {const fm=new THREE.MeshBasicMaterial({color:0x2a2f33,transparent:true,opacity:0.3,side:THREE.DoubleSide,depthWrite:false});
   [[17,0,15],[17,0,-15],[0,30,-8.5],[0,13.5,8.5,-8.25],[0,13.5,8.5,8.25]].forEach(([w,d,x,zc])=>{const len=w||d,cx=w?0:x,cz=w?x:(zc||0);
     const m=new THREE.Mesh(new THREE.PlaneGeometry(len,3),fm);m.position.set(cx,1.5,cz);if(!w)m.rotation.y=Math.PI/2;o.g.add(m);
     o.cols.push({kind:'obb',node:o.g,lc:new V(cx,1.5,cz),h:w?new V(len/2,1.5,0.05):new V(0.05,1.5,len/2),lq:new Q(),part:'fence',rest:0.15,snd:'metal',thru:true});
     for(let t=-len/2;t<=len/2+0.01;t+=3)cy(o,0.04,3.05,0x555a5e,w?t:cx,1.52,w?cz:cz+t,{nocol:true,t:0.01,merge:1,seg:5});});}
  zone(o,'court',{w:16.8,h:1.4,d:29.8,y:0.7});
  finalize(o);MKEY='misc';

  // ---- bench by the court ----
  o=makeObj('bench','Park Bench','🪑',WX(1128),WZ(840),faceAt(WX(1128),WZ(840),WX(1150),WZ(800)),[{label:'Hit the bench',type:'contact'},{label:'Hit the top of the seat',type:'top',part:'seat'}]);
  bx(o,1.8,0.08,0.45,0x9a6a3c,0,0.45,0,{part:'seat'});bx(o,1.8,0.4,0.06,0x9a6a3c,0,0.8,-0.22);[-0.8,0.8].forEach(x=>bx(o,0.08,0.45,0.45,0x333333,x,0.22,0));
  finalize(o);

  // ---- trash cans ----
  const trash=(id:string,name:string,px:number,py:number)=>{const o=makeObj(id,name,'🗑️',WX(px),WZ(py),0,[{label:'Hit the trash can',type:'contact'},{label:'Hit the lid',type:'top',part:'lid'}]);
    cy(o,0.42,1.0,0x3f6b4a,0,0.5,0,{rt:0.48,seg:12});cy(o,0.53,0.08,0x2f5238,0,1.04,0,{seg:12,part:'lid'});finalize(o);};
  trash('trash1','Trash Can by the Court',1152,795);trash('trash2','Trash Can by the School',875,1350);

  // ---- park sign (thread the posts) ----
  {const x=WX(1112),z=WZ(612);o=makeObj('psign','Park Sign','🪧',x,z,faceAt(x,z,WX(1060),WZ(530))+Math.PI/2,[{label:'Thread between the posts',type:'through',zones:['gate']},{label:'Hit the sign',type:'contact'}]);
   cy(o,0.07,2.2,0x5b3d2e,-1.0,1.1,0,{part:'post'});cy(o,0.07,2.2,0x5b3d2e,1.0,1.1,0,{part:'post'});
   bx(o,2.5,0.8,0.08,0x2f5a3a,0,1.95,0.08,{part:'board'});decal(o,textTex(['CRYSTAL SPRING','PARK'],'#f3eed8',null,256,128,30),2.3,0.72,0,1.95,0.13);
   decal(o,textTex(['CRYSTAL SPRING','PARK'],'#f3eed8',null,256,128,30),2.3,0.72,0,1.95,0.03,Math.PI);
   zone(o,'gate',{w:1.85,h:1.5,d:0.5,y:0.75});finalize(o);}

  // ---- the lone oak in the field ----
  o=makeObj('oak','Lone Oak','🌳',WX(1020),WZ(995),0,[{label:'Hit the trunk',type:'contact',part:'trunk'},{label:'Hit the tree, leaves count',type:'contact'}],3);
  cy(o,0.55,4.4,0x7a4f2a,0,2.2,0,{rt:0.42,part:'trunk'});
  sp(o,2.8,0x3f8f2f,0,6.0,0,{part:'leaves',leaf:true});sp(o,2.0,0x4aa336,2.0,5.2,0.6,{part:'leaves',leaf:true});sp(o,1.9,0x3a852b,-1.8,5.3,-0.7,{part:'leaves',leaf:true});
  finalize(o);

  // ---- picnic table ----
  o=makeObj('picnic','Picnic Table','🧺',WX(955),WZ(960),0.5,[{label:'Hit the tabletop',type:'top',part:'tabletop'},{label:'Roll under the table',type:'through',zones:['under']},{label:'Hit the picnic table',type:'contact'}],2.5);
  bx(o,2.4,0.1,1.0,0xa86b3c,0,0.8,0,{part:'tabletop'});[-0.78,0.78].forEach(z=>bx(o,2.4,0.08,0.32,0x9a5f33,0,0.45,z));
  [-1.0,1.0].forEach(x=>{[-0.3,0.3].forEach(z=>bx(o,0.1,0.75,0.1,0x7d4c28,x,0.38,z));[-0.78,0.78].forEach(z=>bx(o,0.1,0.42,0.1,0x7d4c28,x,0.21,z));});
  zone(o,'under',{w:1.8,h:0.7,d:0.9,y:0.35});finalize(o);

  // ---- soccer goal at the south end of the field ----
  {const x=WX(1000),z=WZ(1335);o=makeObj('goal','Soccer Goal','⚽',x,z,faceAt(x,z,x,z-10),[{label:'Score a goal',type:'through',zones:['mouth']},{label:'Ding the post or crossbar',type:'contact',part:'post'}],3.5);
   [-3.6,3.6].forEach(x=>{cy(o,0.06,2.2,0xffffff,x,1.1,0,{part:'post'});});bx(o,7.32,0.12,0.12,0xffffff,0,2.2,0,{part:'post'});
   const netM=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.3,side:THREE.DoubleSide,depthWrite:false});
   [[7.2,2.2,0,1.1,-1.5,0],[1.5,2.2,-3.6,1.1,-0.75,Math.PI/2],[1.5,2.2,3.6,1.1,-0.75,Math.PI/2]].forEach(([w,h,x,y,z,ry])=>{
     const n=new THREE.Mesh(new THREE.PlaneGeometry(w,h),netM);n.position.set(x,y,z);n.rotation.y=ry;o.g.add(n);
     o.cols.push({kind:'obb',node:o.g,lc:new V(x,y,z),h:new V(w/2,h/2,0.04),lq:new Q().setFromEuler(new THREE.Euler(0,ry,0)),rest:0.08});});
   zone(o,'mouth',{w:7.1,h:2.1,d:0.35,y:1.05,z:-0.1});finalize(o);}

  // ---- school (east face windows look over the playground) ----
  {MKEY='school';const cx=-160,cz=75,sh=rawH(cx,cz);padRect(cx+2,cz-17,68,53,sh);padRect(cx-6,cz+27,54,46,sh);padRect(cx+46,cz-16,22,24,sh);o=makeObj('school','Haverhill Elementary','🏫',cx,cz,0,[{label:'Hit the school',type:'contact'},{label:'Break a school window',type:'brk',part:'glass'}],null,0);o.g.position.y=sh;
   bx(o,62,10,47,0xb9a58f,2,2,-17,{merge:1});bx(o,63,0.5,48,0x6d6a66,2,7.2,-17,{nocol:true,merge:1});
   bx(o,48,9,40,0xb3a08b,-6,1.5,27,{merge:1});bx(o,49,0.5,41,0x6d6a66,-6,6.2,27,{nocol:true,merge:1});
   bx(o,16,11,18,0xa8927a,46,2.5,-16,{merge:1});bx(o,16.5,0.5,18.5,0x7a7470,46,8.2,-16,{nocol:true,merge:1});
   for(let z=-36;z<=2;z+=4.2){glassPane(o,33.06,2.2,z,2.4,1.5,Math.PI/2);glassPane(o,33.06,5.1,z,2.4,1.5,Math.PI/2);}
   for(let z=-23;z<=-9;z+=4.5)glassPane(o,54.06,4,z,2.4,1.8,Math.PI/2);
   for(let x=-26;x<=16;x+=4.2)glassPane(o,x,2.2,47.06,2.4,1.5);
   finalize(o);MKEY='misc';}

  // ---- playground (sand, slide, swings, dome) ----
  addPad(WX(775),WZ(1225),24);
  o=makeObj('sand','Playground Sand','🏖️',WX(775),WZ(1225),0,[{label:'Get it on the playground sand',type:'through',zones:['in']}],0);
  zone(o,'in',{w:40,h:1.6,d:40,y:0.6});finalize(o);
  {const x=WX(690),z=WZ(1270);o=makeObj('slide','Playground Slide','🛝',x,z,0.6,[{label:'Hit the slide',type:'contact'},{label:'Roll under the platform',type:'through',zones:['under']},{label:'Hit the top of the platform',type:'top',part:'platform'}],0);
   [-0.5,0.5].forEach(x=>{cy(o,0.06,2.4,0x2e7bd6,x,1.2,-0.7,{part:'ladder'});cy(o,0.06,2.2,0x2e7bd6,x,1.1,0.55);});
   [0.45,0.95,1.45,1.95].forEach(y=>bx(o,1.0,0.06,0.06,0x2e7bd6,0,y,-0.7,{part:'ladder'}));
   bx(o,1.2,0.12,1.35,0x2e7bd6,0,2.25,-0.07,{part:'platform'});bx(o,0.9,0.1,3.94,0xffc93c,0,1.2,2.3,{rx:0.532});
   [-0.47,0.47].forEach(x=>bx(o,0.07,0.28,3.94,0xf2a900,x,1.33,2.3,{rx:0.532}));
   zone(o,'under',{w:0.9,h:1.9,d:1.1,y:0.95,z:-0.07});finalize(o);}
  {const x=WX(760),z=WZ(1170);o=makeObj('swings','Swing Set','🎠',x,z,0.1,[{label:'Go through the swing set',type:'through',zones:['thru']},{label:'Hit a swing seat',type:'contact',part:'seat'}],0);
   [-2.6,2.6].forEach(x=>{bx(o,0.12,3.2,0.12,0xd94141,x,1.5,0.5,{rx:-0.33});bx(o,0.12,3.2,0.12,0xd94141,x,1.5,-0.5,{rx:0.33});});
   bx(o,5.4,0.14,0.14,0xd94141,0,3.0,0);
   [-1.1,1.1].forEach(x=>{bx(o,0.03,2.3,0.03,0x888888,x-0.35,1.85,0,{nocol:true,t:0.015});bx(o,0.03,2.3,0.03,0x888888,x+0.35,1.85,0,{nocol:true,t:0.015});bx(o,0.8,0.08,0.3,0x333333,x,0.65,0,{part:'seat'});});
   zone(o,'thru',{w:5.0,h:2.8,d:0.9,y:1.45});finalize(o);}
  {const x=WX(700),z=WZ(1175);o=makeObj('dome','Climbing Dome','⛺',x,z,0,[{label:'Hit the dome bars',type:'contact'},{label:'Hit the top of the dome',type:'top'},{label:'Thread through the dome',type:'through',zones:['inside']}],0);
   const ring=(n:number,r:number,y:number,offset=0)=>Array.from({length:n},(_,i)=>new V(Math.cos(i*2*Math.PI/n+offset)*r,y,Math.sin(i*2*Math.PI/n+offset)*r));
   const base=ring(10,2.2,0.15),middle=ring(10,1.75,1.15,Math.PI/10),upper=ring(5,0.85,1.95);
   const bar=(a:THREE.Vector3,b:THREE.Vector3,col:number)=>{const d=b.clone().sub(a),q=new Q().setFromUnitVectors(new V(0,1,0),d.clone().normalize()),center=a.clone().add(b).multiplyScalar(0.5),r=0.055;
     mergeVis(new THREE.CylinderGeometry(r,r,d.length(),6),col,o.g,center.x,center.y,center.z,new THREE.Euler().setFromQuaternion(q),0.012);
     o.cols.push({kind:'obb',node:o.g,lc:center,h:new V(r,d.length()/2,r),lq:q,part:'bar',rest:0.3,snd:'metal'});};
   const loop=(pts:THREE.Vector3[],col:number)=>pts.forEach((p,i)=>bar(p,pts[(i+1)%pts.length],col));
   loop(base,0xd94141);loop(middle,0xf2c94c);loop(upper,0x2f80ed);
   base.forEach((p,i)=>{bar(p,middle[i],0xd94141);bar(p,middle[(i+9)%10],0xd94141);});
   middle.forEach((p,i)=>bar(p,upper[Math.floor(i/2)],0x2f80ed));
   upper.forEach(p=>bar(p,new V(0,2.3,0),0xf2c94c));
   zone(o,'inside',{r:1.1,h:1.3,y:0.8});finalize(o);}
  {const x=WX(825),z=WZ(1230);o=makeObj('seesaw','Playground Seesaw','⚖️',x,z,0.25,[{label:'Hit the seesaw',type:'contact'},{label:'Hit a seesaw seat',type:'contact',part:'seat'}],0);
   bx(o,0.45,0.85,0.7,0xf2c94c,0,0.42,0);
   bx(o,4.6,0.16,0.4,0x2f80ed,0,0.91,0,{rz:0.14,part:'board'});
   [-2.05,2.05].forEach(s=>{bx(o,0.6,0.1,0.48,0xd94141,s,0.91+s*0.14,0,{part:'seat'});bx(o,0.07,0.45,0.45,0xf2c94c,s*0.7,1.12+s*0.1,0,{part:'handle'});});
   finalize(o);}
  {const x=WX(785),z=WZ(1300);o=makeObj('monkey','Monkey Bars','🐒',x,z,0.2,[{label:'Hit the monkey bars',type:'contact',part:'bar'},{label:'Go under the monkey bars',type:'through',zones:['under']}],0);
   [-2.1,2.1].forEach(x=>[-0.85,0.85].forEach(z=>cy(o,0.065,2.4,0x47b34a,x,1.2,z,{part:'post'})));
   [-0.85,0.85].forEach(z=>bx(o,4.4,0.12,0.12,0x2f80ed,0,2.45,z,{part:'bar'}));
   for(let x=-1.7;x<=1.8;x+=0.85)bx(o,0.09,0.09,1.82,0xf2c94c,x,2.45,0,{part:'bar'});
   zone(o,'under',{w:3.7,h:1.7,d:1.45,y:0.9});finalize(o);}
  [[790,1235],[775,1250],[805,1255]].forEach(([px,py])=>addTree(WX(px),WZ(py),1.6,1.2));

  {MKEY='cwall';const x=WX(835),z=WZ(1300);o=makeObj('cwall','Climbing Wall','🧗',x,z,faceAt(x,z,WX(1000),WZ(1250)),[],2.5);const zs:string[]=[];
   const HOLES=new Set(['1,1','4,1','6,2','2,3','5,3','3,0']);
   for(let c=0;c<8;c++)for(let r=0;r<5;r++){const cx=-1.75+c*0.5,cy0=0.34+r*0.48;
     if(HOLES.has(c+','+r)){const n='h'+zs.length;zone(o,n,{w:0.44,h:0.42,d:0.5,x:cx,y:cy0});zs.push(n);}
     else bx(o,0.5,0.48,0.2,(c+r)%2?0xe8d9b0:0xdccb9c,cx,cy0,0,{merge:1,t:0});}
   [[-2.08],[2.08]].forEach(([px])=>bx(o,0.16,2.9,0.28,0x8a5a34,px,1.45,0,{merge:1}));bx(o,4.3,0.16,0.3,0x8a5a34,0,2.62,0,{merge:1});
   const HC=[0xd94141,0x2f80ed,0xf2c94c,0x47b34a,0x9b51e0];for(let i=0;i<22;i++){const hx=-1.8+rnd()*3.6,hy=0.3+rnd()*2.1;if([...HOLES].some(k=>{const[c,r]=k.split(',').map(Number);return Math.abs(hx-(-1.75+c*0.5))<0.35&&Math.abs(hy-(0.34+r*0.48))<0.33;}))continue;
     mergeVis(new THREE.IcosahedronGeometry(0.06,0),HC[i%5],o.g,hx,hy,0.12,new THREE.Euler(),0.015);}
   o.rules=[{label:'Through any hole in the wall',type:'through',zones:zs},{label:'Hit the climbing wall',type:'contact'}];finalize(o);MKEY='misc';}
  {const x=WX(935),z=WZ(1030);o=makeObj('cornhole','Giant Cornhole','🎯',x,z,0.3,[],6);const zs:string[]=[];
   [-4.5,4.5].forEach((bz,bi)=>{const bg=new THREE.Group();bg.position.set(0,0.36,bz);bg.rotation.y=bz<0?0:Math.PI;o.g.add(bg);
     const tg=new THREE.Group();tg.rotation.x=0.25;bg.add(tg);o.cur=tg;
     bx(o,1.2,0.06,1.75,0xf2e6c9,0,0,0.325,{part:'board'});bx(o,1.2,0.06,0.15,0xf2e6c9,0,0,-1.125,{part:'board'});
     [-0.425,0.425].forEach(sx=>bx(o,0.35,0.06,0.5,0xf2e6c9,sx,0,-0.8,{part:'board'}));
     bx(o,0.5,0.02,0.5,0x1d1a16,0,-0.3,-0.8,{nocol:true,t:0});bx(o,1.22,0.02,0.2,bi?0x2f80ed:0xd94141,0,0.035,0.6,{nocol:true,t:0});
     [[-0.55,-1.1],[0.55,-1.1]].forEach(([lx,lz])=>bx(o,0.06,0.6,0.06,0x8a5a34,lx,-0.3,lz,{nocol:true,t:0.015}));
     zone(o,'c'+bi,{w:0.48,h:0.5,d:0.48,x:0,y:-0.22,z:-0.8}).sinkY=0.22;zs.push('c'+bi);});
   o.cur=o.g;o.rules=[{label:'Sink it in a cornhole',type:'through',zones:zs},{label:'Hit the top of a board',type:'top',part:'board'}];finalize(o);}
  {const x=WX(612),z=WZ(1305);o=makeObj('tire','Tire Swing','🛞',x,z,0.4,[{label:'Drop it through the tire',type:'through',zones:['hole']},{label:'Hit the tire',type:'contact'}],0);
   [-1.3,1.3].forEach(px=>{bx(o,0.12,2.9,0.12,0x2f80ed,px,1.35,0.45,{rx:-0.33});bx(o,0.12,2.9,0.12,0x2f80ed,px,1.35,-0.45,{rx:0.33});});bx(o,2.8,0.14,0.14,0x2f80ed,0,2.72,0);
   {const t=part(new THREE.TorusGeometry(0.42,0.14,8,20),0x222222,o.g,0,0.9,0,0.03);t.rotation.x=Math.PI/2;}
   [0,2.1,4.2].forEach(a=>bx(o,0.03,1.8,0.03,0x888888,Math.cos(a)*0.3,1.82,Math.sin(a)*0.3,{nocol:true,t:0.01}));
   o.cols.push({kind:'ring',node:o.g,lc:new V(0,0.9,0),ri:0.28,ro:0.56,hh:0.14,rest:0.35,snd:'soft'});zone(o,'hole',{r:0.27,h:0.3,y:0.9});finalize(o);}
  // ---- odds and ends around the neighborhood ----
  {const x=WX(1500),z=WZ(760);o=makeObj('tramp','Backyard Trampoline','🤸',x,z,0,[{label:'Bounce it off the mat',type:'top'},{label:'Hit the trampoline',type:'contact'}],3,3.5);
   [[1.5,1.5],[-1.5,1.5],[1.5,-1.5],[-1.5,-1.5]].forEach(([x,z])=>cy(o,0.05,0.9,0x555555,x,0.45,z,{nocol:true,t:0.02}));
   cy(o,2.1,0.06,0x222222,0,0.9,0,{seg:20,rest:0.78,bouncy:true,t:0});
   {const tor=part(new THREE.TorusGeometry(2.2,0.12,6,24),0x2f80ed,o.g,0,0.92,0);tor.rotation.x=Math.PI/2;}finalize(o);}
  {const x=WX(1710),z=WZ(705);o=makeObj('flamingo','Lawn Flamingo','🦩',x,z,faceAt(x,z,START.x,START.z),[{label:'Hit the flamingo',type:'contact'}]);
   cy(o,0.025,0.8,0xff7eb6,0,0.4,0,{t:0.015});sp(o,0.3,0xff7eb6,0,0.95,0,{sc:[0.8,0.7,1.2]});cy(o,0.04,0.55,0xff7eb6,0,1.35,0.25,{t:0.015});sp(o,0.11,0xff7eb6,0,1.65,0.3,{nocol:true});finalize(o);}
  {const x=WX(945),z=WZ(862);o=makeObj('gnome','Garden Gnome','🧙',x,z,faceAt(x,z,WX(1060),WZ(915)),[{label:'Bonk the gnome',type:'contact'}]);
   cone(o,0.28,0.55,0x2f80ed,0,0.28,0);sp(o,0.17,0xffd9b3,0,0.66,0,{nocol:true});cone(o,0.16,0.18,0xffffff,0,0.56,0.1,{nocol:true,t:0.02});cone(o,0.19,0.42,0xd62828,0,0.95,0,{nocol:true});
   o.cols.push({kind:'sph',node:o.g,lc:new V(0,0.72,0),r:0.22,rest:0.4});finalize(o);}
  {const x=WX(785),z=WZ(835);o=makeObj('mail','Mailbox on Morning Wind','📫',x,z,0,[{label:'Hit the mailbox',type:'contact'}]);
   bx(o,0.1,1.1,0.1,0x5b3d2e,0,0.55,0,{part:'post'});bx(o,0.42,0.36,0.62,0x2b2b2b,0,1.25,0,{part:'box'});bx(o,0.04,0.3,0.06,0xd62828,0.23,1.4,-0.1,{nocol:true,t:0.015});finalize(o);}
  {const x=WX(1515),z=WZ(915);o=makeObj('stop','Stop Sign on Thunder Hill','🛑',x,z,faceAt(x,z,WX(1455),WZ(790)),[{label:'Hit the post',type:'contact',part:'post'},{label:'Ring the sign',type:'contact',part:'sign'}]);
   cy(o,0.05,2.5,0x9aa3a8,0,1.25,0,{part:'post'});
   {const m=part(new THREE.CylinderGeometry(0.5,0.5,0.05,8),0xd62828,o.g,0,2.45,0.06);m.rotation.set(Math.PI/2,Math.PI/8,0);
    o.cols.push({kind:'obb',node:o.g,lc:new V(0,2.45,0.06),h:new V(0.48,0.48,0.05),lq:new Q(),part:'sign',rest:0.5,snd:'metal'});
    decal(o,textTex(['STOP'],'#fff',null,256,128,70),0.8,0.4,0,2.45,0.1);}finalize(o);}
  o=makeObj('soda','Soda Can on the Path','🥤',WX(1402),WZ(1449),0,[{label:'Hit the soda can',type:'contact'}],0.8);cy(o,0.07,0.2,0xd62828,0,0.1,0,{seg:10,t:0.015});finalize(o);
  o=makeObj('pizza','Pizza Box in the Woods','🍕',WX(1180),WZ(1150),0.4,[{label:'Hit the pizza box',type:'contact'}],0.8);bx(o,0.6,0.07,0.6,0xe9d4a7,0,0.035,0);finalize(o);

  // ---- small stuff scattered along the paths ----
  yards();
  pathJunk();
  // ---- trees ----
  const pathClear=(x:number,z:number,m:number)=>pathDist(x,z)>m;
  const padClear=(x:number,z:number,m:number)=>!PADS.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+m);
  const okTree=(x:number,z:number,m=1.5)=>roadSurf(x,z)>1.5&&x>XMIN+3&&x<XMAX-3&&z>ZMIN+3&&z<ZMAX-3&&pathClear(x,z,2.6)&&padClear(x,z,m)&&!inPoly(FIELD,x,z)&&!inPoly(SANDP,x,z);
  const fillPoly=(pl:import('./map.ts').Point[],step:number,prob:number,rMin:number,rMax:number)=>{const xs=pl.map(p=>p[0]),zs=pl.map(p=>p[1]);
    for(let x=Math.min(...xs);x<Math.max(...xs);x+=step)for(let z=Math.min(...zs);z<Math.max(...zs);z+=step){
      const tx=x+(rnd()-0.5)*step*0.8,tz=z+(rnd()-0.5)*step*0.8;if(rnd()<prob&&inPoly(pl,tx,tz)&&okTree(tx,tz)){const r=rMin+rnd()*(rMax-rMin);addTree(tx,tz,r,2.6+rnd()*2.8);}}};
  WOODS.forEach(pl=>fillPoly(pl,4.6,0.85,2.2,3.6));
  fillPoly(PARKTREES,7,0.55,2.4,3.8);
  HOUSES.forEach(([px,py])=>{for(let k=0;k<2;k++){const a=rnd()*6.28,d=10+rnd()*5,x=WX(px)+Math.cos(a)*d,z=WZ(py)+Math.sin(a)*d;if(rnd()<0.65&&okTree(x,z))addTree(x,z,2+rnd()*1.6,2.4+rnd()*2);}});
  for(let x=XMIN+6;x<XMAX-6;x+=15)for(let z=ZMIN+6;z<ZMAX-6;z+=15){const tx=x+(rnd()-0.5)*10,tz=z+(rnd()-0.5)*10;if(rnd()<0.22&&!inWoods(tx,tz)&&okTree(tx,tz,2.5))addTree(tx,tz,2+rnd()*1.5,2.5+rnd()*2);}
  {const n=TREES.length,cg=new THREE.IcosahedronGeometry(1,1),tg=new THREE.CylinderGeometry(0.75,1,1,6);
   const can=new THREE.InstancedMesh(cg,toon({color:0xffffff}),n*2),out=new THREE.InstancedMesh(cg,OUT,n*2),trk=new THREE.InstancedMesh(tg,mat(0x6b4423),n);
   const dm=new THREE.Object3D(),col=new THREE.Color(),GREENS=[0x3f8f2f,0x4aa336,0x2d7a3e,0x3a852b,0x55a83a];
   TM.can=can;TM.out=out;TM.trk=trk;
   TREES.forEach((t,i)=>{const cy0=t.y+t.th+t.r*0.55,tr=0.18+t.r*0.06;
     dm.position.set(t.x,t.y+t.th/2+0.3,t.z);dm.scale.set(tr,t.th+0.6,tr);dm.rotation.set(0,0,0);dm.updateMatrix();trk.setMatrixAt(i,dm.matrix);
     const blobs=[[0,0,0,t.r],[t.r*0.45,-t.r*0.25,t.r*0.3,t.r*0.7]];
     blobs.forEach(([ox,oy,oz,rr],k)=>{dm.position.set(t.x+ox,cy0+oy,t.z+oz);dm.rotation.set(rnd(),rnd(),rnd());dm.scale.setScalar(rr);dm.updateMatrix();can.setMatrixAt(i*2+k,dm.matrix);
       dm.scale.setScalar(rr+0.1);dm.updateMatrix();out.setMatrixAt(i*2+k,dm.matrix);col.setHex(GREENS[(i+k)%5]);can.setColorAt(i*2+k,col);});});
   TREES.forEach((t,i)=>{t.mt=new THREE.Matrix4();trk.getMatrixAt(i,t.mt);t.mc=[0,1].map(k=>{const a=new THREE.Matrix4(),b=new THREE.Matrix4();can.getMatrixAt(i*2+k,a);out.getMatrixAt(i*2+k,b);return[a,b];});});
   [can,out,trk].forEach(m=>{m.instanceMatrix.needsUpdate=true;scene.add(m);});if(can.instanceColor)can.instanceColor.needsUpdate=true;}

  {const to=makeObj('trees','Any Tree','🌲',0,0,0,[{label:'Hit any tree trunk',type:'contact',part:'trunk'},{label:'Hit any tree\'s branches',type:'contact',part:'leaves'}],null);
   to.members=TREES.map((t,i)=>({c:new V(t.x,t.y+t.th*0.6,t.z),top:t.y+t.th+t.r*1.5,r:t.r,name:`Tree ${where(t.x,t.z)}`}));
   to.subRules=m=>[{label:'Hit this tree\'s trunk',type:'contact',part:'trunk'},{label:'Hit this tree\'s branches',type:'contact',part:'leaves'},{label:'Hit this tree anywhere',type:'contact'}];
   STATIC.forEach(c=>{if(c.ti!=null){c.obj=to;c.sub=c.ti;c.part=c.kind==='leaf'?'leaves':'trunk';}});to.center=new V();to.size=new V(1,1,1);}
  // ---- terrain mesh with painted zones: paths get their own ribbon, woods floor darker, mowed field stripes, sand ----
  {const w=XMAX-XMIN+20,d=ZMAX-ZMIN+20,NX=150,NZ=134,geo=new THREE.PlaneGeometry(w,d,NX,NZ);geo.rotateX(-Math.PI/2);geo.translate((XMAX+XMIN)/2,0,(ZMAX+ZMIN)/2);
   const pos=geo.attributes.position,cols=new Float32Array(pos.count*3),c=new THREE.Color();
   const G1=new THREE.Color(0x86c857),G2=new THREE.Color(0x76bb4a),WD=new THREE.Color(0x5f7535),SD=new THREE.Color(0xe9ca8f),YD=new THREE.Color(0x8ccb5c);
   TG.x0=XMIN-10;TG.z0=ZMIN-10;TG.dx=w/NX;TG.dz=d/NZ;TG.nx=NX;TG.nz=NZ;TG.h=new Float32Array(pos.count);
   for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=H(x,z);pos.setY(i,h);TG.h[i]=h;
     if(inPoly(SANDP,x,z))c.copy(SD);else if(inWoods(x,z))c.copy(WD);else if(inPoly(FIELD,x,z))c.copy(Math.floor(z/6)%2?G1:G2);else c.copy(YD).lerp(G2,0.35+0.3*Math.sin(x*0.07)*Math.cos(z*0.06));
     c.multiplyScalar(0.94+h*0.04);cols.set([c.r,c.g,c.b],i*3);}
   geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
   {const tm=new THREE.Mesh(geo,toon({vertexColors:true}));tm.receiveShadow=true;tm.userData.ground=true;scene.add(tm);}
   const ow=600;[[ow,ow/2,0,ZMIN-10-ow/4],[ow,ow/2,0,ZMAX+10+ow/4],[ow/2,d,XMAX+10+ow/4,(ZMAX+ZMIN)/2],[ow/2,d,XMIN-10-ow/4,(ZMAX+ZMIN)/2]].forEach(([a,b,x,z])=>{const g=new THREE.Mesh(new THREE.PlaneGeometry(a,b),mat(0x7cbf55));g.rotation.x=-Math.PI/2;g.position.set(x,0,z);scene.add(g);});}
  // pavement: roads, cul-de-sacs, driveways and park paths. Each strip is subdivided across its width so it follows the
  // ground's curve instead of cutting a straight chord under the bumps, and it's drawn with a depth offset so grass can't win.
  {const pave=(c:number)=>toon({color:c,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
   const addMesh=(vs:number[],idx:number[],m:THREE.Material)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));g.setIndex(idx);g.computeVertexNormals();
     const me=new THREE.Mesh(g,m);me.receiveShadow=true;me.userData.ground=true;scene.add(me);};
   const ribbon=(vs:number[],idx:number[],pts:THREE.Vector3[],hw:number,y0:number,K:number)=>{const b=vs.length/3;pts.forEach((p,i)=>{const a=pts[Math.max(0,i-1)],c=pts[Math.min(pts.length-1,i+1)],tx=c.x-a.x,tz=c.z-a.z,l=Math.hypot(tx,tz)||1,nx=-tz/l,nz=tx/l;
       for(let k=0;k<=K;k++){const o=hw*(2*k/K-1),x=p.x+nx*o,z=p.z+nz*o;vs.push(x,Math.max(H(x,z),meshH(x,z))+y0,z);}
       if(i)for(let k=0;k<K;k++){const r0=b+(i-1)*(K+1)+k,r1=b+i*(K+1)+k;idx.push(r0,r0+1,r1,r0+1,r1+1,r1);}});};
   const dense=(pts:THREE.Vector3[])=>{const out:THREE.Vector3[]=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],c=pts[i+1],n=Math.max(1,Math.ceil(a.distanceTo(c)/1.2));for(let k=0;k<n;k++)out.push(a.clone().lerp(c,k/n));}out.push(pts[pts.length-1]);return out;};
   {const vs:number[]=[],idx:number[]=[];ROADCURVES.forEach(pts=>ribbon(vs,idx,dense(pts),RHALF,0.12,6));
    CULS.forEach(([cx,cz])=>{const b=vs.length/3,N=40,RINGS=6;vs.push(cx,Math.max(H(cx,cz),meshH(cx,cz))+0.12,cz);
      for(let r=1;r<=RINGS;r++)for(let k=0;k<N;k++){const a=k/N*Math.PI*2,rr=CULR*r/RINGS,x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr;vs.push(x,Math.max(H(x,z),meshH(x,z))+0.12,z);}
      for(let k=0;k<N;k++){const k2=(k+1)%N;idx.push(b,b+1+k2,b+1+k);for(let r=1;r<RINGS;r++){const o=b+1+(r-1)*N,o2=o+N;idx.push(o+k,o+k2,o2+k,o+k2,o2+k2,o2+k);}}});
    addMesh(vs,idx,pave(0x5d6064));}
   {const vs:number[]=[],idx:number[]=[];DRIVES.forEach(([[x0,z0],[x1,z1]])=>{const n=Math.max(2,Math.ceil(Math.hypot(x1-x0,z1-z0)/1.2)),pts=[];for(let i=0;i<=n;i++)pts.push(new V(x0+(x1-x0)*i/n,0,z0+(z1-z0)*i/n));ribbon(vs,idx,pts,1.5,0.06,3);});
    if(vs.length)addMesh(vs,idx,pave(0xcfc6b4));}
   {const vs:number[]=[],idx:number[]=[];PATHCURVES.forEach(pts=>ribbon(vs,idx,dense(pts),1.25,0.065,3));addMesh(vs,idx,pave(0xd6ccb8));}}

  // clouds
  for(let i=0;i<12;i++){const c=new THREE.Group();c.position.set(Math.random()*400-200,55+Math.random()*20,Math.random()*400-200);
    [[0,0,0,6],[5,-0.6,1,4.4],[-5,-0.6,-0.5,4.2]].forEach(([x,y,z,r])=>{const m=part(new THREE.IcosahedronGeometry(r,1),0xffffff,c,x,y,z,0);m.scale.y=0.6;});
    c.userData.drift=0.5+Math.random()*0.8;scene.add(c);CLOUDS.push(c);}
  buildMerged();buildGlass();buildGrid();OBJS.forEach(o=>OBJBY[o.id]=o);
  scene.traverse(m=>{if(!(m instanceof THREE.Mesh)||m.userData.ground)return;if(m.material===OUT||m.material===ZMAT||m.material===GLASSMAT||m.material===BROKEMAT||m.material.transparent){m.castShadow=m.receiveShadow=false;return;}m.castShadow=true;m.receiveShadow=true;});
  CLOUDS.forEach(c=>c.traverse(m=>{m.castShadow=m.receiveShadow=false;}));
}
const CLOUDS:THREE.Group[]=[];

// spatial grid so the physics only checks what's near the ball
const GRID=new Map<number,WorldCollider[]>();
const GC=6;
function buildGrid(){[...COLL,...STATIC].forEach(c=>{const m=c.br+R+1;
  for(let ix=Math.floor((c.c.x-m)/GC);ix<=Math.floor((c.c.x+m)/GC);ix++)for(let iz=Math.floor((c.c.z-m)/GC);iz<=Math.floor((c.c.z+m)/GC);iz++){const k=pkey(ix,iz),cell=GRID.get(k)||[];cell.push(c);GRID.set(k,cell);}});}
const EMPTY:WorldCollider[]=[];
const near=(p:THREE.Vector3)=>GRID.get(pkey(Math.floor(p.x/GC),Math.floor(p.z/GC)))||EMPTY;
export { ANCH, BROKEMAT, CARC, CLOUDS, COLL, CULR, CULS, DRIVES, EMPTY, FADEG, FIELD, FRICZ, GB, GC, GI, GLASS, GLASSMAT, GRASSI, GRID, H, HL, HOUSEPOS, HOUSES, JUNK, MATX, MERGE, MFADE, MKEY, MSOLID, OBJS, PADS, PARKTREES, PATHCURVES, PATHI, PATHS, PC, PGRID, POOLS, RGRID, RHALF, ROADCURVES, ROADS, ROOFC, RSEG, SANDI, SANDP, SHARDGEO, SHARDS, START, STATIC, TG, TM, TREES, WALLC, WALLN, WATERI, WOODI, WOODS, WX, WZ, XMAX, XMIN, YARD, ZERO, ZMAT, ZMAX, ZMIN, addPad, addTree, breakGlass, buildGlass, buildGrid, buildMerged, buildWorld, bx, claim, clearHouse, cone, cy, decal, endMember, faceAt, finalize, glassPane, groundInfo, groundN, groupObj, houseName, inPoly, inWoods, localToWorld, makeObj, member, mergeVis, meshH, near, padRect, par, pathDist, pathJunk, pkey, poly, rawH, resetGlass, rnd, roadNearest, roadSurf, seed, segNear, setGlass, sp, spotFree, sstep, textTex, tgt, tq, updateShards, where, yardClear, yards, zone };
