import { toast } from './ui.ts';

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext }
}

/* ---------- sound (Web Audio synth) ---------- */
const SFX:{ctx:AudioContext|null;master:GainNode|null;noise:AudioBuffer|null;on:boolean;last:Map<string|object,number>}=
  {ctx:null,master:null,noise:null,on:true,last:new Map()};
const MATSND:Record<string,string>={cars:'metal',grills:'metal',sheds:'wood',hoops:'metal',fences:'wood',playsets:'wood',kiddie:'plastic',gardens:'wood',cwall:'wood',cornhole:'wood',tire:'soft',houses:'wood',court:'metal',bench:'wood',trash1:'metal',trash2:'metal',psign:'wood',oak:'wood',picnic:'wood',goal:'metal',school:'wood',slide:'plastic',swings:'metal',dome:'metal',seesaw:'metal',monkey:'metal',tramp:'boing',flamingo:'plastic',gnome:'plastic',mail:'metal',stop:'metal',soda:'can',pizza:'soft',pools:'plastic'};
function audioInit(){if(!SFX.on)return;
  try{if(!SFX.ctx){const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){toast('Sound unavailable','This browser does not support Web Audio',2000);return;}
    const ctx=new AC();SFX.ctx=ctx;
    SFX.master=ctx.createGain();SFX.master.gain.value=0.7;SFX.master.connect(ctx.destination);
    const n=ctx.sampleRate,b=ctx.createBuffer(1,n,n),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;SFX.noise=b;}
    const ctx=SFX.ctx;if(ctx&&ctx.state!=='running')ctx.resume().catch(e=>{console.error('Audio resume failed',e);toast('Sound blocked','Tap the sound button to retry',2200);});
  }catch(e){console.error('Audio setup failed',e);toast('Sound unavailable','Could not start audio on this device',2200);}}
addEventListener('pointerdown',()=>{if(SFX.on&&SFX.ctx&&SFX.ctx.state!=='running')audioInit();},{capture:true});
function env(g:GainNode,t:number,a:number,peak:number,dec:number){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec);}
function audioNodes(){const {ctx,master,noise}=SFX;if(!ctx||!master||!noise)throw new Error('Audio not initialized');return{ctx,master,noise};}
function tone(type:OscillatorType,f0:number,f1:number|null,dur:number,vol:number,delay=0){const {ctx:c,master}=audioNodes(),t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);
  if(f1)o.frequency.exponentialRampToValueAtTime(f1,t+dur);env(g,t,0.004,vol,dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+0.05);}
function noise(dur:number,vol:number,ft:BiquadFilterType,f0:number,f1:number|null=null,q=1,delay=0){const {ctx:c,master,noise:buffer}=audioNodes(),t=c.currentTime+delay,s=c.createBufferSource(),fl=c.createBiquadFilter(),g=c.createGain();s.buffer=buffer;
  fl.type=ft;fl.frequency.setValueAtTime(f0,t);if(f1)fl.frequency.exponentialRampToValueAtTime(f1,t+dur);fl.Q.value=q;env(g,t,0.005,vol,dur);
  s.connect(fl);fl.connect(g);g.connect(master);s.start(t,Math.random()*0.5);s.stop(t+dur+0.05);}
function sfx(kind:string,k=1){if(!SFX.on||!SFX.ctx)return;k=Math.min(1,Math.max(0.15,k));try{switch(kind){
  case 'swing':noise(0.2,0.22,'bandpass',500,2600,1.2);tone('square',1500,900,0.035,0.12*k,0.09);tone('sine',220,120,0.08,0.35*k,0.09);break;
  case 'grass':tone('sine',110,55,0.12,0.35*k);noise(0.06,0.12*k,'lowpass',600);break;
  case 'thunk':tone('sine',150,65,0.16,0.3*k);noise(0.07,0.12*k,'lowpass',500);break;
  case 'metal':[1,2.76,5.4].forEach((m,i)=>tone('sine',720*m,null,0.6/(i+1),0.16*k/(i+1)));break;
  case 'can':tone('triangle',1800,1400,0.15,0.2*k);tone('sine',900,null,0.2,0.12*k);break;
  case 'wood':tone('triangle',320,220,0.09,0.4*k);noise(0.04,0.15*k,'bandpass',1500,null,2);break;
  case 'plastic':tone('square',520,380,0.06,0.16*k);break;
  case 'leaf':noise(0.35,0.22*k,'highpass',2500,6000,0.7);break;
  case 'boing':tone('sine',140,420,0.35,0.35*k);break;
  case 'soft':noise(0.08,0.2*k,'lowpass',900);break;
  case 'water':noise(0.45,0.35*k,'lowpass',2200,300);tone('sine',600,200,0.15,0.1*k);break;
  case 'sand':noise(0.15,0.25*k,'lowpass',700,200);break;
  case 'glass':noise(0.55,0.5,'highpass',3000,8000,0.5);tone('sine',150,60,0.15,0.3);for(let i=0;i<8;i++)tone('sine',2500+Math.random()*4500,null,0.2+Math.random()*0.35,0.07,Math.random()*0.4);break;
  case 'sip':noise(0.25,0.18,'lowpass',500,250,4);tone('sine',220,160,0.1,0.1,0.12);break;
  case 'bite':noise(0.07,0.3,'bandpass',2500,1200,1.5);noise(0.06,0.2,'bandpass',1800,900,1.5,0.1);break;
  case 'path':tone('square',1100,700,0.03,0.12*k);tone('sine',300,150,0.05,0.25*k);break;
  case 'alarm':for(let i=0;i<8;i++)tone('square',i%2?880:660,null,0.17,0.07,i*0.19);break;
  case 'win':[523,659,784,1047].forEach((f,i)=>tone('triangle',f,null,0.22,0.18,i*0.09));break;
}}catch(e){console.error('Sound effect failed',e);}}
function hitSound(key:string|object,kind:string|undefined,imp:number){const now=performance.now();if(now-(SFX.last.get(key)||0)<90)return;SFX.last.set(key,now);if(kind)sfx(kind,imp/12);}
export { MATSND, SFX, audioInit, env, hitSound, noise, sfx, tone };
