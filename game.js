// Snake - JavaScript version of the Python/pygame game.
// Controls: Arrows / WASD to move, P or Esc to pause, Enter to play.
// On phones: swipe to move, tap the top bar to pause.

// ---------------------------------------------------------------- settings
const CELL = 28;              // size of one square in pixels
const COLS = 20;              // board size in squares
const ROWS = 20;
const TOP_BAR = 60;           // height of the score bar
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL + TOP_BAR;

const SPEEDS = { Easy: 7, Normal: 10, Hard: 14 };   // snake moves per second
const DIFFICULTIES = Object.keys(SPEEDS);           // ["Easy", "Normal", "Hard"]

const COLORS = {
  boardLight: "rgb(170, 215, 81)",
  boardDark: "rgb(162, 209, 73)",
  bar: "rgb(74, 117, 44)",
  panel: "rgb(52, 82, 32)",
  button: "rgb(74, 117, 44)",
  buttonHover: "rgb(100, 155, 60)",
  snakeHead: "rgb(58, 92, 200)",
  snakeBody: "rgb(78, 124, 246)",
  apple: "rgb(231, 71, 29)",
  appleShine: "rgb(255, 150, 120)",
  leaf: "rgb(60, 140, 50)",
  stem: "rgb(90, 60, 30)",
  gold: "rgb(255, 214, 90)",
  white: "rgb(255, 255, 255)",
  softWhite: "rgb(220, 235, 200)",
  dark: "rgb(30, 40, 30)",
};

const FONT_FAMILY = "Arial, Helvetica, sans-serif";
const FONTS = {
  title: `bold 72px ${FONT_FAMILY}`,
  big: `bold 46px ${FONT_FAMILY}`,
  mid: `bold 28px ${FONT_FAMILY}`,
  small: `20px ${FONT_FAMILY}`,
};

// key -> direction [x, y]. event.code is the physical key, so WASD works on any keyboard layout
const DIRECTIONS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;   // phone or tablet

// ---------------------------------------------------------------- high score
// websites can't write files, so the scores are kept in the browser's localStorage
const STORAGE_KEY = "snake_highscores";

function loadHighScores() {
  const scores = { Easy: 0, Normal: 0, Hard: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    for (const name of DIFFICULTIES) {
      scores[name] = Number(data?.[name]) || 0;
    }
  } catch (error) {
    // no saved scores yet, or storage is blocked - start from zero
  }
  return scores;
}

function saveHighScores(scores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch (error) {
    // if saving fails, the game still works
  }
}

// ---------------------------------------------------------------- drawing helpers
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawText(ctx, text, x, y, font, color, align = "center", shadow = false) {
  ctx.font = font;
  ctx.textAlign = align;          // "center", "left" or "right"
  ctx.textBaseline = "middle";    // y is the middle of the text
  if (shadow) {
    ctx.fillStyle = COLORS.dark;
    ctx.fillText(text, x + 3, y + 3);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function samePosition(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

// ---------------------------------------------------------------- button
class Button {
  constructor(text, centerX, centerY, width = 240, height = 50) {
    this.text = text;
    this.x = centerX - width / 2;
    this.y = centerY - height / 2;
    this.width = width;
    this.height = height;
  }

  contains(px, py) {
    return px >= this.x && px <= this.x + this.width &&
           py >= this.y && py <= this.y + this.height;
  }

  draw(ctx, mouse) {
    const color = this.contains(mouse.x, mouse.y) ? COLORS.buttonHover : COLORS.button;
    fillRoundRect(ctx, this.x, this.y + 4, this.width, this.height, 12, COLORS.dark);  // shadow
    fillRoundRect(ctx, this.x, this.y, this.width, this.height, 12, color);
    drawText(ctx, this.text, this.x + this.width / 2, this.y + this.height / 2, FONTS.mid, COLORS.white);
  }
}

// ---------------------------------------------------------------- game
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // draw at the screen's real pixel density, so it stays sharp on phones and retina screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    this.ctx.scale(dpr, dpr);

    this.board = this.makeBoard();
    this.highScores = loadHighScores();
    this.difficulty = "Normal";
    this.state = "menu";          // "menu", "playing", "paused", "game_over"
    this.mouse = { x: -1, y: -1 };
    this.swipeStart = null;

    const cx = WIDTH / 2;
    this.menuButtons = {
      difficulty: new Button("", cx, 340, 280),
      play: new Button("Play", cx, 410, 280),
    };
    this.pauseButtons = {
      resume: new Button("Resume", cx, HEIGHT / 2 + 10),
      menu: new Button("Main menu", cx, HEIGHT / 2 + 75),
    };
    this.overButtons = {
      again: new Button("Play again", cx, 380),
      menu: new Button("Main menu", cx, 445),
    };

    this.newGame();
    this.addListeners();

    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  // ---------- setup
  makeBoard() {
    // draw the checkered board once and reuse it every frame
    const board = document.createElement("canvas");
    board.width = WIDTH;
    board.height = ROWS * CELL;
    const ctx = board.getContext("2d");
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.boardLight : COLORS.boardDark;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    return board;
  }

  newGame() {
    const midX = Math.floor(COLS / 2);
    const midY = Math.floor(ROWS / 2);
    this.snake = [[midX, midY], [midX - 1, midY], [midX - 2, midY]];   // head first
    this.direction = [1, 0];
    this.nextDirs = [];           // queued turns, so fast key presses aren't lost
    this.score = 0;
    this.newRecord = false;
    this.moveTimer = 0;
    this.spawnApple();
  }

  start() {
    this.newGame();
    this.state = "playing";
  }

  goToMenu() {
    this.newGame();
    this.state = "menu";
  }

  spawnApple() {
    const taken = new Set(this.snake.map(([x, y]) => `${x},${y}`));
    const free = [];
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!taken.has(`${x},${y}`)) free.push([x, y]);
      }
    }
    // null = the board is full
    this.apple = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : null;
  }

  changeDifficulty(step) {
    const i = DIFFICULTIES.indexOf(this.difficulty);
    const n = DIFFICULTIES.length;
    this.difficulty = DIFFICULTIES[(i + step + n) % n];
  }

  // ---------- game logic
  queueTurn(newDir) {
    const last = this.nextDirs.length > 0 ? this.nextDirs[this.nextDirs.length - 1] : this.direction;
    const isReverse = newDir[0] === -last[0] && newDir[1] === -last[1];
    if (!samePosition(newDir, last) && !isReverse && this.nextDirs.length < 2) {
      this.nextDirs.push(newDir);
    }
  }

  step() {
    if (this.nextDirs.length > 0) {
      this.direction = this.nextDirs.shift();
    }

    const [headX, headY] = this.snake[0];
    const [dx, dy] = this.direction;
    const newHead = [headX + dx, headY + dy];

    const eating = this.apple !== null && samePosition(newHead, this.apple);
    // the tail moves away this turn, so the snake can step where it was (unless it grows)
    const body = eating ? this.snake : this.snake.slice(0, -1);
    const hitWall = newHead[0] < 0 || newHead[0] >= COLS || newHead[1] < 0 || newHead[1] >= ROWS;
    if (hitWall || body.some((part) => samePosition(part, newHead))) {
      this.endGame();
      return;
    }

    this.snake.unshift(newHead);          // add new head at the front
    if (eating) {
      this.score += 1;
      this.spawnApple();
      if (this.apple === null) {          // snake fills the whole board - you win
        this.endGame();
      }
    } else {
      this.snake.pop();                   // remove the tail
    }
  }

  endGame() {
    if (this.score > this.highScores[this.difficulty]) {
      this.highScores[this.difficulty] = this.score;
      saveHighScores(this.highScores);
      this.newRecord = true;
    }
    this.state = "game_over";
  }

  // ---------- input
  addListeners() {
    window.addEventListener("keydown", (event) => this.onKey(event));

    this.canvas.addEventListener("pointermove", (event) => {
      this.mouse = this.toGamePosition(event);
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.mouse = { x: -1, y: -1 };
    });
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));

    // pause when the player switches tabs or clicks outside the game
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener("blur", () => this.pause());
  }

  pause() {
    if (this.state === "playing") this.state = "paused";
  }

  toGamePosition(event) {
    // the canvas can be shown smaller or bigger than 560x620, so convert to game coordinates
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (WIDTH / rect.width),
      y: (event.clientY - rect.top) * (HEIGHT / rect.height),
    };
  }

  onKey(event) {
    const key = event.code;
    // stop arrows and space from scrolling the page while playing
    if (key.startsWith("Arrow") || key === "Space") event.preventDefault();

    const isEnter = key === "Enter" || key === "NumpadEnter" || key === "Space";

    if (this.state === "menu") {
      if (isEnter) this.start();
      else if (key === "ArrowRight" || key === "KeyD") this.changeDifficulty(1);
      else if (key === "ArrowLeft" || key === "KeyA") this.changeDifficulty(-1);

    } else if (this.state === "playing") {
      if (key in DIRECTIONS) this.queueTurn(DIRECTIONS[key]);
      else if (key === "KeyP" || key === "Escape") this.state = "paused";

    } else if (this.state === "paused") {
      if (key === "KeyP" || key === "Escape" || key === "Space") this.state = "playing";

    } else if (this.state === "game_over") {
      if (isEnter) this.start();
      else if (key === "Escape") this.goToMenu();
    }
  }

  onPointerDown(event) {
    const { x, y } = this.toGamePosition(event);
    this.mouse = { x, y };

    if (this.state === "menu") {
      if (this.menuButtons.play.contains(x, y)) this.start();
      else if (this.menuButtons.difficulty.contains(x, y)) this.changeDifficulty(1);

    } else if (this.state === "playing") {
      if (y < TOP_BAR) this.state = "paused";       // tap the top bar to pause
      else this.swipeStart = { x, y };              // maybe the start of a swipe

    } else if (this.state === "paused") {
      if (this.pauseButtons.resume.contains(x, y)) this.state = "playing";
      else if (this.pauseButtons.menu.contains(x, y)) this.goToMenu();

    } else if (this.state === "game_over") {
      if (this.overButtons.again.contains(x, y)) this.start();
      else if (this.overButtons.menu.contains(x, y)) this.goToMenu();
    }
  }

  onPointerUp(event) {
    if (!this.swipeStart || this.state !== "playing") return;
    const { x, y } = this.toGamePosition(event);
    const dx = x - this.swipeStart.x;
    const dy = y - this.swipeStart.y;
    this.swipeStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;   // too short - just a tap
    if (Math.abs(dx) > Math.abs(dy)) {
      this.queueTurn(dx > 0 ? [1, 0] : [-1, 0]);
    } else {
      this.queueTurn(dy > 0 ? [0, 1] : [0, -1]);
    }
  }

  // ---------- drawing
  cellRect(x, y) {
    return { x: x * CELL, y: TOP_BAR + y * CELL, w: CELL, h: CELL };
  }

  drawApple(cx, cy, radius) {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.apple;                                         // apple
    ctx.beginPath();
    ctx.arc(cx, cy + 1, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.appleShine;                                    // shine
    ctx.beginPath();
    ctx.arc(cx - radius / 3, cy - radius / 3, Math.max(2, radius / 4), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.stem;                                        // stem
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius + 3);
    ctx.lineTo(cx + 2, cy - radius - 3);
    ctx.stroke();

    ctx.fillStyle = COLORS.leaf;                                          // leaf
    ctx.beginPath();
    ctx.ellipse(cx + 2 + radius / 2, cy - radius - 5 + (radius / 2 + 3) / 2,
                radius / 2, (radius / 2 + 3) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSnake() {
    const ctx = this.ctx;
    // each piece is a square shrunk by 2px on every side
    const rects = this.snake.map(([x, y]) => {
      const r = this.cellRect(x, y);
      return { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4, cx: r.x + CELL / 2, cy: r.y + CELL / 2 };
    });

    // fill the gaps between pieces so the body looks like one piece
    ctx.fillStyle = COLORS.snakeBody;
    for (let i = 0; i < rects.length - 1; i++) {
      const a = rects[i];
      const b = rects[i + 1];
      const w = Math.abs(a.cx - b.cx) || a.w;
      const h = Math.abs(a.cy - b.cy) || a.h;
      ctx.fillRect((a.cx + b.cx) / 2 - w / 2, (a.cy + b.cy) / 2 - h / 2, w, h);
    }

    // the pieces, from the tail to the head, so the head is on top
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      fillRoundRect(ctx, r.x, r.y, r.w, r.h, 9, i === 0 ? COLORS.snakeHead : COLORS.snakeBody);
    }

    // eyes, looking where the snake is going
    const { cx, cy } = rects[0];
    const [dx, dy] = this.direction;
    for (const side of [-1, 1]) {
      const ex = cx + dx * 4 - dy * side * 6;
      const ey = cy + dy * 4 + dx * side * 6;
      ctx.fillStyle = COLORS.white;
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.dark;
      ctx.beginPath();
      ctx.arc(ex + dx * 2, ey + dy * 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTopBar() {
    const ctx = this.ctx;
    const mid = TOP_BAR / 2;
    ctx.fillStyle = COLORS.bar;
    ctx.fillRect(0, 0, WIDTH, TOP_BAR);
    this.drawApple(30, mid, 12);
    drawText(ctx, String(this.score), 52, mid, FONTS.mid, COLORS.white, "left");
    drawText(ctx, this.difficulty, WIDTH / 2, mid, FONTS.small, COLORS.softWhite);
    drawText(ctx, `Best: ${this.highScores[this.difficulty]}`, WIDTH - 20, mid, FONTS.mid, COLORS.gold, "right");
  }

  drawOverlay(alpha = 150) {
    this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha / 255})`;
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  drawMenu() {
    const ctx = this.ctx;
    const cx = WIDTH / 2;
    this.drawOverlay(160);
    drawText(ctx, "SNAKE", cx, 150, FONTS.title, COLORS.boardLight, "center", true);
    drawText(ctx, "Eat apples. Don't hit the walls or yourself.", cx, 215, FONTS.small, COLORS.softWhite);
    drawText(ctx, `High score: ${this.highScores[this.difficulty]}`, cx, 265, FONTS.mid, COLORS.gold);

    this.menuButtons.difficulty.text = `<  ${this.difficulty}  >`;
    for (const button of Object.values(this.menuButtons)) {
      button.draw(ctx, this.mouse);
    }

    const hint = IS_TOUCH
      ? "Swipe to move   •   Tap the top bar to pause"
      : "Arrows / WASD to move   •   P to pause";
    drawText(ctx, hint, cx, HEIGHT - 35, FONTS.small, COLORS.softWhite);
  }

  drawPaused() {
    this.drawOverlay();
    drawText(this.ctx, "Paused", WIDTH / 2, HEIGHT / 2 - 60, FONTS.big, COLORS.white, "center", true);
    for (const button of Object.values(this.pauseButtons)) {
      button.draw(this.ctx, this.mouse);
    }
  }

  drawGameOver() {
    const ctx = this.ctx;
    const cx = WIDTH / 2;
    this.drawOverlay();

    const panel = { x: cx - 190, y: 310 - 180, w: 380, h: 360 };
    fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 20, COLORS.panel);
    roundRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 20);
    ctx.strokeStyle = COLORS.boardLight;
    ctx.lineWidth = 3;
    ctx.stroke();

    const title = this.apple === null ? "You win!" : "Game Over";
    drawText(ctx, title, cx, 180, FONTS.big, COLORS.white, "center", true);
    drawText(ctx, `Score: ${this.score}`, cx, 240, FONTS.mid, COLORS.white);
    drawText(ctx, `Best (${this.difficulty}): ${this.highScores[this.difficulty]}`, cx, 278, FONTS.small, COLORS.softWhite);
    if (this.newRecord) {
      drawText(ctx, "New high score!", cx, 318, FONTS.mid, COLORS.gold);
    }

    for (const button of Object.values(this.overButtons)) {
      button.draw(ctx, this.mouse);
    }
  }

  draw() {
    this.ctx.drawImage(this.board, 0, TOP_BAR);
    if (this.apple) {
      const r = this.cellRect(this.apple[0], this.apple[1]);
      this.drawApple(r.x + CELL / 2, r.y + CELL / 2, CELL / 2 - 4);
    }
    this.drawSnake();
    this.drawTopBar();

    if (this.state === "menu") this.drawMenu();
    else if (this.state === "paused") this.drawPaused();
    else if (this.state === "game_over") this.drawGameOver();
  }

  // ---------- main loop
  loop(time) {
    // milliseconds since the last frame (capped, so coming back to the tab doesn't jump)
    const dt = Math.min(time - this.lastTime, 100);
    this.lastTime = time;

    // move the snake at the chosen speed, independent of the screen's frame rate
    if (this.state === "playing") {
      this.moveTimer += dt;
      const interval = 1000 / SPEEDS[this.difficulty];
      while (this.moveTimer >= interval && this.state === "playing") {
        this.moveTimer -= interval;
        this.step();
      }
    }

    this.draw();
    requestAnimationFrame((t) => this.loop(t));   // ask the browser for the next frame
  }
}

// ---------------------------------------------------------------- start
if (window.self !== window.top) {
  document.body.classList.add("embedded");   // running inside an iframe
}
new Game(document.getElementById("game"));
