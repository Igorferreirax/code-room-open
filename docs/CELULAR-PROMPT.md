# Abrir o Code Room no celular (prompt para colar no Claude Code ou no Codex)

Prefere deixar a sua IA fazer o passo a passo? Cole o texto abaixo no Claude Code ou no Codex, abertos na pasta do Code Room.
Quem não quiser colar nada: no próprio Code Room, digite `/celular` no chat do Assistente, ou use **Configurações › Acesso**.

```text
Libere o Code Room instalado na minha máquina para eu abrir no celular.

Regras
- Faça tudo sozinho; só me interrompa para pedir permissão.
- Se o sandbox ou as permissões bloquearem algo (rede, firewall), peça a minha aprovação. Nunca pule um passo por isso.
- Não mude nada fora do necessário e não abra a porta para a internet inteira.

Passos
1. Leia a configuração em `<pasta de dados do Code Room>/network.json` (no zip portátil: `%LOCALAPPDATA%\CodeRoom\data`). Para usar o Wi-Fi de casa, deixe `"lan": true`; para usar o Tailscale, `"tailscale": true`. Prefira o Tailscale se eu usar. O serviço só lê esse arquivo ao iniciar: depois de editar, reinicie o Code Room (ou, mais simples, peça para eu ligar a opção na tela Configurações › Acesso).
2. Firewall do Windows: crie UMA regra de entrada só para o node.exe do Code Room e a porta 4780 (TCP), com `-RemoteAddress LocalSubnet,100.64.0.0/10` (rede local e Tailscale). Isso exige PowerShell como administrador: peça a minha aprovação.
3. Descubra o IP do computador no Wi-Fi (o IPv4 do adaptador Wi-Fi em `ipconfig`) ou o do Tailscale (`tailscale ip -4`) e confirme que `http://IP:4780/` responde.
4. Diga para eu abrir o Code Room no computador em Configurações › Acesso, clicar em "Parear um celular" e escanear o QR.

Quando terminar, responda assim
1. Pronto: o endereço.
2. Sua vez (só se precisar): cada ação que só eu posso fazer, em passos numerados.
3. Atenção: a rede local usa HTTP sem criptografia; desligue fora de casa.
```

Observações de segurança do Code Room: o acesso remoto vem desligado; o serviço escuta só nos endereços que você liberar; o celular pareado recebe um token próprio (revogável em Configurações › Acesso) e não acessa as rotas exclusivas do computador (rede, aparelhos, registro de projetos).
