import test from 'node:test';
import assert from 'node:assert/strict';
import { routineReportRows } from '../public/views2.js';

test('relatório de rotinas mostra as 30 execuções mais recentes, permite abrir a tarefa e escapa dados', () => {
  const history = Array.from({ length: 32 }, (_, i) => ({ at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), status: 'started', ...(i === 31 ? { taskId: 'task-31' } : {}) }));
  const html = routineReportRows({ state: { runs: [{ id: 'task-31', status: 'completed', deliverables: [{}, {}] }] }, projectNameOf: () => '<script>projeto</script>' }, [{ name: '<img src=x>', projectId: 'p', history }]);
  assert.equal((html.match(/<tr>/g) || []).length, 30);
  assert.ok(html.indexOf('task-31') > html.indexOf('01/01'));
  assert.match(html, /data-act="task" data-id="task-31"/);
  assert.match(html, /2 arquivo\(s\)/);
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;projeto&lt;\/script&gt;/);
});
