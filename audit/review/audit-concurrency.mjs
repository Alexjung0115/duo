import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runScenarioConcurrentGraphIndex, runScenarioConcurrentGitWorktrees } from './bench/concurrency/oracle.mjs';

const report = { commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8', windowsHide:true}).trim(), platform: process.platform, node: process.version, results: [] };
for (const [name, run] of [
  ['C2a-cold', () => runScenarioConcurrentGraphIndex({workerCount:4, preIndex:false})],
  ['C2b-incremental', () => runScenarioConcurrentGraphIndex({workerCount:4, preIndex:true})],
  ['C5-worktrees', () => runScenarioConcurrentGitWorktrees()],
]) {
  const start = Date.now();
  try {
    const result = await run();
    report.results.push({name, durationMs: Date.now()-start, ...result});
    console.log(JSON.stringify({name, durationMs:Date.now()-start, result}));
  } catch(error) {
    report.results.push({name, error:error.stack});
    console.log(JSON.stringify({name, error:error.message}));
  }
  fs.writeFileSync('../pr143-audit-concurrency-results.json', JSON.stringify(report,null,2)+'\n');
}
if(report.results.some(r=>r.error || r.classification==='silent-inconsistency')) process.exitCode=1;
