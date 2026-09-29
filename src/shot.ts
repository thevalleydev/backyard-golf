import { CLUBS } from './config.ts';
import type { Player } from './game-types.ts';

// The skill model caps the Gaussian draw at 2.5 sigma.
export function gauss():number{
  let u=0,v=0;
  while(!u)u=Math.random();
  while(!v)v=Math.random();
  return Math.max(-2.5,Math.min(2.5,Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)));
}

export function shotModel(p:Pick<Player,'club'|'stats'|'stance'>,pw:number){
  const cl=CLUBS[p.club],st=p.stats;
  const sdDir=cl.wob*(1.6-0.3*st.acc)*(0.6+0.4*pw);
  return{sdDir,bias:(p.stance==='R'?-1:1)*0.35*sdDir,sdDist:0.12-0.022*st.con,mishit:(0.14-0.03*st.con)*(0.5+0.5*pw)};
}
