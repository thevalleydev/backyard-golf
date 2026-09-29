// World coordinates are meters; the deliberately oversized ball makes small targets playable.
export const R = 0.15;

export const CLUBS = {
  eight: {name:'8-Iron',short:'8-Iron',v:24,loft:[5,40],base:20,wob:3,desc:'Longest of the three. Lower flight, more roll.'},
  nine: {name:'9-Iron',short:'9-Iron',v:21,loft:[7,48],base:25,wob:2.6,desc:'The middle club. Easiest to control.'},
  pw: {name:'Pitching Wedge',short:'Wedge',v:18,loft:[9,58],base:31,wob:2.2,desc:'Shortest and highest. Best for popping over things.'}
} as const;

export const PCOLORS = [0xff5a36,0x2f80ed,0xf2c94c,0x9b51e0] as const;
export const PCSS = ['#ff5a36','#2f80ed','#f2c94c','#9b51e0'] as const;
