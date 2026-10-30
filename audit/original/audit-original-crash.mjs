import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {createConcurrencyFixtureRepo} from './bench/concurrency/oracle.mjs';
import {withIndexWriteLock,INDEX_WRITE_LOCK_PATH} from './packages/graph/dist/index.js';

const root=createConcurrencyFixtureRepo('duo-audit143-crash-');
const snapshot=()=>{
  const rows=[];
  for(const relative of fs.readdirSync(root,{recursive:true,encoding:'utf8'})) {
    const p=relative.split(path.sep).join('/');
    if(p==='.git'||p.startsWith('.git/')||p.startsWith('.duo-project/generated/')||p.startsWith('.duo-project/cache/'))continue;
    const file=path.join(root,relative);
    if(fs.lstatSync(file).isFile())rows.push([p,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
  }
  return rows.sort((a,b)=>a[0].localeCompare(b[0]));
};
let child;
try {
  for(let i=0;i<300;i++)fs.writeFileSync(path.join(root,'src',`audit${i}.ts`),`export function audit${i}(){return ${i};}\n`);
  const before=snapshot();
  const cli=path.resolve('apps/cli/dist/main.js');
  child=spawn(process.execPath,[cli,'index','--full'],{cwd:root,windowsHide:true,stdio:'ignore'});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  const deadline=Date.now()+30000;
  while(!fs.existsSync(path.join(root,INDEX_WRITE_LOCK_PATH))&&child.exitCode===null&&Date.now()<deadline)await delay(5);
  assert.ok(fs.existsSync(path.join(root,INDEX_WRITE_LOCK_PATH)),'child must hold original lock before kill');
  assert.equal(child.exitCode,null);
  child.kill('SIGKILL');
  const killed=await exited;
  const lockRemains=fs.existsSync(path.join(root,INDEX_WRITE_LOCK_PATH));
  const acquire=await withIndexWriteLock(root,async()=>true,{lockTimeoutMs:0});
  const next=spawnSync(process.execPath,[cli,'index'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000});
  const after=snapshot();
  const beforeMap=new Map(before),afterMap=new Map(after);
  const changedPaths=[...new Set([...beforeMap.keys(),...afterMap.keys()])].filter(p=>beforeMap.get(p)!==afterMap.get(p));
  const protectedFilesEqual=changedPaths.every(p=>p==='.duo-project/runtime/metrics.jsonl');
  const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),node:process.version,platform:process.platform,killed,lockRemains,acquire,next:{code:next.status,stdout:next.stdout,stderr:next.stderr},changedPaths,expectedCliRuntimeWrites:['.duo-project/runtime/metrics.jsonl'],protectedFilesEqual,protectedFileCount:before.length};
  fs.writeFileSync('../pr143-original-crash-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  assert.equal(lockRemains,true);
  assert.equal(acquire.value,undefined);
  assert.equal(next.status,1);
  assert.match(next.stdout+next.stderr,/Index lock timeout/);
  assert.equal(protectedFilesEqual,true);
} finally {
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  const absolute=fs.realpathSync(root);
  assert.equal(path.dirname(absolute).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(absolute).startsWith('duo-audit143-crash-'));
  fs.rmSync(absolute,{recursive:true,force:true});
}
