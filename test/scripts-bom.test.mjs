import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O PowerShell 5 lê .ps1 sem BOM como ANSI e estraga os acentos (caixas de diálogo e mensagens).
for (const f of ['start.ps1', 'stop.ps1', 'criar-atalhos.ps1', 'atualizar.ps1']) {
  test(`scripts/${f} tem BOM (acentos corretos no PowerShell 5)`, () => {
    const b = readFileSync(new URL(`../scripts/${f}`, import.meta.url));
    assert.deepEqual([...b.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  });
}

test('start.ps1: escolhe porta livre quando a 4780 está ocupada e avisa se não abrir', () => {
  const s = readFileSync(new URL('../scripts/start.ps1', import.meta.url), 'utf8');
  assert.match(s, /4781\.\.4799/, 'procura outra porta');
  assert.match(s, /trap \{ Show-Erro/, 'mostra o erro em uma caixa (a janela fica oculta)');
  assert.match(s, /port\.txt/, 'lembra a porta escolhida');
});

test('start.ps1: abre como janela de app e tem saída para o navegador padrão', () => {
  const s = readFileSync(new URL('../scripts/start.ps1', import.meta.url), 'utf8');
  assert.match(s, /--app=\$url/, 'usa o modo app do Edge/Chrome');
  assert.match(s, /msedge\.exe/); assert.match(s, /chrome\.exe/);
  assert.match(s, /CODE_ROOM_JANELA/, 'dá para forçar o navegador padrão');
  assert.match(s, /else \{ Start-Process -FilePath \$url \}/, 'sem Edge/Chrome, abre no navegador padrão');
});
