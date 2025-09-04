// Maze Game main module
// Implements procedural maze generation and gameplay

// RNG utilities
function xmur3(str){
  let h=1779033703^str.length;
  for(let i=0;i<str.length;i++){
    h=Math.imul(h^str.charCodeAt(i),3432918353);
    h=h<<13|h>>>19;
  }
  return function(){
    h=Math.imul(h^h>>>16,2246822507);
    h=Math.imul(h^h>>>13,3266489909);
    return (h^h>>>16)>>>0;
  };
}
function mulberry32(a){
  return function(){
    let t=a+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,1|t);
    t^=t+Math.imul(t^t>>>7,61|t);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function RNG(seed){
  const seedFunc=xmur3(seed);
  const rand=mulberry32(seedFunc());
  return {random:()=>rand()};
}

const config={
  difficulties:{
    Easy:{w:21,h:15,bias:0.5},
    Medium:{w:31,h:21,bias:0.7},
    Hard:{w:41,h:31,bias:0.85}
  },
  moveDuration:120,
  fogRadius:3
};

const state={
  level:1,
  difficulty:'Easy',
  seed:'',
  rng:null,
  maze:null,
  player:{x:0,y:0,nx:0,ny:0,progress:1},
  steps:0,
  startTime:0,
  elapsed:0,
  paused:false,
  hintPath:null,
  hintTimer:0,
  fog:true,
  bestTimes:{},
  totalWins:{Easy:0,Medium:0,Hard:0}
};

// Maze cell utilities
const DIRS=[{dx:0,dy:-1,bit:1,opp:4},{dx:1,dy:0,bit:2,opp:8},{dx:0,dy:1,bit:4,opp:1},{dx:-1,dy:0,bit:8,opp:2}];

function createMaze(w,h,rng,bias){
  const cells=new Array(w*h).fill(0).map(()=>({walls:15,vis:false}));
  const stack=[];
  let cx=0,cy=0; // start at 0,0
  cells[0].vis=true;
  let lastDir=null;
  do{
    const idx=cy*w+cx;
    const dirs=DIRS.filter(d=>{
      const nx=cx+d.dx,ny=cy+d.dy;
      return nx>=0&&ny>=0&&nx<w&&ny<h&&!cells[ny*w+nx].vis;
    });
    if(dirs.length){
      let dir;
      if(lastDir && dirs.includes(lastDir) && rng.random()<bias){
        dir=lastDir;
      }else{
        dir=dirs[Math.floor(rng.random()*dirs.length)];
      }
      const nx=cx+dir.dx,ny=cy+dir.dy;
      const nidx=ny*w+nx;
      cells[idx].walls&=~dir.bit;
      cells[nidx].walls&=~dir.opp;
      stack.push({x:cx,y:cy});
      cx=nx;cy=ny;
      cells[nidx].vis=true;
      lastDir=dir;
    }else if(stack.length){
      const cell=stack.pop();
      cx=cell.x;cy=cell.y;
      lastDir=null;
    }
  }while(stack.length);
  return {w,h,cells,start:{x:0,y:0},exit:{x:w-1,y:h-1}};
}

function bfsPath(maze,start,end){
  const {w,h,cells}=maze;
  const queue=[start];
  const visited=new Set([start.y*w+start.x]);
  const prev=new Map();
  while(queue.length){
    const c=queue.shift();
    if(c.x===end.x && c.y===end.y) break;
    const idx=c.y*w+c.x;
    for(const d of DIRS){
      if(!(cells[idx].walls & d.bit)){
        const nx=c.x+d.dx,ny=c.y+d.dy;
        const nidx=ny*w+nx;
        if(!visited.has(nidx)){
          visited.add(nidx);
          prev.set(nidx,idx);
          queue.push({x:nx,y:ny});
        }
      }
    }
  }
  const path=[];
  let idx=end.y*w+end.x;
  const startIdx=start.y*w+start.x;
  if(!prev.has(idx) && idx!==startIdx) return null;
  while(idx!==startIdx){
    const x=idx%w,y=(idx/w)|0;
    path.push({x,y});
    idx=prev.get(idx);
  }
  path.push(start);
  path.reverse();
  return path;
}

function checkMaze(maze){
  const path=bfsPath(maze,maze.start,maze.exit);
  return Array.isArray(path);
}

// Visibility for fog of war
function computeVisibility(){
  const {w,h}=state.maze;
  if(!state.fog){
    state.visible=new Array(w*h).fill(true);
    return;
  }
  const vis=new Array(w*h).fill(false);
  const r=config.fogRadius;
  for(let dy=-r;dy<=r;dy++){
    for(let dx=-r;dx<=r;dx++){
      const nx=state.player.x+dx,ny=state.player.y+dy;
      if(nx>=0&&ny>=0&&nx<w&&ny<h) vis[ny*w+nx]=true;
    }
  }
  state.visible=vis;
}

// UI helpers
function formatTime(ms){
  const s=Math.floor(ms/1000);const m=Math.floor(s/60);const sec=s%60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// Storage
const storeKey='mazeGameData';
function loadStore(){
  try{
    const data=JSON.parse(localStorage.getItem(storeKey)||'{}');
    state.bestTimes=data.bestTimes||{};
    state.totalWins=data.totalWins||{Easy:0,Medium:0,Hard:0};
    const settings=data.settings||{};
    state.difficulty=settings.difficulty||state.difficulty;
    state.fog=settings.fog!==undefined?settings.fog:true;
    state.seed=settings.seed||'';
  }catch{}
}
function saveStore(){
  const data={bestTimes:state.bestTimes,totalWins:state.totalWins,settings:{difficulty:state.difficulty,fog:state.fog,seed:state.seed}};
  localStorage.setItem(storeKey,JSON.stringify(data));
}

// DOM elements
const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d');
const hud=document.getElementById('hud');
const diffSel=document.getElementById('difficulty');
const seedInput=document.getElementById('seed');
const newBtn=document.getElementById('newMaze');
const nextBtn=document.getElementById('nextLevel');
const hintBtn=document.getElementById('hintBtn');
const pauseBtn=document.getElementById('pauseBtn');
const resetBtn=document.getElementById('resetBests');
const settingsBtn=document.getElementById('settingsBtn');
const dpad=document.getElementById('dpad');
const modal=document.getElementById('winModal');
const winStats=document.getElementById('winStats');
const modalNext=document.getElementById('modalNext');
const modalNew=document.getElementById('modalNew');
const modalClose=document.getElementById('modalClose');
const settingsPanel=document.getElementById('settingsPanel');
const setDifficulty=document.getElementById('setDifficulty');
const setSeed=document.getElementById('setSeed');
const fogToggle=document.getElementById('fogToggle');
const settingsSave=document.getElementById('settingsSave');
const settingsCancel=document.getElementById('settingsCancel');

// Resize handling
function resize(){
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  canvas.width=rect.width*dpr;
  canvas.height=rect.height*dpr;
  ctx.scale(dpr,dpr);
  draw();
}
window.addEventListener('resize',resize);

// Game initialization
function newGame(){
  const diff=config.difficulties[state.difficulty];
  state.rng=RNG(state.seed||Math.random().toString());
  let maze;
  do{maze=createMaze(diff.w,diff.h,state.rng,diff.bias);}while(!checkMaze(maze));
  state.maze=maze;
  state.player={x:maze.start.x,y:maze.start.y,nx:maze.start.x,ny:maze.start.y,progress:1};
  state.steps=0;
  state.startTime=performance.now();
  state.elapsed=0;
  state.paused=false;
  state.hintPath=null;state.hintTimer=0;
  computeVisibility();
  updateHUD();
  draw();
}

function updateHUD(){
  const best=state.bestTimes[state.difficulty];
  hud.textContent=`Level ${state.level} | Difficulty ${state.difficulty} | Seed ${state.seed || 'random'} | Time ${formatTime(state.elapsed)} | Steps ${state.steps} | Best ${best?formatTime(best):'--'}`;
  diffSel.value=state.difficulty;
  seedInput.value=state.seed;
  setDifficulty.value=state.difficulty;
  setSeed.value=state.seed;
  fogToggle.checked=state.fog;
  pauseBtn.textContent=state.paused?'Resume':'Pause';
}

// Movement input
const keyMap={ArrowUp:{dx:0,dy:-1},ArrowDown:{dx:0,dy:1},ArrowLeft:{dx:-1,dy:0},ArrowRight:{dx:1,dy:0},KeyW:{dx:0,dy:-1},KeyS:{dx:0,dy:1},KeyA:{dx:-1,dy:0},KeyD:{dx:1,dy:0}};
function tryMove(dx,dy){
  if(state.paused||state.player.progress<1) return;
  const {x,y}=state.player;
  const w=state.maze.w;
  const idx=y*w+x;
  let dir;
  if(dx===0&&dy===-1) dir=DIRS[0];
  else if(dx===1&&dy===0) dir=DIRS[1];
  else if(dx===0&&dy===1) dir=DIRS[2];
  else if(dx===-1&&dy===0) dir=DIRS[3];
  if(dir && !(state.maze.cells[idx].walls & dir.bit)){
    state.player.nx=x+dx;state.player.ny=y+dy;state.player.progress=0;state.steps++;computeVisibility();
  }
}

window.addEventListener('keydown',e=>{
  if(keyMap[e.code]){e.preventDefault();tryMove(keyMap[e.code].dx,keyMap[e.code].dy);} 
  else if(e.code==='KeyR'){newGame();}
  else if(e.code==='KeyP'){togglePause();}
  else if(e.code==='KeyM'){console.log('toggle sound (stub)');}
});

Array.from(dpad.querySelectorAll('button')).forEach(btn=>{
  btn.addEventListener('touchstart',e=>{
    const dir=keyMap['Arrow'+btn.dataset.dir.charAt(0).toUpperCase()+btn.dataset.dir.slice(1)];
    if(dir) tryMove(dir.dx,dir.dy);
  });
});

function togglePause(){
  state.paused=!state.paused;
  if(!state.paused) state.startTime=performance.now()-state.elapsed;
  updateHUD();
}

newBtn.addEventListener('click',()=>{state.level=1;newGame();});
nextBtn.addEventListener('click',()=>{advanceDifficulty();state.level++;newGame();});
hintBtn.addEventListener('click',()=>{
  if(state.player.progress<1) return;
  state.hintPath=bfsPath(state.maze,{x:state.player.x,y:state.player.y},state.maze.exit);
  state.hintTimer=2000; // show for 2s
});
pauseBtn.addEventListener('click',togglePause);
resetBtn.addEventListener('click',()=>{state.bestTimes={};state.totalWins={Easy:0,Medium:0,Hard:0};saveStore();updateHUD();});
settingsBtn.addEventListener('click',()=>{settingsPanel.classList.remove('hidden');});
modalClose.addEventListener('click',()=>modal.classList.add('hidden'));
modalNew.addEventListener('click',()=>{modal.classList.add('hidden');state.level=1;newGame();});
modalNext.addEventListener('click',()=>{modal.classList.add('hidden');advanceDifficulty();state.level++;newGame();});
settingsSave.addEventListener('click',()=>{
  state.difficulty=setDifficulty.value;
  state.seed=setSeed.value;
  state.fog=fogToggle.checked;
  saveStore();
  settingsPanel.classList.add('hidden');
  newGame();
});
settingsCancel.addEventListener('click',()=>settingsPanel.classList.add('hidden'));

function advanceDifficulty(){
  if(state.difficulty==='Easy') state.difficulty='Medium';
  else if(state.difficulty==='Medium') state.difficulty='Hard';
}

// Game loop
let last=0;
function frame(time){
  const dt=time-last;last=time;
  if(!state.paused){
    state.elapsed=performance.now()-state.startTime;
    if(state.player.progress<1){
      state.player.progress=Math.min(1,state.player.progress+dt/config.moveDuration);
      if(state.player.progress===1){
        state.player.x=state.player.nx;state.player.y=state.player.ny;
        if(state.player.x===state.maze.exit.x && state.player.y===state.maze.exit.y) win();
      }
    }
    if(state.hintTimer>0){state.hintTimer-=dt;if(state.hintTimer<=0) state.hintPath=null;}
    updateHUD();
  }
  draw();
  requestAnimationFrame(frame);
}

function win(){
  state.paused=true;
  const time=state.elapsed;
  const best=state.bestTimes[state.difficulty];
  if(!best || time<best){state.bestTimes[state.difficulty]=time;}
  state.totalWins[state.difficulty]++;
  saveStore();
  winStats.textContent=`Time ${formatTime(time)} | Steps ${state.steps}`;
  modal.classList.remove('hidden');
}

function draw(){
  const {w,h,cells,start,exit}=state.maze;
  const rect=canvas.getBoundingClientRect();
  ctx.clearRect(0,0,rect.width,rect.height);
  const cw=rect.width/w;const ch=rect.height/h;const size=Math.min(cw,ch);
  const ox=(rect.width-w*size)/2;const oy=(rect.height-h*size)/2;
  ctx.lineWidth=2;ctx.strokeStyle='#fff';
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx=y*w+x;const cell=cells[idx];
      const px=ox+x*size;const py=oy+y*size;
      if(cell.walls&1){ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+size,py);ctx.stroke();}
      if(cell.walls&2){ctx.beginPath();ctx.moveTo(px+size,py);ctx.lineTo(px+size,py+size);ctx.stroke();}
      if(cell.walls&4){ctx.beginPath();ctx.moveTo(px,py+size);ctx.lineTo(px+size,py+size);ctx.stroke();}
      if(cell.walls&8){ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px,py+size);ctx.stroke();}
      if(state.fog && !state.visible[idx]){
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(px,py,size,size);
      }
    }
  }
  // start and exit
  ctx.fillStyle='green';ctx.fillRect(ox+start.x*size+4,oy+start.y*size+4,size-8,size-8);
  ctx.fillStyle='gold';ctx.fillRect(ox+exit.x*size+4,oy+exit.y*size+4,size-8,size-8);
  // hint path
  if(state.hintPath){
    ctx.strokeStyle='rgba(255,255,255,0.5)';
    ctx.lineWidth=2;ctx.beginPath();
    for(let i=0;i<state.hintPath.length;i++){
      const p=state.hintPath[i];
      const px=ox+p.x*size+size/2;
      const py=oy+p.y*size+size/2;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke();
  }
  // player
  const px=ox+(state.player.x+(state.player.nx-state.player.x)*state.player.progress)*size+size/2;
  const py=oy+(state.player.y+(state.player.ny-state.player.y)*state.player.progress)*size+size/2;
  ctx.fillStyle='#0ff';
  ctx.beginPath();
  ctx.arc(px,py,size*0.3,0,Math.PI*2);
  ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.2)';
  ctx.beginPath();ctx.arc(px+2,py+2,size*0.3,0,Math.PI*2);ctx.fill();
}

function main(){
  loadStore();
  if(state.seed==='') state.seed=Math.floor(Math.random()*1e6).toString();
  updateHUD();
  newGame();
  resize();
  requestAnimationFrame(frame);
}

main();

// Debug helpers
window.__debug={
  regen:(seed,diff)=>{state.seed=seed;state.difficulty=diff;saveStore();newGame();},
  solvePath:()=>bfsPath(state.maze,{x:state.player.x,y:state.player.y},state.maze.exit),
  getState:()=>({level:state.level,difficulty:state.difficulty,seed:state.seed,player:state.player})
};
