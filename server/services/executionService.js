const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Timeout model: a single rigid wall-clock cutoff used to kill *every* run
// after N seconds, which meant a program that legitimately printed a prompt
// and sat waiting on the user to type an answer got killed mid-thought just
// as often as a genuine infinite loop. We now track two independent clocks:
//   - CPU_TIMEOUT_MS: strict cap on a *silent* compute burst (no output at
//     all). Armed at process start and after every stdin write (a fresh
//     bounded "turn" begins); cleared the moment any output arrives, since
//     output means the process yielded — either to print more progress or,
//     typically, right before it blocks on the next input() — and from then
//     on only the idle clock governs the wait. This is what actually catches
//     `while(true){}` while leaving `input("Enter: ")` alone.
//   - IDLE_TIMEOUT_MS: outer bound on total silence (no stdout/stderr/stdin
//     at all), covering both a genuinely hung process and an abandoned
//     interactive session where nobody ever answers the prompt.
const CPU_TIMEOUT_MS = Number(process.env.EXECUTION_CPU_TIMEOUT_MS) || 10000;
const IDLE_TIMEOUT_MS = Number(process.env.EXECUTION_IDLE_TIMEOUT_MS) || 60000;
const COMPILE_TIMEOUT_MS = Number(process.env.EXECUTION_COMPILE_TIMEOUT_MS) || 10000;
// Grace window between SIGTERM and SIGKILL (docker: `docker stop --time`)
// so a killed process gets a chance to unwind cleanly instead of always
// being yanked out from under itself.
const KILL_GRACE_MS = 2000;
const MAX_OUTPUT_CHARS = 20000;
const DOCKER_MEMORY = '128m';
const DOCKER_CPUS = '0.5';
const IS_WINDOWS = process.platform === 'win32';

// Prepended to C/C++ sources before compiling. glibc/MSVCRT fully-buffer
// stdout when it isn't attached to a TTY (i.e. always, here — it's piped),
// so a prompt printed with printf/cout right before scanf/cin would sit in
// the buffer and never reach the client until the buffer filled or the
// process exited. Unlike Python (`-u` flag), there's no interpreter-level
// switch for this — the fix has to live in the compiled binary itself, so
// we inject a constructor that runs before main() and forces both stdio
// streams unbuffered. (cin/cout are tied by default and already
// auto-flush on read, but this also covers plain printf/scanf.)
const C_UNBUFFERED_PREAMBLE = `#include <stdio.h>
__attribute__((constructor))
static void __devsangam_unbuffered_io(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
}
#line 1
`;
const CPP_UNBUFFERED_PREAMBLE = `#include <cstdio>
namespace {
struct __devsangam_unbuffered_io_t {
    __devsangam_unbuffered_io_t() {
        std::setvbuf(stdout, nullptr, _IONBF, 0);
        std::setvbuf(stderr, nullptr, _IONBF, 0);
    }
} __devsangam_unbuffered_io_instance;
}
#line 1
`;

// Local-mode-only: compiled binary naming differs by host OS. Docker mode is
// always Linux regardless of host, so it never needs this.
const LOCAL_BIN = IS_WINDOWS ? 'main.exe' : 'main.out';

// localCompile/localCmd are functions of the per-execution temp dir (not
// static strings): on Windows, child_process.spawn does NOT implicitly
// search cwd for a bare executable name the way a shell would, so spawning
// 'main.exe' after compiling it there fails with ENOENT even though the file
// exists — the run command has to be the compiled binary's absolute path.
const RUNNERS = {
  python: {
    label: 'Python',
    image: 'python:3.10-alpine',
    fileName: 'main.py',
    // -u: unbuffered stdout/stderr. Python fully buffers stdout when it isn't
    // attached to a TTY (i.e. always, here, since it's piped), so prompts
    // printed before an input() call would otherwise sit in the buffer and
    // never reach the client until the buffer filled or the process exited —
    // silently breaking interactive input entirely.
    shellCmd: 'python3 -u main.py',
    localCmd: () => ({ cmd: 'python3', args: ['-u', 'main.py'] }),
  },
  javascript: {
    label: 'JavaScript',
    image: 'node:18-alpine',
    fileName: 'main.js',
    shellCmd: 'node main.js',
    localCmd: () => ({ cmd: 'node', args: ['main.js'] }),
  },
  // cpp-sandbox:alpine — an existing local image with gcc/g++ on alpine,
  // reused in place of the much larger gcc:latest (Debian, ~1-2GB) suggested
  // in the spec; same tools, far less to pull for a $0 dev setup.
  c: {
    label: 'C',
    image: 'cpp-sandbox:alpine',
    fileName: 'main.c',
    preamble: C_UNBUFFERED_PREAMBLE,
    shellCmd: 'gcc main.c -o main.out && ./main.out',
    localCompile: () => ({ cmd: 'gcc', args: ['main.c', '-o', LOCAL_BIN] }),
    localCmd: (cwd) => ({ cmd: path.join(cwd, LOCAL_BIN), args: [] }),
  },
  cpp: {
    label: 'C++',
    image: 'cpp-sandbox:alpine',
    fileName: 'main.cpp',
    preamble: CPP_UNBUFFERED_PREAMBLE,
    shellCmd: 'g++ main.cpp -o main.out && ./main.out',
    localCompile: () => ({ cmd: 'g++', args: ['main.cpp', '-o', LOCAL_BIN] }),
    localCmd: (cwd) => ({ cmd: path.join(cwd, LOCAL_BIN), args: [] }),
  },
  // eclipse-temurin:17-alpine — openjdk:17-alpine is deprecated/unmaintained
  // on Docker Hub; Temurin is the maintained successor for the same JDK.
  java: {
    label: 'Java',
    image: 'eclipse-temurin:17-alpine',
    fileName: 'Main.java',
    shellCmd: 'javac Main.java && java Main',
    localCompile: () => ({ cmd: 'javac', args: ['Main.java'] }),
    localCmd: () => ({ cmd: 'java', args: ['Main'] }),
  },
};

function truncate(s) {
  if (!s) return s;
  return s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n...[output truncated]` : s;
}

let dockerAvailableCache = null;
function isDockerAvailable() {
  if (dockerAvailableCache !== null) return Promise.resolve(dockerAvailableCache);
  return new Promise((resolve) => {
    const proc = spawn('docker', ['info'], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      proc.kill();
      dockerAvailableCache = false;
      resolve(false);
    }, 3000);
    proc.on('error', () => {
      clearTimeout(timer);
      dockerAvailableCache = false;
      resolve(false);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      dockerAvailableCache = code === 0;
      resolve(dockerAvailableCache);
    });
  });
}

const localRuntimeCache = new Map();
function isLocalRuntimeAvailable(runner) {
  const checkCmd = runner.localCompile ? runner.localCompile('.').cmd : runner.localCmd('.').cmd;
  if (localRuntimeCache.has(checkCmd)) return Promise.resolve(localRuntimeCache.get(checkCmd));
  return new Promise((resolve) => {
    const proc = spawn(checkCmd, ['--version'], { shell: false, stdio: 'ignore' });
    proc.on('error', () => {
      localRuntimeCache.set(checkCmd, false);
      resolve(false);
    });
    proc.on('close', () => {
      localRuntimeCache.set(checkCmd, true);
      resolve(true);
    });
  });
}

function appendNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

// Sends SIGTERM and gives the process KILL_GRACE_MS to unwind (flush
// buffers, run destructors/atexit handlers, close files) before following up
// with SIGKILL. Clears the follow-up if the process exits on its own in the
// meantime, so a well-behaved program is never force-killed unnecessarily.
function killChildGracefully(child, graceMs = KILL_GRACE_MS) {
  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const forceTimer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }, graceMs);
  child.once('exit', () => clearTimeout(forceTimer));
}

// Docker equivalent: `docker stop` sends SIGTERM to the container's PID 1
// and SIGKILLs it if it hasn't exited after `--time` seconds — the same
// grace-then-force semantics as killChildGracefully, built in.
function killContainerGracefully(containerName, graceMs = KILL_GRACE_MS) {
  spawn('docker', ['stop', '--time', String(Math.ceil(graceMs / 1000)), containerName], { stdio: 'ignore' }).on(
    'error',
    () => {
      // docker itself unreachable — fall back to a direct kill attempt
      spawn('docker', ['kill', containerName], { stdio: 'ignore' }).on('error', () => {});
    }
  );
}

// Drives the two independent timeout clocks described above the constants:
// idle (resets on any activity — output or input) and cpu (armed on start
// and on each input, cleared by output). onTimeout fires at most once, with
// 'idle' or 'cpu' so callers can report which limit was hit.
function createTimeoutController({ cpuTimeoutMs, idleTimeoutMs, onTimeout }) {
  let idleTimer = null;
  let cpuTimer = null;
  let fired = false;

  function fire(reason) {
    if (fired) return;
    fired = true;
    clearTimeout(idleTimer);
    clearTimeout(cpuTimer);
    onTimeout(reason);
  }

  function armIdle() {
    clearTimeout(idleTimer);
    if (fired) return;
    idleTimer = setTimeout(() => fire('idle'), idleTimeoutMs);
  }
  function armCpu() {
    clearTimeout(cpuTimer);
    if (fired) return;
    cpuTimer = setTimeout(() => fire('cpu'), cpuTimeoutMs);
  }

  return {
    start() {
      armIdle();
      armCpu();
    },
    noteOutput() {
      armIdle();
      clearTimeout(cpuTimer);
      cpuTimer = null;
    },
    noteInput() {
      armIdle();
      armCpu();
    },
    stop() {
      fired = true;
      clearTimeout(idleTimer);
      clearTimeout(cpuTimer);
    },
  };
}

// Runs a single non-interactive step to completion, batched — used only for
// the local-mode compile step (gcc/g++/javac), which never reads stdin and
// finishes fast, so there's nothing to stream or write to.
function runBatchStep(cmd, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, shell: false });
    } catch (err) {
      resolve({ stdout: '', stderr: err.message, exitCode: 1, timedOut: false });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killChildGracefully(child);
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: truncate(stdout), stderr: truncate(`${stderr}\n${err.message}`), exitCode: 1, timedOut: false });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: truncate(stdout), stderr: truncate(stderr), exitCode: timedOut ? null : code, timedOut });
    });

    child.stdin.end();
  });
}

// Spawns the actual program (local mode) and keeps its stdin open for the
// full run — `write()` can be called any time before the process exits to
// feed it another line, which is what makes interactive input() / cin /
// Scanner reads possible. Returns synchronously so the caller can start
// forwarding stdin immediately, well before `done` resolves.
function runInteractiveStep(cmd, args, { cwd, initialStdin, cpuTimeoutMs, idleTimeoutMs, onStdout, onStderr }) {
  let child;
  try {
    child = spawn(cmd, args, { cwd, shell: false });
  } catch (err) {
    return { write: () => {}, kill: () => {}, done: Promise.resolve({ stdout: '', stderr: err.message, exitCode: 1, timedOut: false }) };
  }

  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let timeoutReason = null;

  const timers = createTimeoutController({
    cpuTimeoutMs,
    idleTimeoutMs,
    onTimeout: (reason) => {
      timedOut = true;
      timeoutReason = reason;
      killChildGracefully(child);
    },
  });
  timers.start();

  const done = new Promise((resolve) => {
    let settled = false;

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      timers.noteOutput();
      onStdout?.(text);
      if (stdout.length > MAX_OUTPUT_CHARS) killChildGracefully(child);
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      timers.noteOutput();
      onStderr?.(text);
      if (stderr.length > MAX_OUTPUT_CHARS) killChildGracefully(child);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      timers.stop();
      resolve({ stdout: truncate(stdout), stderr: truncate(`${stderr}\n${err.message}`), exitCode: 1, timedOut: false });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      timers.stop();
      resolve({ stdout: truncate(stdout), stderr: truncate(stderr), exitCode: timedOut ? null : code, timedOut, timeoutReason });
    });
  });

  function write(text) {
    try {
      if (!child.stdin.writable) return;
      child.stdin.write(appendNewline(text));
      timers.noteInput();
    } catch {
      // stdin may already be closed if the process exited/errored
    }
  }

  if (initialStdin) write(initialStdin);

  return { write, kill: () => killChildGracefully(child), done };
}

// Docker-mode equivalent of runInteractiveStep: the whole "compile && run"
// shell pipeline runs as one container (started with -i), so stdin written
// here reaches the actual program once compilation finishes and it starts
// reading — no separate compile/run split needed the way local mode has.
function runInteractiveDocker(runner, tempDir, initialStdin, onStdout, onStderr) {
  const containerName = `devsangam-exec-${crypto.randomBytes(6).toString('hex')}`;
  const args = [
    'run',
    '--rm',
    '-i',
    '--name',
    containerName,
    '-v',
    `${tempDir}:/sandbox:rw`,
    '-w',
    '/sandbox',
    '--memory',
    DOCKER_MEMORY,
    '--cpus',
    DOCKER_CPUS,
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,size=16m',
    runner.image,
    'sh',
    '-c',
    runner.shellCmd,
  ];

  let child;
  try {
    child = spawn('docker', args, { shell: false });
  } catch (err) {
    return { write: () => {}, kill: () => {}, done: Promise.resolve({ failed: true, stdout: '', stderr: err.message, exitCode: 1, timedOut: false }) };
  }

  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let timeoutReason = null;

  const timers = createTimeoutController({
    cpuTimeoutMs: CPU_TIMEOUT_MS,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    onTimeout: (reason) => {
      timedOut = true;
      timeoutReason = reason;
      killContainerGracefully(containerName);
    },
  });
  timers.start();

  const done = new Promise((resolve) => {
    let settled = false;

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      timers.noteOutput();
      onStdout?.(text);
      if (stdout.length > MAX_OUTPUT_CHARS) killContainerGracefully(containerName);
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      timers.noteOutput();
      onStderr?.(text);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      timers.stop();
      resolve({ failed: true, stdout: '', stderr: err.message, exitCode: 1, timedOut: false });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      timers.stop();
      resolve({ stdout: truncate(stdout), stderr: truncate(stderr), exitCode: timedOut ? null : code, timedOut, timeoutReason });
    });
  });

  function write(text) {
    try {
      if (!child.stdin.writable) return;
      child.stdin.write(appendNewline(text));
      timers.noteInput();
    } catch {
      // ignore — container may have already exited
    }
  }

  if (initialStdin) write(initialStdin);

  return { write, kill: () => killContainerGracefully(containerName), done };
}

// Local-mode orchestration: compile (if needed) is batched — it never reads
// stdin — then the actual run step is handed off to runInteractiveStep so it
// can receive input for the rest of the execution window. Compile gets its
// own fixed budget rather than sharing a wall-clock pool with the run step,
// since the two are governed by unrelated timeout models now.
async function runLocalInteractive(runner, tempDir, initialStdin, onStdout, onStderr) {
  let compileOut = '';
  let compileErr = '';

  if (runner.localCompile) {
    const { cmd, args } = runner.localCompile(tempDir);
    const compileResult = await runBatchStep(cmd, args, { cwd: tempDir, timeoutMs: COMPILE_TIMEOUT_MS });
    compileOut = compileResult.stdout;
    compileErr = compileResult.stderr;

    if (compileResult.timedOut || compileResult.exitCode !== 0) {
      return {
        write: () => {},
        kill: () => {},
        done: Promise.resolve({
          stdout: compileOut,
          stderr: compileErr,
          exitCode: compileResult.exitCode,
          timedOut: compileResult.timedOut,
          timeoutReason: compileResult.timedOut ? 'compile' : null,
        }),
      };
    }
    if (compileOut) onStdout?.(compileOut);
    if (compileErr) onStderr?.(compileErr);
  }

  const { cmd, args } = runner.localCmd(tempDir);
  const session = runInteractiveStep(cmd, args, {
    cwd: tempDir,
    initialStdin,
    cpuTimeoutMs: CPU_TIMEOUT_MS,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    onStdout,
    onStderr,
  });

  return {
    write: session.write,
    kill: session.kill,
    done: session.done.then((r) => ({
      stdout: compileOut + r.stdout,
      stderr: compileErr + r.stderr,
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      timeoutReason: r.timeoutReason,
    })),
  };
}

function mockResult(runner, reason) {
  const note = reason ? ` (${reason})` : '';
  return {
    stdout: `[mock mode] ${runner.label} execution simulated${note}. No real code was run.\n`,
    stderr: '',
    exitCode: 0,
    timedOut: false,
  };
}

const TIMEOUT_MESSAGES = {
  cpu: `Execution Timed Out — no output for ${CPU_TIMEOUT_MS / 1000}s (compute limit; use input() prompts or periodic output if this is an intentionally long computation)`,
  idle: `Execution Timed Out — no activity for ${IDLE_TIMEOUT_MS / 1000}s`,
  compile: `Compilation Timed Out (${COMPILE_TIMEOUT_MS / 1000}s limit)`,
};

function finalize(result, startedAt, mode) {
  let stderr = result.stderr || '';
  if (result.timedOut) {
    const message = TIMEOUT_MESSAGES[result.timeoutReason] || `Execution Timed Out (${IDLE_TIMEOUT_MS / 1000}s limit)`;
    stderr = `${stderr}${stderr ? '\n' : ''}${message}`;
  }
  return {
    stdout: result.stdout || '',
    stderr,
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    timedOut: Boolean(result.timedOut),
    mode,
  };
}

// Starts an execution and returns immediately with a `write(text)` function
// (buffers writes until the real process exists, then flushes them — so
// stdin sent the instant a run starts is never silently dropped while Docker
// availability is still being probed) plus a `result` promise that resolves
// to the same shape runCode always returned. onStdout/onStderr fire with raw
// chunks as the process produces them, for live terminal streaming.
function runCode({ language, code, stdin = '', onStdout, onStderr }) {
  const runner = RUNNERS[language];
  const startedAt = Date.now();

  if (!runner) {
    return {
      write: () => {},
      kill: () => {},
      result: Promise.resolve({
        stdout: '',
        stderr: `Unsupported language: ${language}`,
        exitCode: 1,
        durationMs: 0,
        timedOut: false,
        mode: 'error',
      }),
    };
  }

  const envMode = (process.env.EXECUTION_MODE || 'auto').toLowerCase();

  if (envMode === 'mock') {
    return { write: () => {}, kill: () => {}, result: Promise.resolve(finalize(mockResult(runner), startedAt, 'mock')) };
  }

  let boundWrite = null;
  const pendingWrites = [];
  function write(text) {
    if (boundWrite) boundWrite(text);
    else pendingWrites.push(text);
  }
  function bind(fn) {
    boundWrite = fn;
    while (pendingWrites.length) fn(pendingWrites.shift());
  }

  // Lets the caller (e.g. the websocket layer, on room/client disconnect)
  // terminate the in-flight process on demand rather than only on timeout —
  // buffered the same way write() is in case disconnect races the still-in-
  // flight Docker-availability probe before a real session exists yet.
  let boundKill = null;
  let killRequested = false;
  function kill() {
    if (boundKill) boundKill();
    else killRequested = true;
  }
  function bindKill(fn) {
    boundKill = fn;
    if (killRequested) fn();
  }

  const result = (async () => {
    let tempDir;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devsangam-exec-'));
      const source = runner.preamble ? `${runner.preamble}${code ?? ''}` : code ?? '';
      await fs.writeFile(path.join(tempDir, runner.fileName), source, 'utf8');

      let mode = envMode === 'local' ? 'local' : 'docker';
      if (mode === 'docker' && !(await isDockerAvailable())) {
        mode = 'local';
      }

      if (mode === 'docker') {
        const session = runInteractiveDocker(runner, tempDir, stdin, onStdout, onStderr);
        bind(session.write);
        bindKill(session.kill);
        const dockerResult = await session.done;
        if (!dockerResult.failed) return finalize(dockerResult, startedAt, 'docker');
        console.error(`[exec] docker run failed (${dockerResult.stderr}); falling back to local`);
        mode = 'local';
      }

      const localAvailable = await isLocalRuntimeAvailable(runner);
      if (!localAvailable) {
        return finalize(
          mockResult(runner, 'Docker unavailable and no local runtime found for this language'),
          startedAt,
          'mock'
        );
      }

      const session = await runLocalInteractive(runner, tempDir, stdin, onStdout, onStderr);
      bind(session.write);
      bindKill(session.kill);
      const localResult = await session.done;
      return finalize(localResult, startedAt, 'local');
    } finally {
      if (tempDir) fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  })();

  return { write, kill, result };
}

module.exports = { runCode, RUNNERS };
