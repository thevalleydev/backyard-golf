// World meters, traced from image pixels (1 px = 0.2 m).
export const WX=(px:number)=> (px-1180)*0.2;
export const WZ=(py:number)=> (py-900)*0.2;
export const faceAt=(x:number,z:number,tx:number,tz:number)=>Math.atan2(tx-x,tz-z);

export type Point=[number,number];
export const poly=(a:Point[]):Point[]=>a.map(([px,py])=>[WX(px),WZ(py)]);
export function inPoly(pl:Point[],x:number,z:number):boolean{
  let c=false;
  for(let i=0,j=pl.length-1;i<pl.length;j=i++){
    const[xi,zi]=pl[i],[xj,zj]=pl[j];
    if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;
  }
  return c;
}
export const WOODS=[poly([[1090,775],[1290,745],[1420,760],[1480,900],[1560,1010],[1690,1120],[1650,1260],[1640,1400],[1700,1520],[1660,1700],[1150,1700],[1150,1490],[1180,1300],[1190,1100],[1150,960],[1095,900]]),
  poly([[850,1370],[1030,1440],[1150,1480],[1150,1700],[840,1700]])];
export const PARKTREES=poly([[1110,360],[1290,370],[1300,690],[1180,700],[1120,600],[1060,480]]);
export const FIELD=poly([[880,935],[1110,935],[1150,1080],[1140,1250],[1110,1380],[1000,1400],[870,1345],[880,1150]]);
export const SANDP=poly([[670,1120],[880,1120],[880,1260],[850,1330],[670,1330]]);
export const inWoods=(x:number,z:number)=>inPoly(WOODS[0],x,z)||inPoly(WOODS[1],x,z);
