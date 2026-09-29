// Headless smoke test. Loads index.html in jsdom with a stubbed WebGL renderer and three@0.128 from npm,
// builds the world, plays through the real game functions, and checks invariants that have broken before
// (golfer in scene, school footprint, roads above terrain, swipe power ordering, course logging).
// It cannot see pixels: anything visual still needs a human on a phone.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');const THREE=require('three');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const EXPORTS='G,OBJS,TREES,GLASS,HL,CLOUDS,SFX,audioInit,swing,simStep,stepGolfer,updateVisuals,selectObj,nearbyLeads,pickAt,updateCamera,camera,courseHole,teeUp,near,collide,roadSurf,pathDist,PATHCURVES,scene,H';
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
['court','school','cars','cwall','cornhole','tire','trees','houses','pools','playsets','kiddie','gardens','slide','swings','dome','seesaw','monkey'].forEach(id=>ok(!!byId(id),`object ${id}`));
['playsets','kiddie','gardens'].forEach(id=>{const o=byId(id);ok(o.members.length>=3,`${id}: ${o.members.length} yard targets`);ok(o.cols.length>0,`${id} has colliders`);});
['kiddie','gardens'].forEach(id=>{const o=byId(id);ok(o.members.every(m=>!!o.zones[m.zone]),`${id} has a scoring zone per yard`);});
const sch=byId('school');ok(sch.size.y<15&&sch.size.x>60,`school bounds sane (${sch.size.toArray().map(v=>v.toFixed(0)).join('x')})`);
const dome=byId('dome'),sand=byId('sand');
ok(dome.center.x-dome.size.x/2> -103&&dome.cols.length>40,'open climbing dome stays clear of school annex');
ok(sand.zones.in.c.x-sand.zones.in.h.x> -106,'playground scoring zone clears school annex');
ok(byId('seesaw').cols.some(c=>c.part==='seat')&&byId('monkey').zones.under,'new playground structures are playable');
const inSchool=X.TREES.filter(t=>{const lx=t.x+160,lz=t.z-75;return (Math.abs(lx-2)<31&&Math.abs(lz+17)<23.5)||(Math.abs(lx+6)<24&&Math.abs(lz-27)<20)||(Math.abs(lx-46)<8&&Math.abs(lz+16)<9);}).length;
ok(inSchool===0,`no trees inside the school (${inSchool})`);
ok(X.TREES.every(t=>X.roadSurf(t.x,t.z)>1),'no trees on roads');
const corners=h=>{const r=[];for(let lx=-5.5;lx<=5.5;lx+=1.1)for(let lz=-4;lz<=4;lz+=1){const c=Math.cos(h.a),s=Math.sin(h.a);r.push([h.x+lx*c+lz*s,h.z-lx*s+lz*c]);}return r;};
ok(X.HL.every(h=>corners(h).every(([x,z])=>X.roadSurf(x,z)>0.3&&X.pathDist(x,z)>1.2)),'houses clear of roads and paths');
{let terrain=null,road=null;X.scene.children.forEach(m=>{if(m.isMesh&&m.userData.ground){if(m.geometry.attributes.color)terrain=m;else if(!road&&m.material.color.getHex()===0x5d6064)road=m;}});
 const rc=new THREE.Raycaster();let worst=-9;for(let x=-200;x<160;x+=3.1)for(let z=-160;z<165;z+=3.1){if(X.roadSurf(x,z)>-0.3)continue;rc.set(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0));
   const a=rc.intersectObject(terrain)[0],b=rc.intersectObject(road)[0];if(a&&b)worst=Math.max(worst,a.point.y-b.point.y);}
 ok(worst<0.02,`grass never pokes through roads (depth bias covers <2 cm) (worst ${worst.toFixed(3)} m)`);}
{const zoom=G.zoom;G.pan=new THREE.Vector3();G.picking=true;G.zoom=170;X.updateCamera(3);
 ok(X.scene.fog.far>=X.camera.far&&X.CLOUDS.every(c=>!c.visible),'far overhead camera can see through clouds and fog');
 G.picking=false;G.zoom=zoom;X.updateCamera(3);
 ok(X.CLOUDS.every(c=>c.visible),'clouds return below the cloud layer');}

console.log('play');
d.getElementById('startBtn').click();
ok(G.phase==='call'&&G.picking,'game opens on the map to call a hole');
ok(G.players.every(p=>p.k&&p.k.g.parent),'every golfer is in the scene');
X.selectObj(byId('school'));[...d.querySelectorAll('#ruleList button')][1].click();d.querySelector('#modifierList button').click();
ok(G.phase==='aim','hole starts');ok(d.getElementById('hCall').textContent==='Break a school window','HUD headline is the rule');
X.swing(0.6);fly(X);ok(G.phase!=='flight','shot resolves');

console.log('multiplayer tees');
{const {w:w2,d:d2,X:X2}=boot();d2.getElementById('addP').click();d2.getElementById('addP').click();d2.getElementById('startBtn').click();
 const players=X2.G.players,spacing=()=>Math.min(...players.flatMap((p,i)=>players.slice(i+1).map(q=>Math.hypot(p.k.g.position.x-q.k.g.position.x,p.k.g.position.z-q.k.g.position.z))));
 const clear=()=>players.every(p=>!X2.near(p.ball).some(c=>c.kind!=='leaf'&&!c.off&&X2.collide(c,p.ball))&&
   ![0.8,1.3].some(y=>{const point=p.k.g.position.clone().add(new THREE.Vector3(0,y,0));return X2.near(point).some(c=>c.kind!=='leaf'&&!c.off&&X2.collide(c,point));}));
 ok(players.length===4&&spacing()>1.5,'four golfers stand apart on the first hole');
 ok(clear(),'first tee keeps all four balls and golfers clear of obstacles');
 const court=X2.OBJS.find(o=>o.id==='court');X2.teeUp(court);
 ok(players.every(p=>p.k.dest),'golfers run to the spaced next tee');
 ok(players.every(p=>!X2.near(p.ball).some(c=>c.kind!=='leaf'&&!c.off&&X2.collide(c,p.ball))),'new tee balls stay clear of obstacles');
 const runner=players[0];runner.k.g.position.copy(runner.k.dest.pos).add(new THREE.Vector3(0,0,5));
 const random=w2.Math.random;w2.Math.random=()=>0;X2.stepGolfer(runner,0.05);w2.Math.random=random;
 ok(runner.k.tripT>=0&&runner.k.dest,'running golfer sometimes trips without losing their destination');
 X2.stepGolfer(runner,0.4);ok(runner.k.g.rotation.x>0.4,'trip visibly tips the golfer forward');
 X2.stepGolfer(runner,0.7);ok(runner.k.tripT<0&&Math.abs(runner.k.g.rotation.x)<0.01,'golfer recovers and can finish running');
 players.forEach(p=>{p.k.g.position.copy(p.k.dest.pos);X2.stepGolfer(p,0.02);});
 ok(spacing()>1.5&&clear(),'four golfers stand apart at a clear next tee');
 X2.G.course={holes:[{id:'court',sub:null,ri:0,tee:[players[0].ball.x+2.7,players[0].ball.z]}]};X2.G.hole=1;X2.courseHole();
 ok(players.every(p=>p.k.dest),'saved-course replay also lets golfers run to their tees');
 players.forEach(p=>{p.k.g.position.copy(p.k.dest.pos);X2.stepGolfer(p,0.02);});
 ok(spacing()>1.5,'saved-course replay keeps golfers apart after arrival');}

console.log('mobile audio');
{const {w:w2,X:X2}=boot();let resumes=0;
 w2.AudioContext=class{constructor(){this.state='suspended';this.sampleRate=8000;this.destination={};}
   createGain(){return{gain:{value:0},connect(){}};}
   createBuffer(){return{getChannelData:()=>new Float32Array(8000)};}
   resume(){resumes++;this.state='running';return Promise.resolve();}};
 X2.audioInit();ok(resumes===1&&X2.SFX.ctx.state==='running','audio context resumes on first gesture');
 X2.SFX.ctx.state='interrupted';w2.dispatchEvent(new w2.Event('pointerdown'));
 ok(resumes===2&&X2.SFX.ctx.state==='running','later gesture resumes mobile-interrupted audio');
 X2.SFX.on=false;X2.SFX.ctx.state='interrupted';w2.dispatchEvent(new w2.Event('pointerdown'));
 ok(resumes===2,'muted audio does not resume');}

console.log('swipe');
{const zone=d.getElementById('swingZone');let now=5000;w.performance.now=()=>now;
 const P0=G.players[G.cur];P0.ball.set(-22,0,40);P0.ball.y=X.H(-22,40)+0.15;G.yaw=0; // open field, aiming down it
 const ev=(t,x,y)=>{const e=new w.Event(t,{bubbles:true});e.clientX=x;e.clientY=y;e.pointerId=1;e.preventDefault=()=>{};zone.dispatchEvent(e);};
 const med=(pull,ms)=>{const r=[];for(let k=0;k<9;k++){G.phase='aim';const p=G.players[G.cur],b0=p.ball.clone();ev('pointerdown',200,300);
   for(let i=1;i<=8;i++){now+=40;ev('pointermove',200,300+pull*i/8);}for(let i=1;i<=8;i++){now+=ms;ev('pointermove',200,300+pull-i*30);}ev('pointerup',200,300+pull-240);
   if(G.phase==='flight'){fly(X);r.push(Math.hypot(p.ball.x-b0.x,p.ball.z-b0.z));}p.ball.copy(b0);}r.sort((a,b)=>a-b);return r[4]||0;};
 const full=med(200,12),half=med(100,12),lazy=med(200,60);
 ok(full>half*1.6,`full pull beats half pull (${full.toFixed(1)} vs ${half.toFixed(1)} m)`);ok(full>lazy,`snappy beats lazy flick (${full.toFixed(1)} vs ${lazy.toFixed(1)} m)`);}

console.log('phone motion');
{let now=9000;w.performance.now=()=>now;G.phase='aim';G.ctrl='phone';
 const btn=d.getElementById('swingBtn'),p=G.players[G.cur],strokes=p.strokes;
 const arm=()=>btn.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));
 const motion=(beta,gamma=0)=>{now+=20;const e=new w.Event('devicemotion');e.rotationRate={alpha:0,beta,gamma};w.dispatchEvent(e);};
 arm();motion(950);motion(950);motion(-950);motion(-950);
 ok(G.phase==='aim'&&p.strokes===strokes,'fast phone flick cannot fire a shot');
 arm();motion(230);for(let i=0;i<12;i++)motion(230);
 motion(0,1200);
 ok(G.motion&&G.motion.angle>45&&G.motion.angle<65,'backswing integrates one fixed gyro axis');
 X.updateVisuals(0.02);
 ok(parseFloat(d.getElementById('meterFill').style.width)>45&&p.k.clubPivot.rotation.z<p.k.addr-1,
   'phone backswing tracks live meter and golfer club');
 for(let i=0;i<5;i++)motion(-280);
 ok(G.phase==='aim'&&p.strokes===strokes,'reversing before the starting position does not shoot');
 for(let i=0;i<10;i++)motion(-280);
 ok(G.phase==='flight'&&p.strokes===strokes+1,'full backswing and through-swing fires exactly once');
}

console.log('courses');
{const {d:d2,X:X2}=boot();const G2=X2.G;d2.getElementById('startBtn').click();
 X2.selectObj(X2.OBJS.find(o=>o.id==='court'));d2.querySelector('#ruleList button').click();d2.querySelector('#modifierList button').click();
 ok(G2.log.length===1&&G2.log[0].id==='court','hole is logged for saving');}

console.log('collisions');
{const {d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();
 const court=X2.OBJS.find(o=>o.id==='court');X2.selectObj(court);[...d2.querySelectorAll('#ruleList button')][2].click();d2.querySelector('#modifierList button').click();
 const fence=court.cols.find(c=>c.part==='fence'&&c.h.x>1),normal=new THREE.Vector3(0,0,1).applyQuaternion(fence.q),p=G2.players[G2.cur];
 const shot=(speed,offset)=>{X2.swing(0.5);p.ball.copy(fence.c).addScaledVector(normal,-offset);p.vel.copy(normal).multiplyScalar(speed);X2.simStep(1/240);return{contact:G2.flags.contact,forward:p.vel.dot(normal)};};
 const close=shot(20,0.28);ok(close.contact,'immediate fence contact counts');
 const fast=shot(120,0.31);ok(fast.contact&&fast.forward<0,'fast shot cannot tunnel through fence');
}
{const {d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();
 const chair=X2.OBJS.find(o=>/^chair\d+$/.test(o.id));ok(!!chair,'lawn chair exists on path');
 if(chair){X2.selectObj(chair);d2.querySelector('#ruleList button').click();d2.querySelector('#modifierList button').click();
   const frame=chair.cols.find(c=>c.part==='frame'),p=G2.players[G2.cur],normal=new THREE.Vector3(1,0,0).applyQuaternion(frame.q);X2.swing(0.5);
   p.ball.copy(frame.c).addScaledVector(normal,-0.56);p.vel.copy(normal).multiplyScalar(100);X2.simStep(1/240);
   ok(G2.flags.contact&&p.vel.dot(normal)<0,'low side shot hits visible chair frame');
   const front=chair.cols.find(c=>c.part==='frame'&&c.h.x>0.3),frontNormal=new THREE.Vector3(0,0,1).applyQuaternion(front.q);
   G2.phase='aim';X2.swing(0.5);p.ball.copy(front.c).addScaledVector(frontNormal,0.55);p.vel.copy(frontNormal).multiplyScalar(-100);X2.simStep(1/240);
   ok(G2.flags.contact&&p.vel.dot(frontNormal)>0,'low front shot hits visible chair frame');
   G2.phase='aim';G2.rule=chair.rules[1];X2.swing(0.5);const seat=chair.cols.find(c=>c.part==='seat');p.ball.copy(seat.c).add(new THREE.Vector3(0,0.2,0));p.vel.set(0,-12,0);
   for(let i=0;i<3;i++)X2.simStep(1/240);ok(G2.flags.top,'chair seat still scores top landing');}
}
{const {d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();
 const dome=X2.OBJS.find(o=>o.id==='dome'),bar=dome.cols.find(c=>c.c.y>dome.g.position.y+1.5),normal=new THREE.Vector3(1,0,0).applyQuaternion(bar.q);
 X2.selectObj(dome);d2.querySelector('#ruleList button').click();d2.querySelector('#modifierList button').click();
 const p=G2.players[G2.cur];X2.swing(0.5);p.ball.copy(bar.c).addScaledVector(normal,-0.26);p.vel.copy(normal).multiplyScalar(20);X2.simStep(1/240);
 ok(G2.flags.contact,'open dome bar has a working collider');
}

console.log('shot challenges');
{const {w:w2,d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();
 const court=X2.OBJS.find(o=>o.id==='court'),house=X2.OBJS.find(o=>o.id==='houses');
 X2.selectObj(court);[...d2.querySelectorAll('#ruleList button')][2].click();
 [...d2.querySelectorAll('#modifierList button')][1].click();
 const choices=X2.nearbyLeads(),chosen=choices.find(k=>k.o===house);
 ok(!!chosen&&choices.every(k=>k.d<=60),'nearby picker includes individual houses within range');
 ok(G2.picking&&!d2.getElementById('leadPins').classList.contains('hidden')&&d2.querySelectorAll('#leadQuickList button').length>0,'bank challenge opens compact map picker');
 d2.getElementById('allNearby').click();
 d2.querySelectorAll('#leadList button')[choices.indexOf(chosen)].click();
 ok(G2.modifier==='bank'&&G2.log[0].lead.id==='houses'&&G2.log[0].lead.sub===chosen.sub,'selected bank target is logged by member');
 const fence=court.cols.find(c=>c.part==='fence'&&c.h.x>1),wall=house.cols.find(c=>c.kind==='obb'&&c.sub===chosen.sub&&c.h.x>4&&!c.glass),
   wrong=house.cols.find(c=>c.kind==='obb'&&c.sub!==chosen.sub&&c.h.x>4&&!c.glass);
 const impact=(c,speed)=>{const n=new THREE.Vector3(0,0,1).applyQuaternion(c.q),p=G2.players[G2.cur];p.ball.copy(c.c).addScaledVector(n,-c.h.z-0.18);p.vel.copy(n).multiplyScalar(speed);X2.simStep(1/240);};
 X2.swing(0.5);impact(fence,12);ok(!G2.flags.contact,'target before bank does not score');
 impact(wrong,12);ok(!G2.flags.prerequisite,'other nearby house does not satisfy chosen bank');
 impact(wall,12);ok(G2.flags.prerequisite,'chosen house contact satisfies bank challenge');
 impact(fence,12);ok(G2.flags.contact,'target after bank scores');
 G2.phase='aim';X2.swing(0.5);ok(!G2.flags.prerequisite,'bank challenge resets on next shot');
 d2.getElementById('saveBtn1').click();
 const saved=JSON.parse(w2.localStorage.getItem('byg_courses'))[0].holes[0];
 ok(saved.modifier==='bank'&&saved.lead.sub===chosen.sub,'saved course retains selected bank target');
 G2.course={holes:[saved]};G2.phase='call';w2.setTimeout=fn=>{fn();return 0;};X2.courseHole();
 ok(G2.modifier==='bank'&&G2.lead.sub===chosen.sub&&G2.phase==='aim','selected bank target replays');
 const legacy={...saved};delete legacy.modifier;G2.course={holes:[legacy]};G2.phase='call';X2.courseHole();
 ok(G2.modifier===null&&G2.phase==='aim','older courses without challenges still replay');
 const oldBank={...saved};delete oldBank.lead;G2.course={holes:[oldBank]};G2.phase='call';X2.courseHole();
 ok(G2.modifier==='bank'&&G2.lead===null,'old bank courses still use any house');
}
{const {d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();const court=X2.OBJS.find(o=>o.id==='court');
 X2.selectObj(court);[...d2.querySelectorAll('#ruleList button')][2].click();[...d2.querySelectorAll('#modifierList button')][2].click();
 const choices=X2.nearbyLeads(),chosen=choices.find(k=>k.o.id==='houses'),house=chosen.o,roof=house.cols.find(c=>c.sub===chosen.sub&&c.kind==='obb'&&c.c.y>2.5&&c.h.x>4),
   fence=court.cols.find(c=>c.part==='fence'&&c.h.x>1);
 d2.getElementById('allNearby').click();
 d2.querySelectorAll('#leadList button')[choices.indexOf(chosen)].click();
 const p=G2.players[G2.cur],n=new THREE.Vector3(0,0,1).applyQuaternion(fence.q);
 const side=house.cols.find(c=>c.sub===chosen.sub&&c.kind==='obb'&&c.h.x>4&&c.h.y>1);
 X2.swing(0.5);p.ball.copy(side.c).addScaledVector(new THREE.Vector3(0,0,1).applyQuaternion(side.q),side.h.z+0.17);p.vel.set(0,0,-12).applyQuaternion(side.q);X2.simStep(1/240);
 ok(!G2.flags.prerequisite,'side hit is not a top bounce');
 G2.phase='aim';
 X2.swing(0.5);p.ball.copy(roof.c).addScaledVector(new THREE.Vector3(0,1,0),roof.h.y+0.2);p.vel.set(0,-15,0);X2.simStep(1/240);
 ok(G2.flags.prerequisite,'landing on chosen roof satisfies bounce');
 p.ball.copy(fence.c).addScaledVector(n,-0.22);p.vel.copy(n).multiplyScalar(12);X2.simStep(1/240);
 ok(G2.flags.contact,'target after selected bounce scores');
}
{const {w:w2,d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();const court=X2.OBJS.find(o=>o.id==='court');
 X2.selectObj(court);[...d2.querySelectorAll('#ruleList button')][2].click();[...d2.querySelectorAll('#modifierList button')][1].click();
 const choices=X2.nearbyLeads(),near=choices.find(k=>k.o.id==='bench');
 ok(!!near,'non-house target offered as bank');
 ok(G2.picking&&!d2.getElementById('pickBack').classList.contains('hidden'),'nearby target opens on map');
 d2.getElementById('pickBack').click();ok(!G2.picking&&G2.target===court&&!d2.getElementById('modifierView').classList.contains('hidden'),'leaving map keeps the selected rule');
 [...d2.querySelectorAll('#modifierList button')][1].click();d2.getElementById('allNearby').click();
 ok(!G2.picking&&!d2.getElementById('leadView').classList.contains('hidden'),'full nearby list is optional');
 d2.getElementById('pickBtn').click();
 X2.updateCamera(1);X2.camera.updateMatrixWorld();const point=near.c.clone().project(X2.camera);
 X2.pickAt((point.x+1)/2*w2.innerWidth,(1-point.y)/2*w2.innerHeight);
 ok(G2.lead&&G2.lead.id!=='court'&&choices.some(k=>k.o.id===G2.lead.id&&k.sub===G2.lead.sub),'map chooses an eligible nearby first target');
}
{const {d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();const court=X2.OBJS.find(o=>o.id==='court'),bench=X2.OBJS.find(o=>o.id==='bench');
 X2.selectObj(court);[...d2.querySelectorAll('#ruleList button')][2].click();[...d2.querySelectorAll('#modifierList button')][1].click();
 d2.getElementById('allNearby').click();
 d2.querySelectorAll('#leadList button')[X2.nearbyLeads().findIndex(k=>k.o===bench)].click();
 const board=bench.cols.find(c=>c.kind==='obb'&&c.h.x>0.5),normal=new THREE.Vector3(0,0,1).applyQuaternion(board.q),p=G2.players[G2.cur];
 X2.swing(0.5);p.ball.copy(board.c).addScaledVector(normal,-board.h.z-0.18);p.vel.copy(normal).multiplyScalar(12);X2.simStep(1/240);
 ok(G2.flags.prerequisite,'a selected non-house target satisfies bank');
}
{const {d:d2,X:X2}=boot(),G2=X2.G;d2.getElementById('startBtn').click();const court=X2.OBJS.find(o=>o.id==='court');
 X2.selectObj(court);[...d2.querySelectorAll('#ruleList button')][2].click();[...d2.querySelectorAll('#modifierList button')][3].click();
 const fence=court.cols.find(c=>c.part==='fence'&&c.h.x>1),normal=new THREE.Vector3(0,0,1).applyQuaternion(fence.q),p=G2.players[G2.cur];
 const hitFence=()=>{p.ball.copy(fence.c).addScaledVector(normal,-0.22);p.vel.copy(normal).multiplyScalar(12);X2.simStep(1/240);};
 X2.swing(0.5);hitFence();ok(!G2.flags.contact,'target before path bounce does not score');
 const path=X2.PATHCURVES[0].find(pt=>X2.pathDist(pt.x,pt.z)<0.5&&X2.roadSurf(pt.x,pt.z)>1);
 ok(!!path,'path bounce test location found');
 if(path){p.ball.set(path.x,X2.H(path.x,path.z)+0.18,path.z);p.vel.set(2,0,0);G2.flags.air=false;X2.simStep(1/240);
   ok(!G2.flags.prerequisite,'rolling onto path does not count as bounce');
   p.ball.set(path.x,X2.H(path.x,path.z)+0.18,path.z);p.vel.set(0,-10,0);G2.flags.air=true;X2.simStep(1/240);
   ok(G2.flags.prerequisite,'bounce on path satisfies path challenge');hitFence();ok(G2.flags.contact,'target after path bounce scores');}
}

console.log(fails?`\n${fails} failing`:'\nall good');process.exit(fails?1:0);
