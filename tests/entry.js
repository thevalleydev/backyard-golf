import '../src/main.ts';

export { G, simStep, stepGolfer } from '../src/game.ts';
export { OBJS, TREES, GLASS, HL, CLOUDS, near, roadSurf, pathDist, PATHCURVES, H } from '../src/world.ts';
export { SFX, audioInit } from '../src/audio.ts';
export { ghosts, updateOcclusion } from '../src/input.ts';
export { swing, selectObj, nearbyLeads, pickAt, courseHole, teeUp, loadCourses, setupPlayers } from '../src/ui.ts';
export { updateVisuals, updateCamera } from '../src/main.ts';
export { camera, scene } from '../src/render.ts';
export { collide } from '../src/physics.ts';
