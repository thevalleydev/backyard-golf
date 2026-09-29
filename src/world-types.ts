import type { Euler, Group, InstancedMesh, Matrix4, Mesh, MeshToonMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { CollisionShape, Zone } from './physics.ts';

export interface WorldObject {
  id:string;
  g:Group;
  name:string;
  emoji:string;
  cols:ColliderDraft[];
  zones:Record<string,ZoneReady>;
  rules:Rule[];
  cur:Group;
  fz:{z:Zone;dec:number}[];
  center:Vector3;
  size:Vector3;
  top:number;
  cat?:string;
  subRules?:(member:TargetMember)=>Rule[];
  _c0?:number;
  members?:TargetMember[];
}

export interface Rule {label:string;type:string;part?:string;zones?:string[]}
export interface TargetMember {c:Vector3;top:number;r:number;name:string;zone?:string}
export type ZoneReady = Zone & {mesh:Mesh;lc:Vector3;node:Object3D;lq?:Quaternion};

export type ColliderDraft =
  ({kind:'obb';lc:Vector3;h:Vector3;lq:Quaternion} |
   {kind:'cyl'|'leaf'|'sph';lc:Vector3;r:number;hh?:number} |
   {kind:'ring';lc:Vector3;ri:number;ro:number;hh:number}) & {
    node:Object3D;obj?:WorldObject;part?:string;rest:number;fric?:number;bouncy?:boolean;snd?:string;
    sub?:number;fk?:string;mesh?:Mesh;glass?:GlassInfo;
    c?:Vector3;q?:Quaternion;qi?:Quaternion;br?:number;off?:boolean;thru?:boolean;
  };

type ColliderInfo = {
    br:number;
    ti?:number;
    off?:boolean;
    thru?:boolean;
    glass?:GlassInfo;
    obj?:WorldObject|null;
    fk?:string;
    lt?:number;
    sub?:number;
    part?:string;
    rest?:number;
    fric?:number;
    bouncy?:boolean;
    snd?:string;
  };
export interface GlassInfo {w:number;h:number;i?:number;m?:Matrix4}
export type WorldCollider = (CollisionShape | {kind:'leaf';c:Vector3;r:number}) & ColliderInfo;

export interface Tree {
  x:number;
  y:number;
  z:number;
  th:number;
  r:number;
  mt?:Matrix4;
  mc?:[Matrix4,Matrix4][];
}

export interface TreeMeshes {can?:InstancedMesh;out?:InstancedMesh;trk?:InstancedMesh}
export interface FadeMeshes {mesh:Mesh;out:Mesh}
export type FadeGroups = Record<string,FadeMeshes>;
export type ObjMaterials = {solid:MeshToonMaterial;fade:MeshToonMaterial};
