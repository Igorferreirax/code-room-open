# Guia para agentes de código (Codex, Claude Code e outros)

Code Room: orquestrador local de agentes de IA para Windows. Node ESM **sem dependências**, `node:sqlite`, front em JavaScript puro, serviço em `127.0.0.1:4780`, acesso por `X-Code-Room-Key`. Responda e escreva textos de interface em **português do Brasil**.

## Comandos
- Testes: `node --test test/*.test.mjs` (hoje 394). Auditoria de segurança: `node scripts/audit-security.mjs` (62). Sintaxe: `node scripts/check.mjs`.
- Interface (Playwright do Python): `python scripts/ui_smoke.py` (117), `crawl_ui.py`, `ui_assistant.py`, `ui_onboarding.py`, `ui_mention.py`, `ui_providers.py`, `test_radio.py`. **Não edite arquivos enquanto eles rodam.**
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

## Estado (0.3.2 publicada em 09/11/2026)
Feito: redes sociais, Biblioteca de APIs, rotina diária, pesquisa na web, “Liberar” bloqueios, levar skills e MCP para outras IAs, economia de tokens, equipe do projeto (trazer/tirar), excluir agente e equipe, Canvas por projeto, Corrigir com a IA, skills favoritas, radinho lo-fi, privacidade e CI.

Pendente (ordem sugerida): 1) confiabilidade: instalação em máquina limpa, recuperação de tarefa interrompida, toque do Canvas no celular; 2) caixa de entrada unificada de trabalho; 3) diff e arquivos antes de aceitar (inclui o modo piloto); 4) resultados e histórico das rotinas; 5) receitas versionadas; 6) validar com contas reais: Telegram e YouTube, “Levar para outras IAs” com Codex e Antigravity; 7) excluir projeto (não existe); 8) assinatura digital do instalador. Detalhes em `docs/ROADMAP.md` e `docs/VISAO-PRODUTO.md`.
