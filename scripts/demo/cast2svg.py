"""Renders an asciinema v2 cast into an animated SVG (standard library only).

A small terminal emulator replays the recording (cursor movement, line and
screen erase, colours); every distinct screen becomes a frame, and the frames
are stacked into one strip that CSS moves with step timing.
"""
import html, json, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]
STILL = float(sys.argv[3]) if len(sys.argv) > 3 else None   # render one moment (seconds)

lines = open(SRC, encoding='utf-8').read().splitlines()
header = json.loads(lines[0])
W, H = header['width'], header['height']
events = [json.loads(line) for line in lines[1:] if line.strip()]

PALETTE = {
    30: '#3b3f4b', 31: '#ff6b6b', 32: '#7ee787', 33: '#f2cc60', 34: '#79c0ff', 35: '#d2a8ff', 36: '#56d4dd', 37: '#e6edf3',
    90: '#8b949e', 91: '#ff7b72', 92: '#a5f3a0', 93: '#ffdf5d', 94: '#a5d6ff', 95: '#e2c5ff', 96: '#b3f0ff', 97: '#ffffff',
}
FG = '#e6edf3'
DIM = '#8b949e'


class Screen:
    def __init__(self):
        self.rows = [[(' ', None)] * W for _ in range(H)]
        self.x = self.y = 0
        self.style = (None, False, False)  # colour, bold, dim

    def scroll(self):
        self.rows.pop(0)
        self.rows.append([(' ', None)] * W)

    def newline(self):
        if self.y == H - 1:
            self.scroll()
        else:
            self.y += 1

    def put(self, ch):
        if self.x >= W:
            self.x = 0
            self.newline()
        self.rows[self.y][self.x] = (ch, self.style)
        self.x += 1

    def sgr(self, params):
        colour, bold, dim = self.style
        codes = [int(p) if p else 0 for p in params.split(';')] if params else [0]
        i = 0
        while i < len(codes):
            c = codes[i]
            if c == 0:
                colour, bold, dim = None, False, False
            elif c == 1:
                bold = True
            elif c == 2:
                dim = True
            elif c == 22:
                bold = dim = False
            elif c in PALETTE:
                colour = c
            elif c == 39:
                colour = None
            elif c in (38, 48):        # 256-colour / truecolour: skip arguments
                i += 2 if i + 1 < len(codes) and codes[i + 1] == 5 else 4
            i += 1
        self.style = (colour, bold, dim)

    def feed(self, data):
        i = 0
        while i < len(data):
            ch = data[i]
            if ch == '\x1b':
                m = re.match(r'\x1b\[([?0-9;]*)([A-Za-z@])', data[i:])
                if not m:
                    m2 = re.match(r'\x1b[()][0-9A-B]|\x1b[=>78]', data[i:])
                    i += len(m2.group(0)) if m2 else 1
                    continue
                params, cmd = m.group(1), m.group(2)
                n = int(params) if params.isdigit() else 1
                if cmd == 'm':
                    self.sgr(params)
                elif cmd == 'A':
                    self.y = max(0, self.y - n)
                elif cmd == 'B':
                    self.y = min(H - 1, self.y + n)
                elif cmd == 'C':
                    self.x = min(W - 1, self.x + n)
                elif cmd == 'D':
                    self.x = max(0, self.x - n)
                elif cmd == 'F':
                    self.y, self.x = max(0, self.y - n), 0
                elif cmd == 'E':
                    self.y, self.x = min(H - 1, self.y + n), 0
                elif cmd == 'G':
                    self.x = min(W - 1, n - 1)
                elif cmd == 'H':
                    parts = (params.split(';') + ['1', '1'])[:2]
                    self.y = min(H - 1, max(0, int(parts[0] or 1) - 1))
                    self.x = min(W - 1, max(0, int(parts[1] or 1) - 1))
                elif cmd == 'K':
                    mode = int(params) if params.isdigit() else 0
                    row = self.rows[self.y]
                    rng = range(self.x, W) if mode == 0 else range(0, self.x + 1) if mode == 1 else range(W)
                    for x in rng:
                        row[x] = (' ', None)
                elif cmd == 'J':
                    mode = int(params) if params.isdigit() else 0
                    if mode == 2:
                        self.rows = [[(' ', None)] * W for _ in range(H)]
                    elif mode == 0:
                        for x in range(self.x, W):
                            self.rows[self.y][x] = (' ', None)
                        for y in range(self.y + 1, H):
                            self.rows[y] = [(' ', None)] * W
                i += len(m.group(0))
                continue
            if ch == '\r':
                self.x = 0
            elif ch == '\n':
                self.newline()
            elif ch == '\b':
                self.x = max(0, self.x - 1)
            elif ch == '\x07' or ord(ch) < 32:
                pass
            else:
                self.put(ch)
            i += 1

    def snapshot(self):
        return tuple(tuple(row) for row in self.rows)


# Replay and collect frames (time, screen).
screen, frames = Screen(), []
for t, kind, data in events:
    if kind != 'o':
        continue
    screen.feed(data)
    snap = screen.snapshot()
    if STILL is not None and t > STILL:
        break
    if frames and frames[-1][1] == snap:
        continue
    if frames and t - frames[-1][0] < 0.12:   # merge bursts (typing, spinners) into one frame
        frames[-1] = (frames[-1][0], snap)
    else:
        frames.append((t, snap))
if STILL is not None:
    frames = [(0, frames[-1][1])]

END_HOLD = 4.0
total = (frames[-1][0] + END_HOLD) if STILL is None else 1

CW, LH, PAD, BAR = 8.4, 18, 18, 30
width = W * CW + 2 * PAD
height = H * LH + 2 * PAD + BAR


def render_rows(snap):
    out = []
    for y, row in enumerate(snap):
        spans, cur, buf = [], None, ''
        for ch, style in row:
            if style != cur and buf:
                spans.append((buf, cur))
                buf = ''
            cur = style
            buf += ch
        if buf:
            spans.append((buf, cur))
        text = ''.join(s for s, _ in spans).rstrip()
        if not text:
            continue
        parts, used = [], 0
        for s, style in spans:
            if used >= len(text):
                break
            s = s[: len(text) - used]
            used += len(s)
            colour, bold, dim = style if style else (None, False, False)
            fill = PALETTE.get(colour, DIM if dim else FG)
            attrs = f' fill="{fill}"' + (' font-weight="bold"' if bold else '')
            parts.append(f'<tspan{attrs}>{html.escape(s)}</tspan>')
        out.append(f'<text x="0" y="{(y + 1) * LH - 5}" xml:space="preserve">{"".join(parts)}</text>')
    return ''.join(out)


strip = []
stops = []
for i, (t, snap) in enumerate(frames):
    strip.append(f'<g transform="translate(0,{i * H * LH})">{render_rows(snap)}</g>')
    stops.append(f'{t / total * 100:.4f}%{{transform:translateY(-{i * H * LH}px)}}')

anim = ''
if len(frames) > 1:
    anim = f"""<style>
.strip{{animation:play {total:.2f}s step-end infinite}}
@keyframes play{{{''.join(stops)}100%{{transform:translateY(-{(len(frames) - 1) * H * LH}px)}}}}
</style>"""

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}" font-family="Menlo, Monaco, Consolas, 'DejaVu Sans Mono', monospace" font-size="14">
{anim}
<rect width="100%" height="100%" rx="8" fill="#0d1117"/>
<circle cx="20" cy="16" r="6" fill="#ff5f56"/><circle cx="40" cy="16" r="6" fill="#ffbd2e"/><circle cx="60" cy="16" r="6" fill="#27c93f"/>
<svg x="{PAD}" y="{BAR + PAD - 6}" width="{W * CW:.0f}" height="{H * LH}" viewBox="0 0 {W * CW:.0f} {H * LH}">
<g class="strip">{''.join(strip)}</g>
</svg>
</svg>
"""
open(OUT, 'w', encoding='utf-8').write(svg)
print(f'{len(frames)} frames, {total:.1f}s, {len(svg) / 1024:.0f} KB -> {OUT}')
