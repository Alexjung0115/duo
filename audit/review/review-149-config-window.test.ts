import { expect, it } from 'vitest';
import { indexRepository, openProjectGraphStore, openProjectGraphReader } from './indexer.js';
import { refreshIndexIfSafe } from './refresh.js';
import { inspectIndex } from './inspect.js';
import { baseRegistry, makeRepo } from './testing.js';

it('refuses recovery when a previously absent ignored config appears after commit', async () => {
  const temps: string[] = [];
  const repo = makeRepo(temps, {
    '.duo-project/project.yaml': 'schema_version: 1\nname: review-149\n',
    '.gitignore': 'tsconfig.json\n',
    'src/a.ts': 'import { b } from "@lib/b";\nexport const a = b;\n',
    'src/b.ts': 'export const b = 1;\n',
  });
  const registry = await baseRegistry();
  const store = openProjectGraphStore(repo.root).value!;
  try {
    expect((await indexRepository(repo.root, {store, registry})).value).toBeDefined();
  } finally { store.close(); }
  repo.write('src/a.ts', 'import { b } from "@lib/b";\nexport const a = b + 1;\n');
  try {
    const result = await refreshIndexIfSafe(repo.root, {registry, onPhase(phase) {
      if (phase === 'write') repo.write('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@lib/*":["src/*"]}}}\n');
    }});
    const graph = openProjectGraphReader(repo.root).value!;
    try {
      const inspected = await inspectIndex(repo.root, {graph, registry});
      console.log(JSON.stringify({root: repo.root, result, inspection: inspected.value?.status, changedConfigs: inspected.value?.configs.changed}));
    } finally { graph.close(); }
    expect(result.value).toBeUndefined();
  } finally { registry.dispose(); }
}, 120_000);
