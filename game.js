(() => {
  'use strict';
  /**
   * @typedef {{N:boolean,E:boolean,S:boolean,W:boolean}} Walls
   * @typedef {{x:number,y:number,walls:Walls,rect:{x:number,y:number,w:number,h:number}}} Cell
   */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  const hud = {
    level: document.getElementById('levelDisplay'),
    diff: document.getElementById('difficultyDisplay'),
    seed: document.getElementById('seedDisplay'),
    timer: document.getElementById('timerDisplay'),
    steps: document.getElementById('stepsDisplay'),
    best: document.getElementById('bestDisplay')
  };
  const controls = {
    diff: document.getElementById('difficulty'),
    seed: document.getElementById('seed'),
    newMaze: document.getElementById('newMaze'),
    next: document.getElementById('nextLevel'),
    hint: document.getElementById('hint'),
    pause: document.getElementById('pause'),
    reset: document.getElementById('resetBests'),
    settings: document.getElementById('settingsBtn'),
    dpad: document.getElementById('dpad')
  };
  const settings = {
    panel: document.getElementById('settingsPanel'),
    diff: document.getElementById('setDifficulty'),
    seed: document.getElementById('setSeed'),
    fog: document.getElementById('fogToggle'),
    close: document.getElementById('closeSettings')
  };
  const winModal = {
    panel: document.getElementById('winModal'),
    stats: document.getElementById('winStats'),
    next: document.getElementById('winNext'),
    newMaze: document.getElementById('winNew'),
    close: document.getElementById('winClose')
  };
  const DIFFICULTY = {
    easy: { w: 21, h: 15, bias: 0.5 },
    medium: { w: 31, h: 21, bias: 0.6 },
    hard: { w: 41, h: 31, bias: 0.7 }
  };
  const state = {
    level: 1,
    difficulty: 'medium',
    seed: '',
    fog: false,
    grid: [],
    cellRects: [],
    player: { x: 0, y: 0, px: 0, py: 0, target: null, moveStart: 0, moveDur: 120 },
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    rng: null,
    revealed: [],
    hint: null,
    paused: false,
    startTime: 0,
    elapsed: 0,
    steps: 0,
    bestTimes: { easy: null, medium: null, hard: null },
    totalWins: 0
  };
  /** Create a seeded RNG using mulberry32. */
  function createRNG(seed) {
    let t = hashString(seed);
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ t >>> 15, t | 1);
      r ^= r + Math.imul(r ^ r >>> 7, r | 61);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }
  /** Hash a string to a 32-bit int. */
  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function randomSeed() {
    return Math.random().toString(36).slice(2, 10);
  }
  /** Generate a perfect maze using DFS backtracker. */
  function generateMaze(w, h, bias, rand) {
    const cells = [];
    for (let y = 0; y < h; y++) {
      cells[y] = [];
      for (let x = 0; x < w; x++) {
        cells[y][x] = { x, y, walls: { N: true, E: true, S: true, W: true }, rect: { x: 0, y: 0, w: 0, h: 0 }, visited: false };
      }
    }
    const stack = [];
    let current = cells[0][0];
    current.visited = true;
    stack.push(current);
    let prevDir = null;
    while (stack.length) {
      current = stack[stack.length - 1];
      const neighbors = [];
      const dirs = [
        ['N', 0, -1],
        ['E', 1, 0],
        ['S', 0, 1],
        ['W', -1, 0]
      ];
      for (const [dir, dx, dy] of dirs) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !cells[ny][nx].visited) {
          neighbors.push([dir, cells[ny][nx], dx, dy]);
        }
      }
      if (neighbors.length) {
        let choice;
        if (prevDir && neighbors.some(n => n[0] === prevDir) && rand() < bias) {
          choice = neighbors.find(n => n[0] === prevDir);
        } else {
          choice = neighbors[Math.floor(rand() * neighbors.length)];
        }
        const [dir, next, dx, dy] = choice;
        current.walls[dir] = false;
        const opposite = { N: 'S', E: 'W', S: 'N', W: 'E' }[dir];
        next.walls[opposite] = false;
        next.visited = true;
        stack.push(next);
        prevDir = dir;
      } else {
        stack.pop();
        prevDir = null;
      }
    }
    // clear visited flags
    for (let row of cells) for (let c of row) c.visited = false;
    return cells;
  }
  /** Self-check to ensure maze connectivity. */
  function selfCheck(cells) {
    const h = cells.length, w = cells[0].length;
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const queue = [cells[0][0]];
    visited[0][0] = true;
    let count = 1;
    while (queue.length) {
      const c = queue.shift();
      const dirs = [
        ['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]
      ];
      for (const [dir, dx, dy] of dirs) {
        if (!c.walls[dir]) {
          const nx = c.x + dx, ny = c.y + dy;
          if (!visited[ny][nx]) {
            visited[ny][nx] = true;
            queue.push(cells[ny][nx]);
            count++;
          }
        }
      }
    }
    if (count !== w * h || !visited[h - 1][w - 1]) {
      console.error('Maze generation failed self-check');
    }
  }
  /** Compute shortest path from player's cell to exit using BFS. */
  function findPath() {
    const w = state.grid[0].length, h = state.grid.length;
    const start = state.grid[state.player.y][state.player.x];
    const goal = state.grid[state.exit.y][state.exit.x];
    const queue = [start];
    const prev = Array.from({ length: h }, () => Array(w).fill(null));
    prev[start.y][start.x] = start;
    while (queue.length) {
      const c = queue.shift();
      if (c === goal) break;
      const dirs = [
        ['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]
      ];
      for (const [dir, dx, dy] of dirs) {
        if (!c.walls[dir]) {
          const nx = c.x + dx, ny = c.y + dy;
          if (!prev[ny][nx]) {
            prev[ny][nx] = c;
            queue.push(state.grid[ny][nx]);
          }
        }
      }
    }
    const path = [];
    let cur = goal;
    while (cur && cur !== start) {
      path.push(cur);
      cur = prev[cur.y][cur.x];
    }
    path.push(start);
    return path.reverse();
  }
  /** Reveal cells around player for fog-of-war. */
  function reveal(x, y) {
    const rad = 3;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const nx = x + dx, ny = y + dy;
        if (ny >= 0 && ny < state.revealed.length && nx >= 0 && nx < state.revealed[0].length) {
          state.revealed[ny][nx] = true;
        }
      }
    }
  }
  /** Format milliseconds as mm:ss. */
  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }
  function updateHUD() {
    hud.level.textContent = `Level: ${state.level}`;
    hud.diff.textContent = `Difficulty: ${state.difficulty}`;
    hud.seed.textContent = `Seed: ${state.seed}`;
    hud.timer.textContent = `Time: ${formatTime(state.elapsed)}`;
    hud.steps.textContent = `Steps: ${state.steps}`;
    const best = state.bestTimes[state.difficulty];
    hud.best.textContent = `Best: ${best ? formatTime(best) : '--:--'}`;
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    computeRects();
  }
  function computeRects() {
    if (!state.grid.length) return;
    const w = state.grid[0].length, h = state.grid.length;
    const cw = canvas.clientWidth / w;
    const ch = canvas.clientHeight / h;
    state.cellRects = [];
    for (let y = 0; y < h; y++) {
      state.cellRects[y] = [];
      for (let x = 0; x < w; x++) {
        state.cellRects[y][x] = { x: x * cw, y: y * ch, w: cw, h: ch };
        state.grid[y][x].rect = state.cellRects[y][x];
      }
    }
  }
  /** Attempt to move player by dx,dy. */
  function moveBy(dx, dy) {
    if (state.player.target || state.paused) return;
    const dir = dx === 0 && dy === -1 ? 'N' : dx === 1 ? 'E' : dy === 1 ? 'S' : 'W';
    const cell = state.grid[state.player.y][state.player.x];
    if (cell.walls[dir]) return;
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    state.player.target = { x: nx, y: ny };
    state.player.moveStart = performance.now();
    state.steps++;
    updateHUD();
  }
  function checkWin() {
    if (state.player.x === state.exit.x && state.player.y === state.exit.y) {
      state.paused = true;
      const time = state.elapsed;
      const bestKey = `maze_best_${state.difficulty}`;
      if (!state.bestTimes[state.difficulty] || time < state.bestTimes[state.difficulty]) {
        state.bestTimes[state.difficulty] = time;
        localStorage.setItem(bestKey, String(time));
      }
      state.totalWins++;
      localStorage.setItem('maze_total_wins', String(state.totalWins));
      winModal.stats.textContent = `Time: ${formatTime(time)}, Steps: ${state.steps}`;
      winModal.panel.classList.remove('hidden');
    }
  }
  function update(t) {
    if (!state.paused) {
      state.elapsed = t - state.startTime;
      if (state.player.target) {
        const prog = (t - state.player.moveStart) / state.player.moveDur;
        if (prog >= 1) {
          state.player.x = state.player.target.x;
          state.player.y = state.player.target.y;
          state.player.target = null;
          reveal(state.player.x, state.player.y);
          checkWin();
        } else {
          state.player.px = state.player.x + (state.player.target.x - state.player.x) * prog;
          state.player.py = state.player.y + (state.player.target.y - state.player.y) * prog;
        }
      }
      updateHUD();
    }
  }
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    const w = state.grid[0].length, h = state.grid.length;
    // draw cells
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rect = state.cellRects[y][x];
        ctx.fillStyle = '#fff';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
    // start and exit
    const startRect = state.cellRects[state.start.y][state.start.x];
    ctx.fillStyle = 'green';
    ctx.fillRect(startRect.x, startRect.y, startRect.w, startRect.h);
    const exitRect = state.cellRects[state.exit.y][state.exit.x];
    ctx.fillStyle = 'gold';
    ctx.fillRect(exitRect.x, exitRect.y, exitRect.w, exitRect.h);
    // fog-of-war
    if (state.fog) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!state.revealed[y][x]) {
            const r = state.cellRects[y][x];
            ctx.fillRect(r.x, r.y, r.w, r.h);
          }
        }
      }
    }
    // walls
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = state.grid[y][x];
        const r = state.cellRects[y][x];
        if (c.walls.N) { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.stroke(); }
        if (c.walls.E) { ctx.beginPath(); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.stroke(); }
        if (c.walls.S) { ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.stroke(); }
        if (c.walls.W) { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke(); }
      }
    }
    // hint path
    if (state.hint) {
      ctx.strokeStyle = `rgba(0,0,255,${0.5 + 0.5 * Math.sin(performance.now() / 200)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      const first = state.hint[0];
      ctx.moveTo(state.cellRects[first.y][first.x].x + state.cellRects[first.y][first.x].w / 2,
        state.cellRects[first.y][first.x].y + state.cellRects[first.y][first.x].h / 2);
      for (let i = 1; i < state.hint.length; i++) {
        const c = state.hint[i];
        const rc = state.cellRects[c.y][c.x];
        ctx.lineTo(rc.x + rc.w / 2, rc.y + rc.h / 2);
      }
      ctx.stroke();
    }
    // player
    const pr = state.player.target ? { x: state.player.px, y: state.player.py } : { x: state.player.x, y: state.player.y };
    const cellR = state.cellRects[Math.floor(pr.y)][Math.floor(pr.x)];
    const cx = cellR.x + cellR.w / 2;
    const cy = cellR.y + cellR.h / 2;
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(cellR.w, cellR.h) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function loop(t) {
    update(t);
    render();
    requestAnimationFrame(loop);
  }
  function newGame(seed, diff) {
    state.difficulty = diff;
    state.seed = seed || randomSeed();
    controls.diff.value = diff;
    controls.seed.value = state.seed;
    settings.diff.value = diff;
    settings.seed.value = state.seed;
    const cfg = DIFFICULTY[diff];
    state.rng = createRNG(state.seed);
    state.grid = generateMaze(cfg.w, cfg.h, cfg.bias, state.rng);
    selfCheck(state.grid);
    state.start = { x: 0, y: 0 };
    state.exit = { x: cfg.w - 1, y: cfg.h - 1 };
    state.player = { x: 0, y: 0, px: 0, py: 0, target: null, moveStart: 0, moveDur: 120 };
    state.revealed = Array.from({ length: cfg.h }, () => Array(cfg.w).fill(false));
    reveal(0, 0);
    state.hint = null;
    state.paused = false;
    state.startTime = performance.now();
    state.elapsed = 0;
    state.steps = 0;
    computeRects();
    updateHUD();
  }
  function nextLevel() {
    state.level++;
    const nextDiff = incrementDifficulty(state.difficulty);
    newGame(randomSeed(), nextDiff);
  }
  function incrementDifficulty(diff) {
    return diff === 'easy' ? 'medium' : diff === 'medium' ? 'hard' : 'hard';
  }
  function bindUI() {
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      if (key === 'arrowup' || key === 'w') { moveBy(0, -1); }
      else if (key === 'arrowdown' || key === 's') { moveBy(0, 1); }
      else if (key === 'arrowleft' || key === 'a') { moveBy(-1, 0); }
      else if (key === 'arrowright' || key === 'd') { moveBy(1, 0); }
      else if (key === 'r') { newGame(state.seed, state.difficulty); }
      else if (key === 'p') { togglePause(); }
      else if (key === 'm') { /* sound stub */ }
    });
    controls.newMaze.addEventListener('click', () => newGame(controls.seed.value.trim() || randomSeed(), controls.diff.value));
    controls.next.addEventListener('click', nextLevel);
    controls.hint.addEventListener('click', () => { if (!state.player.target) state.hint = findPath(); });
    controls.pause.addEventListener('click', togglePause);
    controls.reset.addEventListener('click', () => { localStorage.clear(); loadPrefs(); updateHUD(); });
    controls.settings.addEventListener('click', () => { settings.panel.classList.remove('hidden'); });
    settings.close.addEventListener('click', () => { settings.panel.classList.add('hidden'); applySettings(); });
    settings.fog.addEventListener('change', () => { state.fog = settings.fog.checked; savePrefs(); });
    for (const btn of controls.dpad.querySelectorAll('button')) {
      btn.addEventListener('touchstart', e => { e.preventDefault(); handleDpad(btn.dataset.dir); });
      btn.addEventListener('mousedown', e => { e.preventDefault(); handleDpad(btn.dataset.dir); });
    }
    winModal.next.addEventListener('click', () => { winModal.panel.classList.add('hidden'); nextLevel(); });
    winModal.newMaze.addEventListener('click', () => { winModal.panel.classList.add('hidden'); newGame(randomSeed(), state.difficulty); });
    winModal.close.addEventListener('click', () => winModal.panel.classList.add('hidden'));
  }
  function handleDpad(dir) {
    if (dir === 'up') moveBy(0, -1);
    if (dir === 'down') moveBy(0, 1);
    if (dir === 'left') moveBy(-1, 0);
    if (dir === 'right') moveBy(1, 0);
  }
  function togglePause() {
    state.paused = !state.paused;
    controls.pause.textContent = state.paused ? 'Resume' : 'Pause';
    if (!state.paused) state.startTime = performance.now() - state.elapsed;
  }
  function applySettings() {
    newGame(settings.seed.value.trim() || randomSeed(), settings.diff.value);
    state.fog = settings.fog.checked;
    savePrefs();
  }
  function savePrefs() {
    localStorage.setItem('maze_pref_difficulty', state.difficulty);
    localStorage.setItem('maze_pref_fog', state.fog ? '1' : '0');
  }
  function loadPrefs() {
    const diff = localStorage.getItem('maze_pref_difficulty');
    const fog = localStorage.getItem('maze_pref_fog');
    if (diff && DIFFICULTY[diff]) state.difficulty = diff;
    state.fog = fog === '1';
    settings.fog.checked = state.fog;
    const bestE = localStorage.getItem('maze_best_easy');
    const bestM = localStorage.getItem('maze_best_medium');
    const bestH = localStorage.getItem('maze_best_hard');
    if (bestE) state.bestTimes.easy = Number(bestE);
    if (bestM) state.bestTimes.medium = Number(bestM);
    if (bestH) state.bestTimes.hard = Number(bestH);
    const wins = localStorage.getItem('maze_total_wins');
    if (wins) state.totalWins = Number(wins);
  }
  window.__debug = {
    regen: (seed, diff) => newGame(seed, diff || state.difficulty),
    solvePath: () => findPath().map(c => ({ x: c.x, y: c.y })),
    getState: () => ({ level: state.level, difficulty: state.difficulty, seed: state.seed, player: { x: state.player.x, y: state.player.y } })
  };
  window.addEventListener('load', () => {
    loadPrefs();
    bindUI();
    resize();
    newGame(randomSeed(), state.difficulty);
    requestAnimationFrame(loop);
  });
})();
