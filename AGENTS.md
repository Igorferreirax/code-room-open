# Guia para agentes de código (Codex, Claude Code e outros)

Code Room: orquestrador local de agentes de IA para Windows. Node ESM **sem dependências**, `node:sqlite`, front em JavaScript puro, serviço em `127.0.0.1:4780`, acesso por `X-Code-Room-Key`. Responda e escreva textos de interface em **português do Brasil**.

## Comandos
- Testes: `node --test test/*.test.mjs` (hoje 438). Auditoria de segurança: `node scripts/audit-security.mjs` (66). Sintaxe: `node scripts/check.mjs`.
- Interface (Playwright do Python): `python scripts/ui_smoke.py` (154), `crawl_ui.py`, `ui_assistant.py`, `ui_onboarding.py`, `ui_mention.py`, `ui_providers.py`, `test_radio.py`. **Não edite arquivos enquanto eles rodam.**
- Pacote Windows: `powershell -File installer\build.ps1`, depois `scripts\smoke-package.ps1`.
- Reiniciar o serviço: `scripts\stop.ps1 -Seguro` (recusa se há tarefa rodando) e `scripts\start.ps1 -Silencioso`. Nunca reinicie com o usuário no meio de uma aprovação.

## Regras do projeto
- Sem dependências novas, sem telemetria, nada sai do computador que não esteja em `docs/PRIVACIDADE.md` (um teste falha se o código chamar endereço não listado). Mudou algo que sai da máquina? Atualize essa lista no mesmo commit.
- Segredos só em arquivos próprios na pasta de dados (`social-secrets.json`, `api-secrets.json`, `publish*.json`, `access.key`); nunca voltam para a tela nem para logs.
- Nada é publicado em rede social sem aprovação por postagem. Projetos da área **Financeiro** nunca recebem MCP, web, navegador nem IA remota.
- Funções que agem (modo piloto, navegador, programas, MCP, web) vêm **desligadas** e por agente. PowerShell, cmd e `rm` nunca são oferecidos para liberar.
- Não publique release, não envie ao GitHub e não crie tag sem o dono pedir. As skills pessoais do dono não são distribuídas.

## Armadilhas já vividas
- Arquivos do repositório podem ter CRLF. Ao editar por script, normalize `\r\n`; cuidado com `\n` e `\r` dentro de strings em scripts (já quebraram sintaxe). Rode `node --check` nos arquivos tocados.
- O manual do Assistente (`docs/ASSISTENTE.md`) tem teto de 20000 bytes: enxugue antes de crescer.
- Testes devem funcionar em máquina sem ffmpeg, Claude ou Codex (use `skip` ou catálogo de CLI simulado) e comparar caminhos canônicos (nome curto 8.3 do Windows).
- O servidor só serve `/assets/*.png|jpg` por padrão; webp exige rota própria.
- `npx @playwright/mcp@latest` leva ~25 s e estoura o tempo do MCP; o código usa a cópia local (`findLocalPlaywright`).
- Reiniciar o serviço derruba a página aberta (“Failed to fetch”): avise antes.
- Mudou uma tela? Rode **todos** os roteiros de interface, não só o `ui_smoke.py`: em 10/11/2026 quatro deles ficaram quebrados sem ninguém notar.
- Antigravity sem tela: em `--mode plan` só devolve um plano, e ferramenta que pede permissão é negada e sai sem resposta. O aviso `agyHeadlessNote` no começo do pedido resolve; nunca use `--dangerously-skip-permissions`.
- Um projeto só mostra agentes e equipes trazidos para ele (ou que já rodaram tarefa nele). Em testes, chame `projects/members` depois de criar o agente.

## Estado (0.3.4 pronta na cópia local em 11/11/2026: commits locais, sem tag, sem publicação)
Entrou na 0.3.4: cara nova (logo pixel em app, instalador, landing e README; banner no Início; aviso "cara nova" uma vez), avisos das rotinas por Telegram e Gmail (`server/notify.mjs`, Conexões › Avisos), painel de métricas do YouTube (`server/metrics.mjs`, Conexões › Redes e métricas), logos oficiais das IAs (`aiLogo` em `public/brand-icons.js`), Início com boas-vindas do dia, isolamento por projeto, Biblioteca de agentes (12) com equipes prontas e IA sugerida, modo Terminais (saída ao vivo, ligações e campo de mensagem), Conexões em abas, Testar resposta, excluir projeto, Assistente com nome (Nico) e personalidade, guia de IAs e modelos para o Assistente, Corrigir com a IA com `ajustar_agente` e `repetir_tarefa`, terminais dentro do Canvas, ligação de ida e volta, memória do Assistente (`guardar_nota`), esconder agente do projeto, equipe pela leitura da pasta, correção do Antigravity sem resposta e bloqueio dele em Financeiro.

Pendente (ordem sugerida): 1) instalar o EXE em máquina limpa e atualizar a partir da 0.3.3; 2) campo de mensagem dentro do nó do Canvas com terminais (hoje é pelo menu do agente) e arrumação automática das linhas de ida e volta; 3) Assistente usar as notas guardadas ao criar agentes e propor notas sozinho ao fim de uma entrega; 4) caixa de entrada unificada; 5) resultados e histórico das rotinas; 6) skills do dono na biblioteca inicial (ele precisa dizer quais); 7) emojis 👥 🤖 que restam dentro das listas de seleção (o navegador não aceita ícone ali); 8) aviso de execução sem tela para CLIs conectadas pela pessoa (Kiro e outras), que não foi possível testar; 9) validar com contas reais: Telegram (postagem e avisos), Gmail (avisos), YouTube (métricas), Kiro; 9b) próximas versões: WhatsApp pela API oficial da Meta, Outlook com login Microsoft, voz do Nico com chave própria (ElevenLabs/OpenAI), botão "Enviar ao GitHub" com aprovação, personagens animados (atlas de sprites); 10) celular real; 11) assinatura digital do instalador; 12) decidir a licença antes de cobrar (hoje MIT). Detalhes em `docs/ROADMAP.md` e `docs/VISAO-PRODUTO.md`.
