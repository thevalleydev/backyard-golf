import { $, DEG, R, SUNOFF, V, camera, renderer, scene, sun } from './render.ts';
import { G, addressOf, aimCone, aimDots, ballMeshes, coneGeo, cp, launchG, launchPivot, marker, placeKid, shadow, simStep, stepGolfer, traceTick } from './game.ts';
import { CLOUDS, H, START, buildWorld, groundN, tgt, updateShards } from './world.ts';
import { SW, motionTick, updateOcclusion } from './input.ts';
import { ctrlUI, initSetup, renderSetup, updateHUD, updateLeadPins } from './ui.ts';
import { shotModel } from './shot.ts';


/* ---------- camera & loop ---------- */
const camPos=new V(30,25,40),camLook=new V(),dp=new V(),dl=new V();let T=0,acc=0,last=performance.now(),hudTick=0;
function updateCamera(dt:number){
  const p=G.players.length?cp():null;let k=4;
  if(G.picking){dp.set(G.pan.x,H(G.pan.x,G.pan.z)+G.zoom,G.pan.z+G.zoom*0.3);dl.set(G.pan.x,H(G.pan.x,G.pan.z),G.pan.z);k=10;}
  else if(G.phase==='setup'||G.phase==='final'){const a=T*0.05;dp.set(START.x+Math.sin(a)*60,34,START.z+Math.cos(a)*60);dl.set(START.x,2,START.z);}
  else if((G.phase==='call'||G.phase==='between')&&G.preview){const from=G.players[G.caller].ball,m=tgt(G.preview,from);
    const d=new V(from.x-m.c.x,0,from.z-m.c.z);if(d.lengthSq()<1)d.set(0,0,1);d.normalize();const s=m.r*2;
    dp.copy(m.c).addScaledVector(d,6+s*0.9);dp.y=m.c.y+3+s*0.4;dl.copy(m.c);}
  else if(G.phase==='call'||G.phase==='between'){const b=G.players[G.caller].ball;dp.set(b.x,b.y+55,b.z+28);dl.copy(b);}
  else if(G.map&&p&&G.target){const b=p.ball,t=tgt(G.target,b).c,mid=b.clone().lerp(t,0.5),dd=Math.max(20,Math.hypot(b.x-t.x,b.z-t.z));dp.set(mid.x,mid.y+dd+12,mid.z+dd*0.3+8);dl.copy(mid);}
  else if((G.phase==='flight'||G.phase==='result')&&p){dp.copy(p.ball).addScaledVector(G.shotDir,-6);dp.y=p.ball.y+3;dl.copy(p.ball);k=6;}
  else if(p){const d=new V(Math.sin(G.yaw),0,Math.cos(G.yaw));dp.copy(p.ball).addScaledVector(d,-4.2);dp.y=p.ball.y+1.9;dl.copy(p.ball).addScaledVector(d,5);dl.y+=0.4;k=6;}
  dp.y=Math.max(dp.y,H(dp.x,dp.z)+0.5);
  const close=p&&!G.map&&!G.picking&&(G.phase==='aim'||G.phase==='flight'||G.phase==='result'),F=close?p.ball.clone().add(new V(0,G.phase==='aim'?0.9:0.2,0)):null;
  const a=1-Math.exp(-dt*k);camPos.lerp(dp,a);camLook.lerp(dl,a);
  if(close)camPos.y=Math.max(camPos.y,H(camPos.x,camPos.z)+0.4);
  camera.position.copy(camPos);camera.lookAt(camLook);
  CLOUDS.forEach(c=>{c.visible=camPos.y<42;});
  if(close&&F)updateOcclusion(true,camPos,F);
  else if(G.phase==='call'&&G.preview&&!G.picking)updateOcclusion(true,camPos,camLook);
  else updateOcclusion(false);
}
function updateVisuals(dt:number){
  G.players.forEach((p,i)=>{const b=ballMeshes[i];if(!b)return;b.m.position.copy(p.ball);b.m.visible=true;
    b.ring.visible=!(G.phase==='flight'&&i===G.cur);b.ring.position.set(p.ball.x,p.ball.y-R+0.02,p.ball.z);});
  const flying=G.phase==='flight'&&G.players.length;shadow.visible=!!flying;
  if(flying){const b=cp().ball;const gy=H(b.x,b.z);shadow.position.set(b.x,gy+0.03,b.z);const s=Math.max(0.3,1-(b.y-gy)*0.05);shadow.scale.set(s,s,s);}
  const aiming=G.phase==='aim';
  launchG.visible=aiming&&!G.map;if(aiming){const p=cp(),b=p.ball;if(p.loft==null)throw new Error('Aiming golfer has no loft');launchG.position.copy(b);launchG.rotation.y=G.yaw;launchPivot.rotation.x=Math.PI/2-p.loft*DEG;}
  aimCone.visible=aiming;if(aiming){const p=cp(),b=p.ball,sd=shotModel(p,1).sdDir*2*DEG,L=G.map?24:9,y=b.y-R+0.03,a=coneGeo.attributes.position.array;
    const sm=shotModel(p,1),cy0=G.yaw+sm.bias*DEG,x1=b.x+Math.sin(cy0+sd)*L,z1=b.z+Math.cos(cy0+sd)*L,x2=b.x+Math.sin(cy0-sd)*L,z2=b.z+Math.cos(cy0-sd)*L;
    const positions=coneGeo.attributes.position;
    positions.setXYZ(0,x1,H(x1,z1)+0.08,z1);
    positions.setXYZ(1,b.x,y,b.z);
    positions.setXYZ(2,x2,H(x2,z2)+0.08,z2);
    positions.needsUpdate=true;}
  aimDots.forEach((d,i)=>{d.visible=aiming;if(aiming){const b=cp().ball,sc=G.map?3:1,r=(0.8+i*0.55)*sc;{const dx=b.x+Math.sin(G.yaw)*r,dz=b.z+Math.cos(G.yaw)*r;d.position.set(dx,H(dx,dz)+0.04,dz);d.quaternion.setFromUnitVectors(new V(0,0,1),groundN(dx,dz));}d.scale.setScalar(sc);}});
  if(marker.visible&&G.target){const from=G.phase==='call'||G.phase==='between'?G.players[G.caller].ball:cp().ball,m=tgt(G.target,from),sc=Math.max(1,camera.position.distanceTo(m.c)/16);marker.scale.setScalar(sc);
    marker.position.set(m.c.x,m.top+0.9*sc+Math.sin(T*3)*0.2*sc,m.c.z);marker.rotation.y+=dt*2;}
  if(aiming){const p=cp(),K=p.k;if(K.dest)K.dest=addressOf(p,p.ball,G.yaw);else placeKid(p,p.ball,G.yaw);
    if(G.charging){G.chargeT+=dt;const ph=(G.chargeT/0.85)%2;G.power=ph<1?ph:2-ph;$('meterFill').style.width=(G.power*100).toFixed(0)+'%';K.clubPivot.rotation.z=K.addr-G.power*2.3;}
    else if(SW)K.clubPivot.rotation.z=K.addr-SW.back*2.3*Math.max(0,1-SW.up/50);
    else if(!G.armed&&!K.dest)K.clubPivot.rotation.z=K.addr;}
  G.players.forEach(p=>{if(p.k)stepGolfer(p,dt);});
  if(aiming)motionTick();
  traceTick();
  CLOUDS.forEach(c=>{c.position.x+=c.userData.drift*dt;if(c.position.x>220)c.position.x=-220;});
  if(aiming&&++hudTick%15===0)updateHUD();
}
function loop(now:number){
  requestAnimationFrame(loop);const dt=Math.min(0.05,(now-last)/1000);last=now;T+=dt;updateShards(dt);
  if(G.phase==='flight'){acc+=dt;const h=1/240;while(acc>=h){acc-=h;simStep(h);if(G.phase!=='flight')break;}}else acc=0;
  updateCamera(dt);updateLeadPins();updateVisuals(dt);{const f=camLook;const fx=Math.round(f.x),fz=Math.round(f.z);sun.target.position.set(fx,H(fx,fz),fz);sun.position.set(fx+SUNOFF.x,H(fx,fz)+SUNOFF.y,fz+SUNOFF.z);}renderer.render(scene,camera);
}

buildWorld();initSetup();renderSetup();ctrlUI();requestAnimationFrame(loop);
export { T, acc, camLook, camPos, dl, dp, hudTick, last, loop, updateCamera, updateVisuals };
