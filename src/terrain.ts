import { Vector3 } from 'three';

export const XMIN=-205,XMAX=160,ZMIN=-160,ZMAX=165;
export const PADS: {x:number;z:number;r:number;h:number}[]=[];

export const sstep=(a:number,b:number,x:number):number=>{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);
};
export function rawH(x:number,z:number):number{
  const m=sstep(XMAX+12,XMAX-8,x)*sstep(XMIN-12,XMIN+8,x)*sstep(ZMAX+12,ZMAX-8,z)*sstep(ZMIN-12,ZMIN+8,z);
  if(!m)return 0;
  return m*(1.1*Math.sin(x*0.045+0.7)*Math.cos(z*0.038-0.3)+0.6*Math.sin(x*0.02-z*0.03+1.1)+0.25*Math.sin(x*0.13+z*0.11)+0.1*Math.sin(x*0.31-z*0.27));
}
export function H(x:number,z:number):number{
  let h=rawH(x,z);
  for(const p of PADS){
    const dx=x-p.x,dz=z-p.z,rr=p.r+3;
    if(dx>rr||dx<-rr||dz>rr||dz<-rr)continue;
    const d=Math.hypot(dx,dz);
    if(d<rr){const t=sstep(rr,p.r,d);h+=(p.h-h)*t;}
  }
  return h;
}

// Height of the actual triangle mesh (same split as THREE.PlaneGeometry).
export const TG: {h?:Float32Array;x0:number;z0:number;dx:number;dz:number;nx:number;nz:number} =
  {x0:0,z0:0,dx:1,dz:1,nx:0,nz:0};
export function meshH(x:number,z:number):number{
  if(!TG.h)return H(x,z);
  const fu=(x-TG.x0)/TG.dx,fv=(z-TG.z0)/TG.dz,ix=Math.floor(fu),iz=Math.floor(fv);
  if(ix<0||iz<0||ix>=TG.nx||iz>=TG.nz)return H(x,z);
  const u=fu-ix,v=fv-iz,W=TG.nx+1,ha=TG.h[ix+W*iz],hb=TG.h[ix+W*(iz+1)],hc=TG.h[ix+1+W*(iz+1)],hd=TG.h[ix+1+W*iz];
  return u+v<=1?ha+(hd-ha)*u+(hb-ha)*v:hc+(hb-hc)*(1-u)+(hd-hc)*(1-v);
}
export function groundN(x:number,z:number):Vector3{
  const e=0.1,hx=(H(x+e,z)-H(x-e,z))/(2*e),hz=(H(x,z+e)-H(x,z-e))/(2*e);
  return new Vector3(-hx,1,-hz).normalize();
}
export function addPad(x:number,z:number,r:number,hh?:number):number{
  const h=hh??rawH(x,z);PADS.push({x,z,r,h});return h;
}
export function padRect(cx:number,cz:number,w:number,d:number,h:number):void{
  for(let x=cx-w/2;x<=cx+w/2+0.1;x+=7)
    for(let z=cz-d/2;z<=cz+d/2+0.1;z+=7)addPad(x,z,6,h);
}
