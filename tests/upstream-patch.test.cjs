const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

test('upstream patch includes additions, changes, and deletions and applies cleanly', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mrt-patch-test-'));
  const upstream = join(directory, 'upstream');
  const fork = join(directory, 'fork');
  const sourcePath =
    'examples/react/mantine-react-table/src/mantine-react-table';
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' });
  try {
    mkdirSync(join(upstream, sourcePath), { recursive: true });
    mkdirSync(join(fork, 'src'), { recursive: true });
    git(upstream, 'init', '--quiet');
    writeFileSync(
      join(upstream, sourcePath, 'changed.ts'),
      'export const value = 1;\n',
    );
    writeFileSync(
      join(upstream, sourcePath, 'removed.ts'),
      'export const removed = true;\n',
    );
    git(upstream, 'add', '.');
    git(
      upstream,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '-m',
      'upstream',
    );
    const revision = git(upstream, 'rev-parse', 'HEAD').trim();
    git(fork, 'init', '--quiet');
    writeFileSync(
      join(fork, 'package.json'),
      JSON.stringify({ xUpstreamRevision: revision }),
    );
    writeFileSync(join(fork, 'src', 'changed.ts'), 'export const value = 2;\n');
    writeFileSync(
      join(fork, 'src', 'added.ts'),
      'export const added = true;\n',
    );
    const patch = join(directory, 'upstream.patch');
    execFileSync('bash', [resolve('scripts/create-upstream-patch.sh'), patch], {
      cwd: fork,
      env: { ...process.env, MRT_UPSTREAM_REPOSITORY: upstream },
    });
    git(upstream, 'apply', '--check', patch);
    git(upstream, 'apply', patch);
    assert.equal(
      readFileSync(join(upstream, sourcePath, 'added.ts'), 'utf8'),
      'export const added = true;\n',
    );
    assert.equal(
      readFileSync(join(upstream, sourcePath, 'changed.ts'), 'utf8'),
      'export const value = 2;\n',
    );
    assert.throws(
      () => readFileSync(join(upstream, sourcePath, 'removed.ts')),
      { code: 'ENOENT' },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
