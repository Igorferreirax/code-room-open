import test from 'node:test';
import assert from 'node:assert/strict';
import { firewallScript, changeFirewall, phoneGuide, FIREWALL_RULE } from '../server/network.mjs';

test('firewall: a regra é só deste programa e desta porta, só para rede local e Tailscale, e o caminho vai entre aspas', () => {
  const s = firewallScript('add', "C:/Arquivos d'Igor/node.exe", 4780);
  assert.ok(s.includes('-LocalPort 4780') && s.includes('-Protocol TCP') && s.includes('-Direction Inbound'));
  assert.ok(s.includes('-RemoteAddress LocalSubnet,100.64.0.0/10'), 'nunca aberto para a internet inteira');
  assert.ok(s.includes("'C:/Arquivos d''Igor/node.exe'"), 'aspa simples do caminho escapada');
  assert.ok(s.includes(FIREWALL_RULE));
  assert.ok(firewallScript('remove', 'x', 0).startsWith('Remove-NetFirewallRule'));
  for (const bad of [80, 70000, 'a', 1.5, NaN]) assert.throws(() => firewallScript('add', 'x', bad), /Porta inválida/);
});

test('firewall: recusar a permissão do Windows vira mensagem clara; sucesso devolve ok', async () => {
  const ok = await changeFirewall('add', 'node.exe', 4780, (cmd, args, opts, cb) => { assert.equal(cmd, 'powershell.exe'); assert.ok(opts.env.CR_FW.includes('New-NetFirewallRule')); cb(null, '', ''); });
  assert.deepEqual(ok, { ok: true });
  const no = await changeFirewall('add', 'node.exe', 4780, (c, a, o, cb) => cb(new Error('The operation was canceled by the user')));
  assert.equal(no.ok, false); assert.match(no.error, /permissão do Windows foi recusada/);
});

test('/celular: guia com o endereço quando há rede e instruções quando está desligado', () => {
  const off = phoneGuide({ addresses: [] }, []);
  assert.match(off, /desligado/); assert.match(off, /Liberar no firewall/); assert.match(off, /sem criptografia/);
  const on = phoneGuide({ addresses: [{ kind: 'tailscale', url: 'http://100.1.2.3:4780/' }] }, [{ ok: false, label: 'Perfil de rede Público', hint: 'Marque como Privada.' }]);
  assert.match(on, /http:\/\/100\.1\.2\.3:4780\//); assert.match(on, /Perfil de rede Público/); assert.ok(!on.includes('desligado'));
});
