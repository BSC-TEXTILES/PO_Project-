#!/usr/bin/env node
/**
 * npm run db:backup [-- --out <dir>]
 * Consistent, online MySQL backup via mysqldump (--single-transaction: no table locks
 * for InnoDB, a single point-in-time snapshot). Writes backups/poms_mysql_<UTC timestamp>.sql
 * plus a .sha256 checksum. The password is passed via the MYSQL_PWD environment
 * variable of the child process only (never on the command line, never printed).
 *
 * mysqldump is located via MYSQLDUMP_PATH, then PATH, then the default Windows install dirs.
 * Restore: see docs/DATABASE.md ("Backup and restore").
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveDbConfig, describeDb } from '../src/config/dbConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outIdx = process.argv.indexOf('--out');
const outDir = path.resolve(outIdx > -1 ? process.argv[outIdx + 1] : path.join(__dirname, '../../backups'));

function findMysqldump() {
  if (process.env.MYSQLDUMP_PATH && fs.existsSync(process.env.MYSQLDUMP_PATH)) return process.env.MYSQLDUMP_PATH;
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['mysqldump'], { encoding: 'utf8' });
  if (probe.status === 0) return probe.stdout.split(/\r?\n/)[0].trim();
  if (process.platform === 'win32') {
    for (const base of ['C:\\Program Files\\MySQL', 'C:\\Program Files (x86)\\MySQL']) {
      if (!fs.existsSync(base)) continue;
      for (const d of fs.readdirSync(base).filter((x) => /^MySQL Server/i.test(x)).sort().reverse()) {
        const exe = path.join(base, d, 'bin', 'mysqldump.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  throw new Error('mysqldump not found. Install the MySQL client tools or set MYSQLDUMP_PATH.');
}

const cfg = resolveDbConfig();
const exe = findMysqldump();
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const file = path.join(outDir, `poms_mysql_${stamp}.sql`);

const args = [
  `--host=${cfg.host}`, `--port=${cfg.port}`, `--user=${cfg.user}`,
  '--single-transaction', '--quick', '--routines', '--triggers',
  '--hex-blob', '--default-character-set=utf8mb4', '--set-gtid-purged=OFF', '--no-tablespaces',
  '--databases', cfg.database,
];
console.log(`Backing up ${describeDb(cfg)} → ${file}`);
const out = fs.createWriteStream(file);
const child = spawn(exe, args, { env: { ...process.env, MYSQL_PWD: cfg.password }, stdio: ['ignore', 'pipe', 'pipe'] });
const hash = crypto.createHash('sha256');
let bytes = 0;
child.stdout.on('data', (b) => { hash.update(b); bytes += b.length; });
child.stdout.pipe(out);
let err = '';
child.stderr.on('data', (b) => { err += b; });
child.on('close', (code) => {
  out.end(() => {
    if (code !== 0) {
      fs.rmSync(file, { force: true });
      console.error(`✗ mysqldump failed (exit ${code}): ${err.replace(/MYSQL_PWD=\S+/g, '').trim()}`);
      process.exit(1);
    }
    const digest = hash.digest('hex');
    fs.writeFileSync(`${file}.sha256`, `${digest}  ${path.basename(file)}\n`);
    console.log(`✓ Backup complete: ${(bytes / 1024).toFixed(1)} KiB, sha256 ${digest}`);
  });
});
