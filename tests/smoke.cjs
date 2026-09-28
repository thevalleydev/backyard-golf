// Headless smoke test. Loads index.html in jsdom with a stubbed WebGL renderer and three@0.128 from npm,
// builds the world, plays through the real game functions, and checks invariants that have broken before
// (golfer in scene, school footprint, roads above terrain, swipe power ordering, course logging).
// It cannot see pixels: anything visual still needs a human on a phone.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');const THREE=require('three');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const EXPORTS='G,OBJS,TREES,GLASS,HL,swing,simStep,updateVisuals,selectObj,roadSurf,pathDist,scene,H';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'  FAIL')+'  '+m);if(!c)fails++;};
function boot(){
  const dom=new JSDOM(html.replace(/<script src=[^>]+><\/script>/,'').replace(/<script>[\s\S]*?<\/script>/,''),{runScripts:'outside-only',pretendToBeVisual:true,url:'https://localhost/'});
  const w=dom.window;
  THREE.WebGLRenderer=function(){this.shadowMap={};this.domElement=w.document.createElement('canvas');this.setPixelRatio=()=>{};this.setSize=()=>{};this.render=()=>{};};
  w.THREE=THREE;
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:()=>({width:100})},{get:(t,k)=>k in t?t[k]:()=>{},set:(t,k,v)=>{t[k]=v;return true}});
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLElement.prototype.setPointerCapture=()=>{};w.requestAnimationFrame=()=>{};
  // the game is one IIFE; inject an export right before it closes (the LAST "})();" in the script)
  w.eval(src.replace(/\}\)\(\);\s*$/,`window.__x={${EXPORTS}};})();`));
  return {w,d:w.document,X:w.__x};
}
const fly=X=>{let n=0;while(X.G.phase==='flight'&&n++<6000)X.simStep(1/240);};

console.log('world');
const t0=Date.now();const {w,d,X}=boot();const G=X.G;
ok(Date.now()-t0<8000,`builds in ${Date.now()-t0} ms`);
ok(X.TREES.length>500,`${X.TREES.length} trees`);ok(X.HL.length>50,`${X.HL.length} houses`);
const byId=id=>X.OBJS.find(o=>o.id===id);
['court','school','cars','cwall','cornhole','tire','trees','houses','pools'].forEach(id=>ok(!!byId(id),`object ${id}`));
const sch=byId('school');ok(sch.size.y<15&&sch.size.x>60,`school bounds sane (${sch.size.toArray().map(v=>v.toFixed(0)).join('x')})`);
const inSchool=X.TREES.filter(t=>{const lx=t.x+160,lz=t.z-75;return (Math.abs(lx-2)<31&&Math.abs(lz+17)<23.5)||(Math.abs(lx+6)<24&&Math.abs(lz-27)<20)||(Math.abs(lx-46)<8&&Math.abs(lz+16)<9);}).length;
ok(inSchool===0,`no trees inside the school (${inSchool})`);
ok(X.TREES.every(t=>X.roadSurf(t.x,t.z)>1),'no trees on roads');
const corners=h=>{const r=[];for(let lx=-5.5;lx<=5.5;lx+=1.1)for(let lz=-4;lz<=4;lz+=1){const c=Math.cos(h.a),s=Math.sin(h.a);r.push([h.x+lx*c+lz*s,h.z-lx*s+lz*c]);}return r;};
ok(X.HL.every(h=>corners(h).every(([x,z])=>X.roadSurf(x,z)>0.3&&X.pathDist(x,z)>1.2)),'houses clear of roads and paths');
{let terrain=null,road=null;X.scene.children.forEach(m=>{if(m.isMesh&&m.userData.ground){if(m.geometry.attributes.color)terrain=m;else if(!road&&m.material.color.getHex()===0x5d6064)road=m;}});
 const rc=new THREE.Raycaster();let worst=-9;for(let x=-200;x<160;x+=3.1)for(let z=-160;z<165;z+=3.1){if(X.roadSurf(x,z)>-0.3)continue;rc.set(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0));
   const a=rc.intersectObject(terrain)[0],b=rc.intersectObject(road)[0];if(a&&b)worst=Math.max(worst,a.point.y-b.point.y);}
 ok(worst<0.02,`grass never pokes through roads (depth bias covers <2 cm) (worst ${worst.toFixed(3)} m)`);}

console.log('play');
d.getElementById('startBtn').click();
ok(G.phase==='call'&&G.picking,'game opens on the map to call a hole');
ok(G.players.every(p=>p.k&&p.k.g.parent),'every golfer is in the scene');
X.selectObj(byId('school'));[...d.querySelectorAll('#ruleList button')][1].click();
ok(G.phase==='aim','hole starts');ok(d.getElementById('hCall').textContent==='Break a school window','HUD headline is the rule');
X.swing(0.6);fly(X);ok(G.phase!=='flight','shot resolves');

console.log('swipe');
{const zone=d.getElementById('swingZone');let now=5000;w.performance.now=()=>now;
 const P0=G.players[G.cur];P0.ball.set(-22,0,40);P0.ball.y=X.H(-22,40)+0.15;G.yaw=0; // open field, aiming down it
 const ev=(t,x,y)=>{const e=new w.Event(t,{bubbles:true});e.clientX=x;e.clientY=y;e.pointerId=1;e.preventDefault=()=>{};zone.dispatchEvent(e);};
 const med=(pull,ms)=>{const r=[];for(let k=0;k<9;k++){G.phase='aim';const p=G.players[G.cur],b0=p.ball.clone();ev('pointerdown',200,300);
   for(let i=1;i<=8;i++){now+=40;ev('pointermove',200,300+pull*i/8);}for(let i=1;i<=8;i++){now+=ms;ev('pointermove',200,300+pull-i*30);}ev('pointerup',200,300+pull-240);
   if(G.phase==='flight'){fly(X);r.push(Math.hypot(p.ball.x-b0.x,p.ball.z-b0.z));}p.ball.copy(b0);}r.sort((a,b)=>a-b);return r[4]||0;};
 const full=med(200,12),half=med(100,12),lazy=med(200,60);
 ok(full>half*1.6,`full pull beats half pull (${full.toFixed(1)} vs ${half.toFixed(1)} m)`);ok(full>lazy,`snappy beats lazy flick (${full.toFixed(1)} vs ${lazy.toFixed(1)} m)`);}

console.log('courses');
{const {d:d2,X:X2}=boot();const G2=X2.G;d2.getElementById('startBtn').click();
 X2.selectObj(X2.OBJS.find(o=>o.id==='court'));d2.querySelector('#ruleList button').click();
 ok(G2.log.length===1&&G2.log[0].id==='court','hole is logged for saving');}

console.log(fails?`\n${fails} failing`:'\nall good');process.exit(fails?1:0);
