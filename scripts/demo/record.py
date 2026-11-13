"""Records a real terminal session into an asciinema v2 cast.

A bash shell runs in a pseudo-terminal. The script types commands character
by character and answers prompts with real keystrokes; everything the
terminal prints is recorded with its real timing. Long pauses (npm install,
server start) are shortened afterwards; the output itself is untouched.
"""
import fcntl, json, os, pty, re, select, struct, sys, termios, time

WIDTH, HEIGHT = 142, 26
WORKDIR, BIN, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

events, buffer = [], ''
start = time.time()

pid, fd = pty.fork()
if pid == 0:
    os.chdir(WORKDIR)
    env = {
        'PATH': f"{BIN}:/usr/local/bin:/usr/bin:/bin:{os.environ["NODE_DIR"]}",
        'HOME': os.environ['HOME'],
        'TERM': 'xterm-256color',
        'PS1': r'\[\e[1;32m\]$\[\e[0m\] ',
        'LANG': 'en_US.UTF-8',
        'BASH_SILENCE_DEPRECATION_WARNING': '1',
        'NO_UPDATE_NOTIFIER': '1',
        'npm_config_update_notifier': 'false',
        'npm_config_fund': 'false',
        'npm_config_audit': 'false',
    }
    os.execvpe('bash', ['bash', '--noprofile', '--norc', '-i'], env)

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', HEIGHT, WIDTH, 0, 0))


def pump(seconds):
    """Read and record output for up to `seconds`."""
    global buffer
    end = time.time() + seconds
    while True:
        left = end - time.time()
        if left <= 0:
            return
        ready, _, _ = select.select([fd], [], [], min(left, 0.05))
        if ready:
            try:
                data = os.read(fd, 65536).decode('utf-8', 'replace')
            except OSError:
                return
            if not data:          # the shell has exited
                return
            events.append([time.time() - start, 'o', data])
            buffer += data


def wait_for(pattern, timeout=300):
    """Wait until the output since the last call matches `pattern`."""
    global buffer
    end = time.time() + timeout
    while time.time() < end:
        text = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', buffer)
        match = re.search(pattern, text, re.M)
        if match:
            # Keep what came after the match: the next wait may already be satisfied.
            buffer = text[match.end():]
            return
        pump(0.1)
    raise SystemExit(f'timeout waiting for {pattern!r} events={len(events)} tail={events[-3:]!r}\n--- last output ---\n{buffer[-2000:]}')


def type_line(text, pause=0.6):
    for ch in text:
        os.write(fd, ch.encode())
        pump(0.055)
    pump(pause)
    os.write(fd, b'\r')


def key(seq, pause=0.45):
    os.write(fd, seq)
    pump(pause)


DOWN, ENTER, SPACE = b'\x1b[B', b'\r', b' '
PROMPT = r'^\$ \Z'

wait_for(PROMPT, 10)
pump(0.8)
type_line('mkdir shop-api && cd shop-api')
wait_for(PROMPT)
type_line('express-cli init')
wait_for('How big')
pump(0.8)
key(DOWN, 0.7); key(ENTER)                      # Large
wait_for('TypeScript or JavaScript'); pump(0.6)
key(ENTER)                                       # TypeScript
wait_for('Which database'); pump(0.6)
key(ENTER)                                       # MongoDB
wait_for('Which extras'); pump(0.8)
key(SPACE, 0.5)                                  # .env validation
key(DOWN, 0.3); key(SPACE, 0.5)                  # logger
key(DOWN, 0.3); key(SPACE, 0.5)                  # /api/v1 prefix
key(DOWN, 0.3); key(SPACE, 0.5)                  # security
pump(0.6); key(ENTER)
wait_for(r'Add your first module', 600)
wait_for(PROMPT)
pump(1.0)
type_line('express-cli create:resource product')
wait_for(r'Resource product created', 300)
wait_for(PROMPT)
pump(1.5)
type_line('PORT=4100 npm start > server.log 2>&1 &')
wait_for(PROMPT)
pump(9.0)
type_line('curl -s localhost:4100/api/v1/product; echo')
wait_for(PROMPT)
pump(0.8)
type_line("curl -s -X POST localhost:4100/api/v1/product -H 'Content-Type: application/json' -d '{\"name\":\"Pen\"}'; echo")
wait_for(PROMPT)
pump(3.0)
cut_time = time.time() - start   # nothing after this point is shown
os.write(fd, b'kill %1 2>/dev/null; exit\r')
pump(1.0)

# Shorten long pauses (npm install, server start) to keep the demo short.
MAX_GAP = 1.2
shifted, previous, offset = [], 0.0, 0.0
for t, kind, data in events:
    gap = t - previous
    if gap > MAX_GAP:
        offset += gap - MAX_GAP
    previous = t
    shifted.append([round(t - offset, 3), kind, data])

# Drop the closing "kill ... exit" line from the recording.
shifted = [e for e, original in zip(shifted, events) if original[0] < cut_time]

with open(OUT, 'w') as f:
    f.write(json.dumps({'version': 2, 'width': WIDTH, 'height': HEIGHT, 'env': {'TERM': 'xterm-256color', 'SHELL': '/bin/bash'}}) + '\n')
    for e in shifted:
        f.write(json.dumps(e) + '\n')
print(f'recorded {len(shifted)} events, {shifted[-1][0]:.1f}s')
