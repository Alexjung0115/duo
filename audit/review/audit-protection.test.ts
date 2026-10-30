import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterAll,beforeAll,expect,it} from 'vitest';
import type {AnalyzerRegistry} from '@duo-director/analyzer';
import {indexRepository,openProjectGraphStore} from './indexer.js';
import {refreshIndexIfSafe} from './refresh.js';
import {withIndexWriteLock} from './write-lock.js';
import {INDEX_STATE_FILE_PATH} from './state.js';
import {baseRegistry,makeRepo,type TestRepo} from './testing.js';

const temps:string[]=[];
let registry:AnalyzerRegistry;
beforeAll(async()=>{registry=await baseRegistry();},120000);
afterAll(()=>{
  registry?.dispose();
  for(const root of temps){
    const absolute=fs.realpathSync(root);
    assert.equal(path.dirname(absolute).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(/^(duo-incr-|duo-audit-protect-)/.test(path.basename(absolute)));
    fs.rmSync(absolute,{recursive:true,force:true});
  }
},120000);
function repo(){return makeRepo(temps,{
  '.duo-project/project.yaml':'schema_version: 1\nname: audit-protection\n',
  '.duo-project/intent/vision.md':'---\nstatus: draft\n---\n\n# Vision\n\nPreserve user files.\n',
  '.gitignore':'ignored-user.txt\n',
  'ignored-user.txt':'user-owned ignored data\n',
  'src/a.ts':'export const a=1;\n',
  'user.config.json':'{"userOwned":true}\n',
});}
function protectedSnapshot(r:TestRepo){
  const rows:[string,string][]=[];
  const walk=(dir:string)=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      const p=path.relative(r.root,file).split(path.sep).join('/');
      if(p==='.git'||p==='.duo-project/generated'||p==='.duo-project/cache/analysis')continue;
      const stat=fs.lstatSync(file);
      if(stat.isSymbolicLink())rows.push([p,'link:'+fs.readlinkSync(file)]);
      else if(stat.isDirectory()){
        if(p!=='.duo-project/cache')rows.push([p,'directory']);
        walk(file);
      }else if(stat.isFile())rows.push([p,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
    }
  };
  walk(r.root);
  return {files:rows.sort((a,b)=>a[0].localeCompare(b[0])),head:r.git('rev-parse','HEAD'),staging:r.git('ls-files','--stage','-z'),unstaged:r.git('diff','--binary')};
}
async function initial(r:TestRepo){
  const store=openProjectGraphStore(r.root).value!;
  try{expect((await indexRepository(r.root,{store,registry})).value).toBeDefined();}finally{store.close();}
}
for(const mode of ['success','current','timeout','missing-state','exception','concurrent'] as const){
  it(`preserves every protected path, ignored user file, HEAD and staging on ${mode}`,async()=>{
    const r=repo();await initial(r);
    if(mode!=='current'){
      r.write('src/a.ts','export const a=2;\n');r.git('add','src/a.ts');
      r.write('src/a.ts','export const a=3;\n');
    }
    if(mode==='missing-state')r.remove(INDEX_STATE_FILE_PATH);
    const before=protectedSnapshot(r);
    if(mode==='concurrent'){
      const results=await Promise.all([0,1].map(()=>refreshIndexIfSafe(r.root,{registry,lockTimeoutMs:60000})));
      expect(results.map(x=>x.value?.refreshed).sort()).toEqual([false,true]);
    }else{
      let result;
      if(mode==='timeout')await withIndexWriteLock(r.root,async()=>{result=await refreshIndexIfSafe(r.root,{registry,lockTimeoutMs:0});});
      else result=await refreshIndexIfSafe(r.root,{registry,onPhase:phase=>{if(mode==='exception'&&phase==='analysis')throw new Error('audit injected exception');}});
      if(mode==='success')expect(result?.value).toEqual({refreshed:true});
      else if(mode==='current')expect(result?.value).toEqual({refreshed:false});
      else expect(result?.value).toBeUndefined();
    }
    expect(protectedSnapshot(r)).toEqual(before);
  },120000);
}
for(const target of ['generated','cache/analysis'] as const){
  it(`does not write through a Windows directory junction at ${target}`,async()=>{
    const r=repo();
    const outside=fs.mkdtempSync(path.join(os.tmpdir(),'duo-audit-protect-'));temps.push(outside);
    fs.writeFileSync(path.join(outside,'sentinel.txt'),'outside user file\n');
    const junction=path.join(r.root,'.duo-project',target);
    fs.mkdirSync(path.dirname(junction),{recursive:true});
    fs.symlinkSync(outside,junction,'junction');
    const before=fs.readdirSync(outside).map(name=>[name,fs.readFileSync(path.join(outside,name),'utf8')]);
    if(target==='generated'){
      let entered=false;
      const result=await withIndexWriteLock(r.root,async()=>{entered=true;});
      expect(entered).toBe(false);expect(result.value).toBeUndefined();
      expect(result.diagnostics.some(d=>/symlink/i.test(d.message))).toBe(true);
    }else{
      const store=openProjectGraphStore(r.root).value!;
      try{
        const result=await indexRepository(r.root,{store,registry});
        expect(result.diagnostics.some(d=>/symlink/i.test(d.message))).toBe(true);
      }finally{store.close();}
    }
    expect(fs.readdirSync(outside).map(name=>[name,fs.readFileSync(path.join(outside,name),'utf8')])).toEqual(before);
  },120000);
}
