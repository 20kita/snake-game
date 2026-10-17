import asyncio
import json
import random
import sys
from pathlib import Path
import pygame as py

# ---------- settings
CELL = 28                 # size of one square in pixels
COLS, ROWS = 20, 20       # board size in squares
TOP_BAR = 60              # space for the score at the top
WIDTH = COLS * CELL
HEIGHT = ROWS * CELL + TOP_BAR
FPS = 60                  # frames per second
SPEEDS = {"Easy": 7, "Normal": 10, "Hard": 14}

# True when the game runs in a web browser (through pygbag)
WEB = sys.platform == "emscripten"

DIRECTIONS = {
    py.K_UP: (0, -1), py.K_w: (0, -1),
    py.K_DOWN: (0, 1), py.K_s: (0, 1),
    py.K_LEFT: (-1, 0), py.K_a: (-1, 0),
    py.K_RIGHT: (1, 0), py.K_d: (1, 0),
}
HIGHSCORE_FILE = Path(__file__).with_name("highscore.json")


def load_high_scores():
    """Read best scores (one per difficulty) from the file, or the browser's storage."""
    try:
        if WEB:
            import platform
            data = json.loads(platform.window.localStorage.getItem("snake_highscores"))
        else:
            data = json.loads(HIGHSCORE_FILE.read_text())
        return {name: int(data.get(name, 0)) for name in SPEEDS}
    except Exception:
        return {name: 0 for name in SPEEDS}


def save_high_scores(scores):
    try:
        if WEB:
            import platform
            platform.window.localStorage.setItem("snake_highscores", json.dumps(scores))
        else:
            HIGHSCORE_FILE.write_text(json.dumps(scores, indent=2))
    except Exception:
        pass  # if saving fails, the game still works

# ---------- colors (Red, Green, Blue - each 0 to 255)     # NEW
BOARD_LIGHT = (170, 215, 81)
BOARD_DARK = (162, 209, 73)
BAR = (74, 117, 44)
SNAKE_HEAD = (58, 92, 200)
SNAKE_BODY = (78, 124, 246)
APPLE = (231, 71, 29)
WHITE = (255, 255, 255)
DARK = (30, 40, 30)
PANEL = (52, 82, 32)
BUTTON = (74, 117, 44)
BUTTON_HOVER = (100, 155, 60)
SOFT_WHITE = (220, 235, 200)
GOLD = (255, 214, 90)
APPLE_SHINE = (255, 150, 120)
LEAF = (60, 140, 50)
STEM = (90, 60, 30)

class Button:
    def __init__(self, text, center, width=240, height=50):
        self.text = text
        self.rect = py.Rect(0, 0, width, height)
        self.rect.center = center

    def draw(self, surface, font):
        hovered = self.rect.collidepoint(py.mouse.get_pos())
        if hovered:
            color = BUTTON_HOVER
        else:
            color = BUTTON
        py.draw.rect(surface, DARK, self.rect.move(0, 4), border_radius=12)  # shadow
        py.draw.rect(surface, color, self.rect, border_radius=12)
        label = font.render(self.text, True, WHITE)
        surface.blit(label, label.get_rect(center=self.rect.center))

    def clicked(self, event):
        return (event.type == py.MOUSEBUTTONDOWN and event.button == 1
                and self.rect.collidepoint(event.pos))

class Game:
    def __init__(self):
        py.init()
        self.screen = py.display.set_mode((WIDTH, HEIGHT))
        py.display.set_caption("Snake")
        self.clock = py.time.Clock()
        self.font_title = py.font.SysFont("arial", 72, bold=True)
        self.font_big = py.font.SysFont("arial", 46, bold=True)
        self.font_mid = py.font.SysFont("arial", 28, bold=True)
        self.font_small = py.font.SysFont("arial", 20)
        self.board = self.make_board()
        self.high_scores = load_high_scores()
        self.difficulty = "Normal"
        self.state = "menu"
    
        cx = WIDTH // 2
        self.menu_buttons = {
            "difficulty": Button("", (cx, 340), width=280),
            "play": Button("Play", (cx, 410), width=280),
            "quit": Button("Quit", (cx, 480), width=280),
        }
        if WEB:
            del self.menu_buttons["quit"]   # a web page can't be "quit"
        self.pause_buttons = {
            "resume": Button("Resume", (cx, HEIGHT // 2 + 10)),
            "menu": Button("Main menu", (cx, HEIGHT // 2 + 75)),
        }
        self.over_buttons = {
            "again": Button("Play again", (cx, 380)),
            "menu": Button("Main menu", (cx, 445)),
        }
        self.new_game()

    def new_game(self):
        mid_x, mid_y = COLS // 2, ROWS // 2
        self.snake = [(mid_x, mid_y), (mid_x - 1, mid_y), (mid_x - 2, mid_y)]
        self.direction = (1, 0)
        self.move_timer = 0
        self.next_dirs = []
        self.score = 0
        self.spawn_apple()
        self.new_record = False

    def draw_apple(self, center, radius):
        cx, cy = center
        py.draw.circle(self.screen, APPLE, (cx, cy + 1), radius)                     # apple
        py.draw.circle(self.screen, APPLE_SHINE,
                       (cx - radius // 3, cy - radius // 3), max(2, radius // 4))     # shine
        py.draw.line(self.screen, STEM, (cx, cy - radius + 3), (cx + 2, cy - radius - 3), 3)  # stem
        py.draw.ellipse(self.screen, LEAF, (cx + 2, cy - radius - 5, radius, radius // 2 + 3))  # leaf

    def spawn_apple(self):
        taken = set(self.snake)
        free = [(x, y) for x in range(COLS) for y in range(ROWS) if (x, y) not in taken]
        if free:
            self.apple = random.choice(free)
        else:
            self.apple = None    # board is full

    def change_difficulty(self, step):
        names = list(SPEEDS)
        i = names.index(self.difficulty)
        self.difficulty = names[(i + step) % len(names)]

    def text(self, text, font, color, shadow=False, **position):
        """Draw text. position is e.g. center=(x, y) or midleft=(x, y)."""
        if shadow:
            surf = font.render(text, True, DARK)
            rect = surf.get_rect(**position)
            self.screen.blit(surf, rect.move(3, 3))
        surf = font.render(text, True, color)
        self.screen.blit(surf, surf.get_rect(**position))

    def draw_top_bar(self):
        py.draw.rect(self.screen, BAR, (0, 0, WIDTH, TOP_BAR))
        self.draw_apple((30, TOP_BAR // 2), 12)
        self.text(str(self.score), self.font_mid, WHITE, midleft=(52, TOP_BAR // 2))
        self.text(self.difficulty, self.font_small, SOFT_WHITE, center=(WIDTH // 2, TOP_BAR // 2))
        self.text(f"Best: {self.high_scores[self.difficulty]}", self.font_mid, GOLD, midright=(WIDTH - 20, TOP_BAR // 2))

    def draw_overlay(self, alpha=150):
        shade = py.Surface((WIDTH, HEIGHT), py.SRCALPHA)
        shade.fill((0, 0, 0, alpha))
        self.screen.blit(shade, (0, 0))

    def draw_menu(self):
        self.draw_overlay(160)
        cx = WIDTH // 2
        self.text("SNAKE", self.font_title, BOARD_LIGHT, shadow=True, center=(cx, 150))
        self.text("Eat apples. Don't hit the walls or yourself.", self.font_small, SOFT_WHITE,
                  center=(cx, 215))
        self.text(f"High score: {self.high_scores[self.difficulty]}", self.font_mid, GOLD,
                  center=(cx, 265))

        self.menu_buttons["difficulty"].text = f"<  {self.difficulty}  >"
        for button in self.menu_buttons.values():
            button.draw(self.screen, self.font_mid)

        self.text("Arrows / WASD to move   •   P to pause", self.font_small, SOFT_WHITE,
                  center=(cx, HEIGHT - 35))

    def draw_paused(self):
        self.draw_overlay()
        self.text("Paused", self.font_big, WHITE, shadow=True, center=(WIDTH // 2, HEIGHT // 2 - 60))
        for button in self.pause_buttons.values():
            button.draw(self.screen, self.font_mid)

    def draw_game_over(self):
        self.draw_overlay()
        cx = WIDTH // 2
        panel = py.Rect(0, 0, 380, 360)
        panel.center = (cx, 310)
        py.draw.rect(self.screen, PANEL, panel, border_radius=20)
        py.draw.rect(self.screen, BOARD_LIGHT, panel, width=3, border_radius=20)

        if self.apple is None:
            title = "You win!"
        else:
            title = "Game Over"
        self.text(title, self.font_big, WHITE, shadow=True, center=(cx, 180))
        self.text(f"Score: {self.score}", self.font_mid, WHITE, center=(cx, 240))

        for button in self.over_buttons.values():
            button.draw(self.screen, self.font_mid)
        
        self.text(f"Best ({self.difficulty}): {self.high_scores[self.difficulty]}",
                  self.font_small, SOFT_WHITE, center=(cx, 278))
        if self.new_record:
            self.text("New high score!", self.font_mid, GOLD, center=(cx, 318))

    def queue_turn(self, new_dir):
        if self.next_dirs:
            last = self.next_dirs[-1]
        else:
            last = self.direction
        is_reverse = new_dir == (-last[0], -last[1])
        if new_dir != last and not is_reverse and len(self.next_dirs) < 2:
            self.next_dirs.append(new_dir)

    def cell_rect(self, x, y):
        return py.Rect(x * CELL, TOP_BAR + y * CELL, CELL, CELL)
    
    def step(self):
        if self.next_dirs:
            self.direction = self.next_dirs.pop(0)

        head_x, head_y = self.snake[0]
        dx, dy = self.direction
        new_head = (head_x + dx, head_y + dy)

        eating = new_head == self.apple
        # the tail moves away this turn, so the snake can step where it was (unless it grows)
        if eating:
            body = self.snake
        else:
            body = self.snake[:-1]
        hit_wall = not (0 <= new_head[0] < COLS and 0 <= new_head[1] < ROWS)
        if hit_wall or new_head in body:
            self.end_game()
            return

        self.snake.insert(0, new_head)
        if eating:
            self.score += 1
            self.spawn_apple()
            if self.apple is None:   # snake fills the whole board - you win
                self.end_game()
        else:
            self.snake.pop()

    def start(self):
        self.new_game()
        self.state = "playing"

    def end_game(self):
        if self.score > self.high_scores[self.difficulty]:
            self.high_scores[self.difficulty] = self.score
            save_high_scores(self.high_scores)
            self.new_record = True
        self.state = "game_over"

    def is_key(self, event, *keys):
        return event.type == py.KEYDOWN and event.key in keys

    def handle_event(self, event):
        if self.state == "menu":
            b = self.menu_buttons
            if b["play"].clicked(event) or self.is_key(event, py.K_RETURN, py.K_SPACE):
                self.start()
            elif b["difficulty"].clicked(event) or self.is_key(event, py.K_RIGHT, py.K_d):
                self.change_difficulty(1)
            elif self.is_key(event, py.K_LEFT, py.K_a):
                self.change_difficulty(-1)
            elif not WEB and (b["quit"].clicked(event) or self.is_key(event, py.K_ESCAPE)):
                self.quit()

        elif self.state == "playing":
            if event.type == py.KEYDOWN and event.key in DIRECTIONS:
                self.queue_turn(DIRECTIONS[event.key])
            elif self.is_key(event, py.K_p, py.K_ESCAPE):
                self.state = "paused"

        elif self.state == "paused":
            b = self.pause_buttons
            if b["resume"].clicked(event) or self.is_key(event, py.K_p, py.K_ESCAPE, py.K_SPACE):
                self.state = "playing"
            elif b["menu"].clicked(event):
                self.new_game()
                self.state = "menu"

        elif self.state == "game_over":
            b = self.over_buttons
            if b["again"].clicked(event) or self.is_key(event, py.K_RETURN, py.K_SPACE):
                self.start()
            elif b["menu"].clicked(event) or self.is_key(event, py.K_ESCAPE):
                self.new_game()
                self.state = "menu"

    

    def draw_snake(self):
        rects = [self.cell_rect(x, y).inflate(-4, -4) for x, y in self.snake]

        # fill the gaps between segments so the body looks like one piece
        for a, b in zip(rects, rects[1:]):
            w = abs(a.centerx - b.centerx) or a.width
            h = abs(a.centery - b.centery) or a.height
            bridge = py.Rect(0, 0, w, h)
            bridge.center = ((a.centerx + b.centerx) // 2, (a.centery + b.centery) // 2)
            py.draw.rect(self.screen, SNAKE_BODY, bridge)

        # the pieces, from the tail to the head, so the head is on top
        for i, rect in reversed(list(enumerate(rects))):
            if i == 0:
                color = SNAKE_HEAD
            else:
                color = SNAKE_BODY
            py.draw.rect(self.screen, color, rect, border_radius=9)

        # eyes, looking where the snake is going
        cx, cy = rects[0].center
        dx, dy = self.direction
        for side in (-1, 1):
            ex = cx + dx * 4 - dy * side * 6
            ey = cy + dy * 4 + dx * side * 6
            py.draw.circle(self.screen, WHITE, (ex, ey), 5)
            py.draw.circle(self.screen, DARK, (ex + dx * 2, ey + dy * 2), 2)

    def make_board(self):
        board = py.Surface((WIDTH, ROWS * CELL))
        for y in range (ROWS):
            for x in range(COLS):
                if (x + y) % 2 == 0:
                    color = BOARD_LIGHT
                else:
                    color = BOARD_DARK
                py.draw.rect(board, color, (x * CELL, y * CELL, CELL, CELL))
        return board

    def draw(self):
        self.screen.blit(self.board, (0, TOP_BAR))
        if self.apple:
            self.draw_apple(self.cell_rect(*self.apple).center, CELL // 2 - 4)
        self.draw_snake()
        self.draw_top_bar()

        if self.state == "menu":
            self.draw_menu()
        elif self.state == "paused":
            self.draw_paused()
        elif self.state == "game_over":
            self.draw_game_over()

    async def run(self):
        while True:
            dt = self.clock.tick(FPS)

            for event in py.event.get():
                if event.type == py.QUIT:
                    self.quit()
                self.handle_event(event)

            if self.state == "playing":
                self.move_timer += dt
                if self.move_timer >= 1000 / SPEEDS[self.difficulty]:
                    self.move_timer = 0
                    self.step()

            self.draw()
            py.display.flip()
            await asyncio.sleep(0)   # lets the browser update the page
    
    def quit(self):
        py.quit()
        sys.exit()

if __name__ == "__main__":
    asyncio.run(Game().run())