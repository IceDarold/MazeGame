(() => {
'use strict';
/** @typedef {{n:boolean,e:boolean,s:boolean,w:boolean}} Walls */
/** @typedef {{x:number,y:number,walls:Walls,visited:boolean}} Cell */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const dpad = document.getElementById('dpad');
const winModal = document.getElementById('winModal');
const winStats = document.getElementById('winStats');

const difficultySel = document.getElementById('difficulty');
const seedInput = document.getElementById('seed');
const fogCheck = document.getElementById('fog');

const btnNew = document.getElementById('newMaze');
const btnNext = document.getElementById('nextLevel');
const btnHint = document.getElementById('hint');
const btnPause = document.getElementById('pause');
const btnReset = document.getElementById('resetBests');
const btnNextModal = document.getElementById('nextModal');
const btnNewModal = document.getElementById('newModal');
const btnCloseModal = document.getElementById('closeModal');
const btnSettings = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const btnCloseSettings = document.getElementById('closeSettings');

const DIFFICULTIES = {
  Easy: { cols:15, rows:11, bias:0 },
  Medium: { cols:31, rows:21, bias:0.1 },
  Hard: { cols:41, rows:31, bias:0.2 }
};

let state = {
  level:1,
  difficulty:'Medium',
  seed:'',
  rng:null,
  maze:[],
  cols:0,
  rows:0,
  cellSize:20,
  player:{x:0,y:0,px:0,py:0,dir:null,progress:0},
  exit:{x:0,y:0},
  timer:0,
  steps:0,
  bests: JSON.parse(localStorage.getItem('maze_bests')||'{}'),
  fog: JSON.parse(localStorage.getItem('maze_fog')||'false'),
  wins: parseInt(localStorage.getItem('maze_wins')||'0',10)
};

/** Utility seeded RNG based on sfc32 */
function createRNG(seedStr){
  let h = xmur3(seedStr)();
  return sfc32(h, h, h, h);
}
function xmur3(str){
  let h=1779033703^str.length; for(let i=0;i<str.length;i++) h=Math.imul(h^str.charCodeAt(i),3432918353),h=h<<13|h>>>19; return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^h>>>16)>>>0;};
}
function sfc32(a,b,c,d){return function(){a|=0;b|=0;c|=0;d|=0;let t=(a+b|0)+d|0;d=d+1|0;a=b^b>>>9;b=c+(c<<3)|0;c=(c<<21|c>>>11);c=c+t|0;return (t>>>0)/4294967296;};}

/** Generate perfect maze using DFS backtracker */
function generateMaze(cols, rows, rng, bias=0){
  const grid = [];
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) grid.push({x,y,walls:{n:true,e:true,s:true,w:true},visited:false});
  function idx(x,y){return y*cols+x;}
  const stack=[grid[0]]; stack[0].visited=true;
  let prevDir=null;
  while(stack.length){
    const cell=stack[stack.length-1];
    const dirs=[];
    const {x,y}=cell;
    if(y>0 && !grid[idx(x,y-1)].visited) dirs.push('n');
    if(x<cols-1 && !grid[idx(x+1,y)].visited) dirs.push('e');
    if(y<rows-1 && !grid[idx(x,y+1)].visited) dirs.push('s');
    if(x>0 && !grid[idx(x-1,y)].visited) dirs.push('w');
    if(dirs.length===0){ stack.pop(); prevDir=null; continue; }
    if(prevDir && dirs.includes(prevDir) && rng()<bias) var dir=prevDir; else var dir=dirs[Math.floor(rng()*dirs.length)];
    let nx=x,ny=y; if(dir==='n') ny--; if(dir==='s') ny++; if(dir==='e') nx++; if(dir==='w') nx--;
    const next=grid[idx(nx,ny)];
    cell.walls[dir]=false;
    next.walls[{n:'s',s:'n',e:'w',w:'e'}[dir]]=false;
    next.visited=true; stack.push(next); prevDir=dir;
  }
  return grid;
}

/** Breadth-first search for shortest path */
function bfs(grid,cols,rows,start,end){
  const q=[start]; const visited=new Set([start.y*cols+start.x]); const parent={};
  while(q.length){
    const cur=q.shift(); if(cur.x===end.x && cur.y===end.y) break;
    const cell=grid[cur.y*cols+cur.x];
    const dirs=[['n',0,-1],['e',1,0],['s',0,1],['w',-1,0]];
    for(const [d,dx,dy] of dirs){
      if(cell.walls[d]) continue; const nx=cur.x+dx, ny=cur.y+dy; const key=ny*cols+nx; if(visited.has(key)) continue;
      visited.add(key); parent[key]=cur; q.push({x:nx,y:ny});
    }
  }
  const path=[]; let cur={x:end.x,y:end.y}; const endKey=cur.y*cols+cur.x; if(!(endKey in parent)&&!(cur.x===start.x&&cur.y===start.y)) return [];
  while(!(cur.x===start.x&&cur.y===start.y)){ path.push(cur); const key=cur.y*cols+cur.x; cur=parent[key]; }
  path.push(start); return path.reverse();
}

/** Resize canvas to window */
function resize(){
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function resetTimer(){ state.timer=0; state.steps=0; }

function formatTime(t){ const m=Math.floor(t/60); const s=Math.floor(t%60); return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }

function updateHUD(){
  const best = state.bests[state.difficulty] ? formatTime(state.bests[state.difficulty]) : '--';
  hud.textContent = `Level ${state.level} | Difficulty ${state.difficulty} | Seed ${state.seed} | Time ${formatTime(state.timer)} | Steps ${state.steps} | Best ${best} | Wins ${state.wins}`;
}

function newMaze(seed){
  state.seed = seed || seedInput.value || Math.random().toString(36).slice(2,10);
  seedInput.value = state.seed;
  state.rng = createRNG(state.seed);
  const conf = DIFFICULTIES[state.difficulty];
  state.cols=conf.cols; state.rows=conf.rows;
  state.maze = generateMaze(conf.cols, conf.rows, state.rng, conf.bias);
  state.player={x:0,y:0,px:0,py:0,dir:null,progress:0};
  state.exit={x:conf.cols-1,y:conf.rows-1};
  state.steps=0; state.timer=0; state.hintPath=[]; state.paused=false; state.won=false;
  state.visible=new Set(); reveal(state.player.x,state.player.y);
  verifyMaze();
  resize(); draw(); updateHUD();
}

function verifyMaze(){
  const path=bfs(state.maze,state.cols,state.rows,{x:0,y:0},{x:state.cols-1,y:state.rows-1});
  if(path.length===0) console.warn('Maze generation failed self-check');
}

function reveal(x,y){ const r= state.fog?3:Math.max(state.cols,state.rows); for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<state.cols&&ny<state.rows) state.visible.add(ny*state.cols+nx);} }

function move(dir){ if(state.player.dir||state.paused||state.won) return; const cell = state.maze[state.player.y*state.cols+state.player.x]; if(cell.walls[dir]) return; const dx={n:0,e:1,s:0,w:-1}[dir], dy={n:-1,e:0,s:1,w:0}[dir]; state.player.dir=dir; state.player.progress=0; state.player.tx=state.player.x+dx; state.player.ty=state.player.y+dy; state.steps++; state.hintPath=[]; reveal(state.player.tx,state.player.ty); }

function update(dt){ if(state.paused||state.won) return; state.timer += dt/1000; if(state.player.dir){ state.player.progress += dt/120; if(state.player.progress>=1){ state.player.x=state.player.tx; state.player.y=state.player.ty; state.player.dir=null; if(state.player.x===state.exit.x && state.player.y===state.exit.y) win(); } }
}

function win(){ state.won=true; const time=state.timer; const best=state.bests[state.difficulty]; if(!best||time<best){ state.bests[state.difficulty]=time; localStorage.setItem('maze_bests',JSON.stringify(state.bests)); }
  state.wins++; localStorage.setItem('maze_wins',state.wins);
  winStats.textContent=`Time ${formatTime(time)} | Steps ${state.steps}`;
  winModal.classList.remove('hidden');
}

function draw(){ ctx.clearRect(0,0,canvas.width,canvas.height); const w=canvas.clientWidth, h=canvas.clientHeight; const cellW=w/state.cols, cellH=h/state.rows; state.cellSize=cellW;
  ctx.strokeStyle='#888'; ctx.lineWidth=2; ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
  // draw maze
  ctx.strokeStyle='#fff';
  for(let y=0;y<state.rows;y++) for(let x=0;x<state.cols;x++){
    const cell = state.maze[y*state.cols+x]; const sx=x*cellW, sy=y*cellH;
    const key=y*state.cols+x; const vis = !state.fog || state.visible.has(key); ctx.globalAlpha=vis?1:0.1;
    if(cell.walls.n) line(sx,sy,sx+cellW,sy);
    if(cell.walls.e) line(sx+cellW,sy,sx+cellW,sy+cellH);
    if(cell.walls.s) line(sx,sy+cellH,sx+cellW,sy+cellH);
    if(cell.walls.w) line(sx,sy,sx,sy+cellH);
    ctx.fillStyle= key===0?'green':(x===state.exit.x&&y===state.exit.y?'gold':'#000');
    ctx.fillRect(sx+2,sy+2,cellW-4,cellH-4);
  }
  ctx.globalAlpha=1;
  // hint path
  if(state.hintPath && state.hintPath.length){ const alpha=0.5+0.5*Math.sin(performance.now()/200); ctx.strokeStyle=`rgba(0,0,255,${alpha})`; ctx.lineWidth=4; ctx.setLineDash([6,6]); ctx.beginPath(); const p=state.hintPath; ctx.moveTo(p[0].x*cellW+cellW/2,p[0].y*cellH+cellH/2); for(let i=1;i<p.length;i++) ctx.lineTo(p[i].x*cellW+cellW/2,p[i].y*cellH+cellH/2); ctx.stroke(); ctx.setLineDash([]); }
  // player
  const p = state.player; const sx = (p.x + (p.dir?{n:0,e:p.progress,s:0,w:-p.progress}[p.dir]:0))*cellW; const sy = (p.y + (p.dir?{n:-p.progress,e:0,s:p.progress,w:0}[p.dir]:0))*cellH; ctx.save(); ctx.fillStyle='#f00'; ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=4; ctx.beginPath(); ctx.arc(sx+cellW/2, sy+cellH/2, Math.min(cellW,cellH)/3,0,Math.PI*2); ctx.fill(); ctx.restore();
}

function line(x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }

function loop(ts){ const dt=ts-(state.lastTs||ts); state.lastTs=ts; update(dt); draw(); updateHUD(); requestAnimationFrame(loop); }

// Input
window.addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT' || e.target.tagName==='SELECT') return; const key=e.key.toLowerCase(); if(key==='arrowup'||key==='w') move('n'); if(key==='arrowdown'||key==='s') move('s'); if(key==='arrowleft'||key==='a') move('w'); if(key==='arrowright'||key==='d') move('e'); if(key==='r') newMaze(); if(key==='p') togglePause(); if(key==='m') console.log('toggle sound'); });
btnNew.onclick=()=>newMaze();
btnNext.onclick=()=>{ state.level++; increaseDifficulty(); newMaze(); };
btnHint.onclick=()=>{ if(state.player.dir) return; state.hintPath = bfs(state.maze,state.cols,state.rows,{x:state.player.x,y:state.player.y},state.exit); };
btnPause.onclick=()=>togglePause();
btnReset.onclick=()=>{ state.bests={}; localStorage.removeItem('maze_bests'); updateHUD(); };
btnNextModal.onclick=()=>{ winModal.classList.add('hidden'); state.level++; increaseDifficulty(); newMaze(); };
btnNewModal.onclick=()=>{ winModal.classList.add('hidden'); newMaze(); };
btnCloseModal.onclick=()=> winModal.classList.add('hidden');
btnSettings.onclick=()=>{ settingsPanel.classList.remove('hidden'); };
btnCloseSettings.onclick=()=>{ settingsPanel.classList.add('hidden'); };

function togglePause(){ state.paused=!state.paused; btnPause.textContent=state.paused?'Resume':'Pause'; }

// D-pad
['up','down','left','right'].forEach(dir=>{
  const b = dpad.querySelector(`[data-dir="${dir}"]`);
  if(!b) return;
  ['click','touchstart'].forEach(ev=>b.addEventListener(ev,e=>{ e.preventDefault(); move({up:'n',down:'s',left:'w',right:'e'}[dir]); }));
});

// Settings
fogCheck.checked=state.fog; fogCheck.onchange=()=>{ state.fog=fogCheck.checked; localStorage.setItem('maze_fog',JSON.stringify(state.fog)); state.visible=new Set(); reveal(state.player.x,state.player.y); draw(); };
difficultySel.value=state.difficulty=localStorage.getItem('maze_diff')||'Medium'; difficultySel.onchange=()=>{ state.difficulty=difficultySel.value; localStorage.setItem('maze_diff',state.difficulty); newMaze(); };
seedInput.onchange=()=>newMaze(seedInput.value);

function increaseDifficulty(){
  const keys=Object.keys(DIFFICULTIES); let idx=keys.indexOf(state.difficulty); if(idx<keys.length-1){ state.difficulty=keys[idx+1]; difficultySel.value=state.difficulty; localStorage.setItem('maze_diff',state.difficulty); }
}

function solvePath(){ return bfs(state.maze,state.cols,state.rows,{x:state.player.x,y:state.player.y},state.exit); }
function regen(seed,diff){ if(diff) {state.difficulty=diff; difficultySel.value=diff;} newMaze(seed); }
function getState(){ return {level:state.level,difficulty:state.difficulty,seed:state.seed,time:state.timer,steps:state.steps}; }
window.__debug={regen,solvePath,getState};

window.addEventListener('resize',()=>{ resize(); draw(); });

// Start
resize(); newMaze();
requestAnimationFrame(loop);

})();
