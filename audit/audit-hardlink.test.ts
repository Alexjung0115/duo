import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {afterAll,expect,it} from 'vitest';
import {INDEX_WRITE_LOCK_PATH,withIndexWriteLock} from './write-lock.js';
import {makeRepo} from './testing.js';

const temps:string[]=[];
afterAll(()=>{
  for(const root of temps){
    const absolute=fs.realpathSync(root);
    assert.equal(path.dirname(absolute).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(/^(duo-incr-|duo-audit-hardlink-)/.test(path.basename(absolute)));
    fs.rmSync(absolute,{recursive:true,force:true});
  }
});

// Passes only when the lock refuses the alias and the external database stays byte-for-byte unchanged.
it('refuses a lock file hard-linked to an external WAL database and preserves its bytes',async()=>{
  const r=makeRepo(temps,{'.duo-project/project.yaml':'schema_version: 1\nname: audit-hardlink\n'});
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'duo-audit-hardlink-'));temps.push(outside);
  const external=path.join(outside,'external.db');
  const db=new DatabaseSync(external);
  try{db.exec('PRAGMA journal_mode=WAL; CREATE TABLE t(x); INSERT INTO t VALUES (1);');}finally{db.close();}
  const lock=path.join(r.root,INDEX_WRITE_LOCK_PATH);
  fs.mkdirSync(path.dirname(lock),{recursive:true});
  fs.linkSync(external,lock);
  const before=fs.readFileSync(external);
  let entered=false;
  const result=await withIndexWriteLock(r.root,async()=>{entered=true;return true;},{lockTimeoutMs:0});
  const after=fs.readFileSync(external);
  console.log('AUDIT_HARDLINK '+JSON.stringify({platform:process.platform,nlink:fs.statSync(lock).nlink,entered,value:result.value,diagnostics:result.diagnostics,headerBefore:[before[18],before[19]],headerAfter:[after[18],after[19]],changeCounterBefore:before.readUInt32BE(24),changeCounterAfter:after.readUInt32BE(24),bytesEqual:after.equals(before)}));
  expect(after.equals(before)).toBe(true);
  expect(entered).toBe(false);
},120000);
