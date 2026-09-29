import type { Group, Mesh, Object3D, Vector3 } from 'three';
import type { WorldObject } from './world-types.ts';

export interface Golfer {
  g: Group;
  props:Record<string,Group>;
  clubPivot: Object3D;
  addr: number;
  offSide:number;
  swingT:number;
  swingFrom:number;
  tripT: number;
  tripWait:number;
  eatT:number;
  eatIn:number;
  walkPh:number;
  ph:number;
  base:number;
  walkDelay:number;
  dest: {pos:Vector3; ry:number; sx:number}|null;
  offPivot: Group;
  propHand: Group;
  legs: Object3D[];
  shirt: Mesh;
  cap: Mesh;
  brim: Mesh;
  s1: Mesh;
  s2: Mesh;
}

export interface Player {
  ball: Vector3;
  vel: Vector3;
  loft?: number;
  club: 'eight'|'nine'|'pw';
  k: Golfer;
  stats: {pow:number;acc:number;con:number};
  name:string;
  prop:string;
  stance:'L'|'R';
  arm:'L'|'R';
  color:number;
  css:string;
  dark:number;
  food:number;
  sips:number;
  eaten:number;
  won:boolean;
  prev:Vector3;
  strokes:number;
  done:boolean;
  card:number[];
}

export interface ShotFlags {
  contact:boolean;
  through:boolean;
  top:boolean;
  broke:boolean;
  prerequisite:boolean;
  crash?:boolean;
  t:number;
  still:number;
  wob:number;
  mis:string|null;
  sd:number;
  curve:number;
  air:boolean;
  chk?:Vector3;
  chkT?:number;
}

export interface GameState {
  phase: string;
  players: Player[];
  hole: number;
  holes: number;
  caller: number;
  turn: number;
  cur: number;
  target: WorldObject|null;
  rule: WorldObject['rules'][number]|null;
  modifier: string|null;
  lead: {id:string;sub?:number|null}|null;
  yaw: number;
  map: boolean;
  preview: WorldObject|null;
  power: number;
  charging: boolean;
  chargeT: number;
  flags: ShotFlags|null;
  shotDir: Vector3;
  lastCall: string|null;
  ctrl: string;
  maxRot: number;
  armed: boolean;
  picking: boolean;
  pan: Vector3;
  zoom: number;
  armAt: number;
  motion: {axis:number;sign:number;angle:number;peak:number;started:number;last:number;throughAt:number;throughPeak:number}|null;
  targetSub:number|null;
  simT:number;
  panHole?:number;
  courseIdx:number|null;
  course:SavedCourse|null;
  log:CourseHole[];
}

export interface BallVisual {m:Mesh;ring:Mesh}
export interface CourseHole {
  id:string;
  sub?:number|null;
  ri:number;
  modifier?:string|null;
  lead?:{id:string;sub?:number|null}|null;
  tee:[number,number];
}
export interface SavedCourse {name:string;map?:string;holes:CourseHole[]}
