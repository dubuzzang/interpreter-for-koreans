// 화면 코드가 브라우저에서 문법 오류로 멈추지 않게 (모든 .js · .mjs 문법 검사)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.m?js$/.test(f) ? [p] : [];
});

test('모든 코드 문법 검사', () => {
  const all = [...files('public'), ...files('functions'), ...files('lib'), ...files('scripts')];
  assert.ok(all.length > 15);
  for (const f of all) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { assert.fail(`${f}\n${String(e.stderr).split('\n').slice(0, 5).join('\n')}`); }
  }
});
