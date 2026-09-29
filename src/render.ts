import * as THREE from 'three';
import { R, CLUBS, PCOLORS, PCSS } from './config.ts';


const V=THREE.Vector3, Q=THREE.Quaternion, DEG=Math.PI/180;
const $=(id:string):HTMLElement=>{
  const element=document.getElementById(id);
  if(!element)throw new Error(`Missing game element: ${id}`);
  return element;
};

/* ---------- renderer ---------- */
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
$('stage').appendChild(renderer.domElement);
const scene=new THREE.Scene(); const SKY=0xa9dcf0;
scene.background=new THREE.Color(SKY); scene.fog=new THREE.Fog(SKY,180,500);
const camera=new THREE.PerspectiveCamera(62,1,0.1,450);
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
addEventListener('resize',resize); resize();
scene.add(new THREE.HemisphereLight(0xfff0d6,0x6f8a45,0.62));
const sun=new THREE.DirectionalLight(0xffe2b8,0.9);const SUNOFF=new V(-38,52,26);sun.position.copy(SUNOFF);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:160});sun.shadow.bias=-0.0006;sun.shadow.normalBias=0.03;
scene.add(sun);scene.add(sun.target);

const OUT=new THREE.MeshBasicMaterial({color:0x1d1a16,side:THREE.BackSide});
const TOONG=(()=>{const t=new THREE.DataTexture(new Uint8Array([95,175,255]),3,1,THREE.LuminanceFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})();
const toon=(o:THREE.MeshToonMaterialParameters)=>new THREE.MeshToonMaterial({gradientMap:TOONG,...o});
const MC:Record<number,THREE.MeshToonMaterial>={};
const mat=(c:number)=>MC[c]||(MC[c]=toon({color:c}));
function part(geo:THREE.BufferGeometry,col:number,parent:THREE.Object3D,x=0,y=0,z=0,t=0.035){
  const m=new THREE.Mesh(geo,mat(col)); m.position.set(x,y,z);
  if(t>0){geo.computeBoundingBox();const s=new V();geo.boundingBox!.getSize(s);
    const o=new THREE.Mesh(geo,OUT);o.scale.set((s.x+2*t)/Math.max(s.x,1e-3),(s.y+2*t)/Math.max(s.y,1e-3),(s.z+2*t)/Math.max(s.z,1e-3));m.add(o);}
  parent.add(m); return m;
}
export { $, CLUBS, DEG, MC, OUT, PCOLORS, PCSS, Q, R, SKY, SUNOFF, TOONG, V, camera, mat, part, renderer, resize, scene, sun, toon };
