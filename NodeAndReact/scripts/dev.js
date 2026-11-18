/**
 * Starts the Express API and the Vite dev server together.
 * No extra dependency required.
 *
 *   npm run dev
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const processes = [
    { name: 'server', cwd: path.join(root, 'server') },
    { name: 'client', cwd: path.join(root, 'client') },
].map(({ name, cwd }) => {
    const child = spawn(npm, ['run', 'dev'], {
        cwd,
        stdio: 'inherit',
        detached: process.platform !== 'win32',
    });

    child.on('error', (err) => {
        console.error(`[dev] could not start ${name}:`, err.message);
        shutdown(1);
    });
    child.on('exit', (code) => {
        if (shuttingDown) return;
        console.error(`\n[dev] ${name} stopped (exit code ${code ?? 1}). Shutting down the other process…`);
        shutdown(code ?? 1);
    });

    return { name, child };
});

let shuttingDown = false;

function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const { child } of processes) {
        if (child.exitCode !== null) continue;
        try {
            if (process.platform === 'win32') child.kill('SIGTERM');
            else process.kill(-child.pid, 'SIGTERM');
        } catch {
            // already gone
        }
    }

    setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
