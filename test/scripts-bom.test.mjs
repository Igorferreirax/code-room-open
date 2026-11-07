import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O PowerShell 5 lê .ps1 sem BOM como ANSI e estraga os acentos (caixas de diálogo e mensagens).
for (const f of ['start.ps1', 'stop.ps1', 'criar-atalhos.ps1', 'atualizar.ps1', 'bandeja.ps1', 'iniciar-com-windows.ps1']) {
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

test('scripts .ps1: nenhum caractere de controle escondido (uma barra mal escapada virava \\v e quebrava o caminho)', () => {
  for (const f of ['start.ps1', 'stop.ps1', 'criar-atalhos.ps1', 'atualizar.ps1', 'bandeja.ps1', 'iniciar-com-windows.ps1']) {
    const s = readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), `${f} tem caractere de controle`);
  }
  const start = readFileSync(new URL('../scripts/start.ps1', import.meta.url), 'utf8');
  assert.ok(start.includes('WindowsPowerShell\\v1.0\\powershell.exe'), 'caminho do PowerShell íntegro');
});

test('start.ps1: a bandeja é lançada com o caminho entre aspas (usuário com espaço no nome não pode quebrar)', () => {
  const s = readFileSync(new URL('../scripts/start.ps1', import.meta.url), 'utf8');
  assert.match(s, /bandeja\.ps1'\) \+ '"'\)/, 'caminho da bandeja entre aspas');
  const b = readFileSync(new URL('../scripts/bandeja.ps1', import.meta.url), 'utf8');
  assert.match(b, /'"' \+ \(Join-Path \$PSScriptRoot \$name\) \+ '"'/, 'a bandeja também cita os caminhos ao chamar outros scripts');
});

test('start.ps1: gira os logs grandes com o serviço parado (a pasta de dados não cresce sem limite)', () => {
  const s = readFileSync(new URL('../scripts/start.ps1', import.meta.url), 'utf8');
  assert.match(s, /server-error\.log/); assert.match(s, /Length -gt 5MB/); assert.match(s, /\$lp \+ '\.1'/);
});
