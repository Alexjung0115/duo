import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {captureRepoSnapshot,createConcurrencyFixtureRepo} from './bench/concurrency/oracle.mjs';
import {tryAcquireFileLock} from './packages/graph/dist/store/node-sqlite/file-lock.js';
function cleanup(root) {
  const absolute=fs.realpathSync(root);
  assert.equal(path.dirname(absolute).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(absolute).startsWith('duo-audit-oracle-'));
  fs.rmSync(absolute,{recursive:true,force:true});
}
test('reports a held OS lock but accepts the released persistent lock file',()=>{
  const root=createConcurrencyFixtureRepo('duo-audit-oracle-');
  const file=path.join(root,'.duo-project/generated/index-writer.lock');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const held=tryAcquireFileLock(file);
  assert.ok(held);
  try {
    assert.ok(captureRepoSnapshot(root).danglingLocks.includes('.duo-project/generated/index-writer.lock'));
    held.release();
    assert.ok(fs.existsSync(file));
    assert.deepEqual(captureRepoSnapshot(root).danglingLocks,[]);
  } finally {held.release();cleanup(root);}
});
test('still rejects unrelated leftover locks and invalid OS lock files',()=>{
  const root=createConcurrencyFixtureRepo('duo-audit-oracle-');
  try {
    for(const relative of ['.duo-project/runtime/locks/decisions.lock','.duo-project/generated/index-writer.lock']) {
      const file=path.join(root,relative);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,'invalid-lock');
    }
    const locks=captureRepoSnapshot(root).danglingLocks;
    assert.ok(locks.includes('.duo-project/runtime/locks/decisions.lock'));
    assert.ok(locks.includes('.duo-project/generated/index-writer.lock'));
  } finally {cleanup(root);}
});
