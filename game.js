(() => {
/** @typedef {{x:number,y:number,walls:number[]}} Cell */
/** @typedef {{x:number,y:number,tx:number,ty:number,progress:number,moving:boolean}} PlayerState */
'use strict';
/** Utility random generator from string seed */
/** @param {number} a seed @returns {() => number} */
function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t ^ t >>> 14) >>> 0)/4294967296;}}
const DIFFS={easy:{w:21,h:15,bias:.6},medium:{w:31,h:21,bias:.7},hard:{w:41,h:31,bias:.8}};
const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
function idx(x,y,w){return y*w+x;}
/** Generate maze using DFS backtracker with optional corridor bias */
function generateMaze(w,h,rng,bias){const cells=new Array(w*h).fill(0).map((_,i)=>({x:i%w,y:(i/w)|0,walls:[1,1,1,1]}));const stack=[cells[0]];cells[0].visited=1;let last=-1;while(stack.length){const c=stack[stack.length-1];const n=[];for(let d=0;d<4;d++){const nx=c.x+dirs[d][0],ny=c.y+dirs[d][1];if(nx>=0&&ny>=0&&nx<w&&ny<h){const ni=idx(nx,ny,w);if(!cells[ni].visited)n.push({dir:d,cell:cells[ni]});}}if(n.length){let choice;if(last>=0&&bias>0&&n.some(o=>o.dir===last)&&rng()<bias){choice=n.find(o=>o.dir===last);}else{choice=n[(rng()*n.length)|0];}const next=choice.cell;const d=choice.dir;const opp=(d+2)%4;c.walls[d]=0;next.walls[opp]=0;next.visited=1;stack.push(next);last=d;}else{stack.pop();last=-1;}}cells.forEach(c=>delete c.visited);return cells;}
/** BFS to verify connectivity and to solve path */
function bfsPath(cells,w,start,end){const q=[start],prev={};const seen=new Set([start]);while(q.length){const i=q.shift();if(i===end)break;const c=cells[i];for(let d=0;d<4;d++)if(!c.walls[d]){const nx=c.x+dirs[d][0],ny=c.y+dirs[d][1];const ni=idx(nx,ny,w);if(!seen.has(ni)){seen.add(ni);prev[ni]=i;q.push(ni);}}}const path=[];if(!seen.has(end))return path;for(let at=end;at!==undefined;at=prev[at])path.push(at);return path.reverse();}
function checkMaze(cells,w,h){return bfsPath(cells,w,0,idx(w-1,h-1,w)).length===cells.length;}
/** Represents the player. */
class Player{constructor(){this.x=0;this.y=0;this.tx=0;this.ty=0;this.progress=0;this.moving=false;this.moveDur=0.12;}start(x,y){this.x=this.tx=x;this.y=this.ty=y;this.progress=0;this.moving=false;}requestMove(dx,dy,maze,w,h){if(this.moving)return false;const c=maze[idx(this.x,this.y,w)];let dir=-1;for(let i=0;i<4;i++)if(dirs[i][0]===dx&&dirs[i][1]===dy)dir=i;if(dir<0||c.walls[dir])return false;this.tx=this.x+dx;this.ty=this.y+dy;this.progress=0;this.moving=true;return true;}update(dt){if(this.moving){this.progress+=dt/this.moveDur;if(this.progress>=1){this.x=this.tx;this.y=this.ty;this.moving=false;}}}}const canvas=document.getElementById('game');const ctx=canvas.getContext('2d');let cw,ch,cellW,cellH,dpr=window.devicePixelRatio||1;function resize(){cw=canvas.clientWidth;ch=canvas.clientHeight;canvas.width=cw*dpr;canvas.height=ch*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);if(maze)precomputeRects();render();}
window.addEventListener('resize',resize);
let maze=null,player=new Player(),rng=Math.random,level=1,difficulty='easy',seedStr='',steps=0,startTime=0,elapsed=0,paused=false,won=false,fog=false,visible=new Set(),hintPath=[],hintBlink=0,soundOn=true;const hud={level:document.getElementById('levelInfo'),timer:document.getElementById('timer'),steps:document.getElementById('steps'),best:document.getElementById('best')};const storage={get:(k,v)=>{try{const r=localStorage.getItem(k);return r===null?v:JSON.parse(r);}catch{return v;}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};function updateHUD(){hud.level.textContent=`Level ${level} (${difficulty}) Seed:${seedStr}`;const best=storage.get('best_'+difficulty,null);hud.best.textContent=best?`Best:${fmtTime(best)}`:'';}function fmtTime(sec){const m=(sec/60)|0,s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
function reveal(){if(!fog){visible=new Set(maze.map((_,i)=>i));return;}visible.clear();const r=3;for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){const nx=player.x+dx,ny=player.y+dy;if(nx>=0&&ny>=0&&nx<cfg.w&&ny<cfg.h)visible.add(idx(nx,ny,cfg.w));}}
let cfg=DIFFS[difficulty];let rects=[];function precomputeRects(){rects.length=maze.length;for(let c of maze){rects[idx(c.x,c.y,cfg.w)]={x:c.x*cellW,y:c.y*cellH};}}
function newGame(seed,diff){difficulty=diff||difficulty;cfg=DIFFS[difficulty];if(seed)seedStr=seed;else seedStr=document.getElementById('seed').value.trim()||Math.random().toString(36).slice(2,8);document.getElementById('seed').value=seedStr;document.getElementById('seedSetting').value=seedStr;document.getElementById('difficulty').value=difficulty;document.getElementById('difficultySetting').value=difficulty;rng=mulberry32(seedToInt(seedStr));maze=generateMaze(cfg.w,cfg.h,rng,cfg.bias);if(!checkMaze(maze,cfg.w,cfg.h))console.warn('Maze check failed');player.start(0,0);steps=0;startTime=performance.now();elapsed=0;paused=false;won=false;hintPath=[];reveal();updateHUD();precomputeRects();}
function nextLevel(){const order=['easy','medium','hard'];let idxd=order.indexOf(difficulty);if(idxd<order.length-1)idxd++;seedStr='';document.getElementById('seed').value='';difficulty=order[idxd];level++;newGame(null,difficulty);}function restart(){newGame(seedStr,difficulty);}function tick(dt){player.update(dt);if(!player.moving&&hintPath.length)hintPath=[];if(!player.moving&&player.x===cfg.w-1&&player.y===cfg.h-1){won=true;const sec=Math.floor(elapsed/1000);const bestKey='best_'+difficulty;const best=storage.get(bestKey,null);if(best===null||sec<best)storage.set(bestKey,sec);storage.set('wins_total',storage.get('wins_total',0)+1);document.getElementById('summary').textContent=`Time ${fmtTime(sec)}, Steps ${steps}`;document.getElementById('modal').classList.remove('hidden');}}
function render(){ctx.clearRect(0,0,cw,ch);if(!maze)return;cellW=cw/cfg.w;cellH=ch/cfg.h;ctx.lineWidth=2;for(let c of maze){const r=rects[idx(c.x,c.y,cfg.w)];const vis=visible.has(idx(c.x,c.y,cfg.w));ctx.fillStyle=vis?'#111':'#000';ctx.fillRect(r.x,r.y,cellW,cellH);ctx.strokeStyle=vis?'#888':'#333';ctx.beginPath();if(c.walls[0])ctx.moveTo(r.x,r.y),ctx.lineTo(r.x+cellW,r.y);if(c.walls[1])ctx.moveTo(r.x+cellW,r.y),ctx.lineTo(r.x+cellW,r.y+cellH);if(c.walls[2])ctx.moveTo(r.x,r.y+cellH),ctx.lineTo(r.x+cellW,r.y+cellH);if(c.walls[3])ctx.moveTo(r.x,r.y),ctx.lineTo(r.x,r.y+cellH);ctx.stroke();}
// start & exit
ctx.fillStyle='green';ctx.fillRect(0,0,cellW,cellH);ctx.fillStyle='gold';ctx.fillRect((cfg.w-1)*cellW,(cfg.h-1)*cellH,cellW,cellH);
// hint
if(hintPath.length&&Math.floor(performance.now()/400)%2===0){ctx.strokeStyle='cyan';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<hintPath.length;i++){const id=hintPath[i];const r=rects[id];const cx=r.x+cellW/2,cy=r.y+cellH/2;if(i===0)ctx.moveTo(cx,cy);else ctx.lineTo(cx,cy);}ctx.stroke();}
// player
const px=player.moving?player.x+ (player.tx-player.x)*player.progress:player.x;const py=player.moving?player.y+ (player.ty-player.y)*player.progress:player.y;ctx.fillStyle='red';ctx.beginPath();ctx.arc(px*cellW+cellW/2,py*cellH+cellH/2,Math.min(cellW,cellH)/3,0,Math.PI*2);ctx.fill();if(paused){ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,cw,ch);ctx.fillStyle='white';ctx.font='30px sans-serif';ctx.fillText('Paused',cw/2-40,ch/2);}}
let last=0;function loop(ts){const dt=(ts-last)/1000;last=ts;if(!paused&&!won){elapsed=ts-startTime;tick(dt);}hud.timer.textContent=fmtTime(Math.floor(elapsed/1000));hud.steps.textContent=`Steps:${steps}`;requestAnimationFrame(loop);render();}
requestAnimationFrame(loop);
// Input
function handleMove(dx,dy){if(player.requestMove(dx,dy,maze,cfg.w,cfg.h)){steps++;reveal();}}
const keyMap={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]};document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;if(keyMap[e.key]){e.preventDefault();handleMove(...keyMap[e.key]);}else if(e.key==='r'){restart();}else if(e.key==='p'){togglePause();}else if(e.key==='m'){soundOn=!soundOn;}else if(e.key==='h'){showHint();}});
function togglePause(){paused=!paused;document.getElementById('pauseBtn').textContent=paused?'Resume':'Pause';}
function showHint(){hintPath=bfsPath(maze,cfg.w,idx(player.x,player.y,cfg.w),idx(cfg.w-1,cfg.h-1,cfg.w));}
// Buttons
 document.getElementById('newMaze').onclick=()=>newGame('',difficulty);
 document.getElementById('nextLevel').onclick=()=>nextLevel();
 document.getElementById('hintBtn').onclick=()=>showHint();
 document.getElementById('pauseBtn').onclick=()=>togglePause();
 document.getElementById('resetBests').onclick=()=>{for(let k in DIFFS)localStorage.removeItem('best_'+k);storage.set('wins_total',0);updateHUD();};
 document.getElementById('settingsBtn').onclick=()=>{const p=document.getElementById('settingsPanel');p.classList.toggle('show');};
 document.getElementById('fogToggle').onchange=e=>{fog=e.target.checked;storage.set('fog',fog);reveal();};
 document.getElementById('difficulty').onchange=e=>{difficulty=e.target.value;storage.set('difficulty',difficulty);nextLevel();};
 document.getElementById('seed').onchange=e=>{seedStr=e.target.value;document.getElementById('seedSetting').value=seedStr;restart();};
 document.getElementById('difficultySetting').onchange=e=>{document.getElementById('difficulty').value=e.target.value;document.getElementById('difficulty').dispatchEvent(new Event('change'));};
 document.getElementById('seedSetting').onchange=e=>{document.getElementById('seed').value=e.target.value;document.getElementById('seed').dispatchEvent(new Event('change'));};
 document.getElementById('modalNext').onclick=()=>{document.getElementById('modal').classList.add('hidden');nextLevel();};
 document.getElementById('modalNew').onclick=()=>{document.getElementById('modal').classList.add('hidden');newGame('',difficulty);};
 document.getElementById('modalClose').onclick=()=>document.getElementById('modal').classList.add('hidden');
// D-pad
function setupDpad(){const d=document.getElementById('dpad');if(window.innerWidth<600)d.classList.add('show');else d.classList.remove('show');}
window.addEventListener('resize',setupDpad);setupDpad();for(const b of document.querySelectorAll('#dpad button')){b.addEventListener('touchstart',e=>{e.preventDefault();const dir=keyMap[b.dataset.dir==='up'? 'ArrowUp':b.dataset.dir==='down'?'ArrowDown':b.dataset.dir==='left'?'ArrowLeft':'ArrowRight'];handleMove(...dir);});}
// Restore settings
fog=storage.get('fog',false);document.getElementById('fogToggle').checked=fog;difficulty=storage.get('difficulty','easy');document.getElementById('difficulty').value=difficulty;document.getElementById('difficultySetting').value=difficulty;newGame('',difficulty);
// debug
window.__debug={regen:(s,d)=>newGame(s,d),solvePath:()=>bfsPath(maze,cfg.w,idx(player.x,player.y,cfg.w),idx(cfg.w-1,cfg.h-1,cfg.w)).map(i=>({x:i%cfg.w,y:(i/cfg.w)|0})),getState:()=>({level,difficulty,seed:seedStr})};
})();
