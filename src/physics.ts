import { Quaternion, Vector3 as V } from 'three';
import { R } from './config.ts';

type Sphere = {kind:'sph'; c:V; r:number};
type Cylinder = {kind:'cyl'; c:V; r:number; hh:number};
type Ring = {kind:'ring'; c:V; ri:number; ro:number; hh:number};
type Box = {kind:'obb'; c:V; h:V; q:Quaternion; qi:Quaternion};
export type CollisionShape = Sphere | Cylinder | Ring | Box;
export type Zone = (Cylinder | (Box & {sinkY?:number})) & {sinkY?:number};
type Hit = {n:V; pen:number};

/* ---------- collision ---------- */
const tv=new V();
function collide(c:CollisionShape,p:V):Hit | null{
  if(c.kind==='sph'){const d=p.distanceTo(c.c);if(d>c.r+R||d<1e-6)return null;return{n:p.clone().sub(c.c).divideScalar(d),pen:c.r+R-d};}
  if(c.kind==='cyl'){const dy=p.y-c.c.y;if(Math.abs(dy)>c.hh+R)return null;const dx=p.x-c.c.x,dz=p.z-c.c.z,d=Math.hypot(dx,dz);if(d>c.r+R)return null;
    if(dy>c.hh){if(d<=c.r)return{n:new V(0,1,0),pen:c.hh+R-dy};
      const cx=c.c.x+c.r*dx/d,cz=c.c.z+c.r*dz/d,df=new V(p.x-cx,dy-c.hh,p.z-cz),l=df.length();if(l>=R||l<1e-6)return null;return{n:df.divideScalar(l),pen:R-l};}
    if(dy<-c.hh){if(d<=c.r)return{n:new V(0,-1,0),pen:c.hh+R+dy};return null;}
    if(d<1e-6)return{n:new V(1,0,0),pen:c.r+R};return{n:new V(dx/d,0,dz/d),pen:c.r+R-d};}
  if(c.kind==='ring'){const dy=p.y-c.c.y;if(Math.abs(dy)>c.hh+R)return null;const dx=p.x-c.c.x,dz=p.z-c.c.z,d=Math.hypot(dx,dz)||1e-6;
    if(d<c.ri-R||d>c.ro+R)return null;
    if(dy>c.hh&&d>=c.ri&&d<=c.ro)return{n:new V(0,1,0),pen:c.hh+R-dy};
    if(d<(c.ri+c.ro)/2)return{n:new V(-dx/d,0,-dz/d),pen:d-(c.ri-R)};
    return{n:new V(dx/d,0,dz/d),pen:c.ro+R-d};}
  // obb
  const lp=tv.copy(p).sub(c.c).applyQuaternion(c.qi),h=c.h;
  const cl=new V(Math.max(-h.x,Math.min(h.x,lp.x)),Math.max(-h.y,Math.min(h.y,lp.y)),Math.max(-h.z,Math.min(h.z,lp.z)));
  const diff=lp.clone().sub(cl),d=diff.length();if(d>R)return null;let n:V,pen:number;
  if(d>1e-6){n=diff.divideScalar(d);pen=R-d;}
  else{const ex=h.x-Math.abs(lp.x),ey=h.y-Math.abs(lp.y),ez=h.z-Math.abs(lp.z);
    if(ex<=ey&&ex<=ez){n=new V(Math.sign(lp.x)||1,0,0);pen=R+ex;}else if(ey<=ez){n=new V(0,Math.sign(lp.y)||1,0);pen=R+ey;}else{n=new V(0,0,Math.sign(lp.z)||1);pen=R+ez;}}
  return{n:n.applyQuaternion(c.q),pen};
}
function inZone(z:Zone | null | undefined,p:V):boolean{if(!z)return false;if(z.kind==='cyl')return Math.abs(p.y-z.c.y)<=z.hh&&Math.hypot(p.x-z.c.x,p.z-z.c.z)<=z.r;
  const l=tv.copy(p).sub(z.c).applyQuaternion(z.qi);return Math.abs(l.x)<=z.h.x&&Math.abs(l.y)<=z.h.y&&Math.abs(l.z)<=z.h.z;}
function throughZone(z:Zone,from:V|null,to:V):boolean{
  if(z.sinkY==null)return inZone(z,to);
  if(z.kind!=='obb'||!from)return false;
  const a=from.clone().sub(z.c).applyQuaternion(z.qi),b=to.clone().sub(z.c).applyQuaternion(z.qi);
  if(a.y<=z.sinkY||b.y>z.sinkY)return false;
  const t=(z.sinkY-a.y)/(b.y-a.y),x=a.x+(b.x-a.x)*t,d=a.z+(b.z-a.z)*t;
  return Math.abs(x)<=z.h.x-R+0.01&&Math.abs(d)<=z.h.z-R+0.01;
}
export { collide, inZone, throughZone, tv };
