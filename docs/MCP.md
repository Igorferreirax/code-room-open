# Conectar outras ferramentas ao Code Room (MCP)

O Code Room tem um servidor **MCP** (Model Context Protocol). Com ele, o Claude Code, o Codex, o Cursor e outras ferramentas conseguem consultar o Code Room: ver projetos, agentes, tarefas e entregas. Se você permitir, também criam e cancelam tarefas.

## Como ligar (1 minuto)
1. No Code Room, abra **Configurações › Acesso** e, no cartão **Conectar outras ferramentas (MCP)**, clique em **Ativar o MCP**.
2. Copie o comando do cartão e cole no terminal:
   - **Claude Code:** `claude mcp add code-room -- "<caminho do node>" "<caminho do mcp.mjs>"`
   - **Codex:** cole o bloco `[mcp_servers.code-room]` no `config.toml`.
   - **Outras ferramentas:** use o JSON do cartão.
3. Reinicie a ferramenta. Pronto: o Code Room aparece como um servidor MCP chamado `code-room`.

## O que a ferramenta consegue fazer
| Ferramenta | Faz | Precisa de escrita? |
|---|---|---|
| `status` | Versão, quantidade de projetos e agentes, tarefas rodando, na fila e com falha | Não |
| `listar_projetos` | Id, nome e área dos projetos (sem caminhos do disco) | Não |
| `listar_agentes` | Id, nome, função, sala, IA e modelo | Não |
| `listar_tarefas` | Tarefas recentes, com filtro por projeto e por estado | Não |
| `ver_tarefa` | Estado, resposta do agente e arquivos entregues | Não |
| `listar_entregas` | Tarefas concluídas que geraram arquivos | Não |
| `criar_tarefa` | Cria uma tarefa para um agente (gasta a cota da IA dele) | **Sim** |
| `cancelar_tarefa` | Cancela uma tarefa na fila ou rodando | **Sim** |

Por padrão o servidor é **somente leitura**. Para liberar `criar_tarefa` e `cancelar_tarefa`, use o botão **Permitir criar e cancelar tarefas** no cartão e copie o comando novo (ele traz `--escrever`).

## O que ele nunca faz
- **Aprovar, reprovar ou apagar entregas, mudar configurações, rede, acesso ou conexões.** Essas decisões continuam sendo suas, no Code Room. Mesmo uma tarefa criada pela ferramenta passa pela sua aprovação antes de qualquer entrega.
- **Ler a chave principal.** O MCP usa um **token próprio de aparelho**, o mesmo mecanismo do celular. Ele aparece em *Aparelhos pareados* como "MCP · …" e você revoga quando quiser. Esse token não alcança nada que seja só do dono.
- **Falar com a internet.** Ele só conversa com o Code Room do próprio computador (`127.0.0.1`).

## Desligar
Clique em **Desativar e revogar** no mesmo cartão: o token é revogado na hora e o arquivo dele é apagado. Ativar de novo gera um token novo e invalida o anterior.

## Problemas comuns
- **"O MCP ainda não foi ativado."** Clique em *Ativar o MCP* no Code Room.
- **"O Code Room não respondeu na porta …".** Abra o Code Room. Se ele estiver em outra porta (a 4780 estava ocupada), o MCP descobre a porta sozinho pelo arquivo `port.txt` da pasta de dados.
- **"O token do MCP foi recusado ou revogado."** Ative o MCP de novo.
- **A ferramenta não mostra `criar_tarefa`.** O servidor está em somente leitura: use o comando com `--escrever`.

## Detalhes técnicos
Servidor em `server/mcp.mjs`: JSON-RPC 2.0 por entrada e saída padrão (`initialize`, `tools/list`, `tools/call`, `ping`), sem dependências. Lê a porta de `CODE_ROOM_PORT` ou do `port.txt` e o token de `CODE_ROOM_TOKEN` ou do `mcp-token` na pasta de dados. A escrita também pode ser ligada com a variável `CODE_ROOM_MCP_ESCREVER=1`.
