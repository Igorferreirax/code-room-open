# Privacidade: o que fica no seu computador e o que sai

O Code Room roda **no seu computador**. Não existe servidor do Code Room nem da Bytelab: **não há telemetria, conta, análise de uso nem envio automático de nada para nós**. Tudo que sai da máquina sai porque você escolheu uma IA, conectou uma rede ou clicou em um botão, e vai direto ao serviço que você escolheu.

Esta lista é conferida contra o código a cada mudança (veja o fim do documento). Se achar algo que sai e não está aqui, é um erro nosso: abra uma issue ou, se for sensível, siga o [SECURITY.md](../SECURITY.md).

## O que fica guardado, e onde
A pasta de dados é `.data/` (rodando pelo código) ou `%LOCALAPPDATA%\CodeRoom\data` (pacote do Windows).

| Arquivo | O que tem | Cuidado |
| --- | --- | --- |
| `access.key` | A chave de acesso ao serviço local | Nunca é versionada nem aparece na tela |
| `code-room.sqlite` | Projetos, agentes, tarefas, resultados, conversas, memória do projeto, rotinas, propostas de postagem | Só local |
| `assistente/` | Conversa e memória do Assistente | Só local |
| `social-secrets.json` | Senhas de aplicativo e tokens das contas de redes sociais | Nunca volta para a tela; apagado junto com a conta |
| `api-secrets.json` | Chaves da Biblioteca de APIs | Mostra só os 4 últimos caracteres |
| `publish.json`, `publish-tokens.json` | ID e segredo do app Google e o token do YouTube | Nunca volta para a tela |
| `mcp-token`, aparelhos pareados | Token do MCP e tokens dos celulares | O token de cada celular é guardado como hash; o do MCP fica no arquivo, só local |
| `network.json`, `*.log` | Configuração de rede e registros do serviço | Só local. Não os envie em issues sem conferir o conteúdo |

Os arquivos de segredo são gravados com permissão restrita. **No Windows essa permissão tem efeito limitado**: a proteção real vem de a pasta ficar no seu usuário. Não compartilhe a pasta de dados, não a envie em prints nem em issues.

## O que sai, para onde e quando
| O quê | Para onde | Quando | O que vai |
| --- | --- | --- | --- |
| Pedidos às IAs | O provedor da IA que **você** escolheu (Codex, Claude, Antigravity), pelo CLI dela, sob os termos e a cota da sua conta | Quando uma tarefa roda | O objetivo, o contexto e a memória do projeto, as skills escolhidas, notas do Obsidian (se você ligou), arquivos das pastas de referência e o material de outros agentes |
| Hermes | O seu servidor, por SSH | Só se você configurar | O mesmo pedido, para o seu servidor |
| Pesquisar na web | A internet, pelo Claude | Só em agentes com a opção ligada | As buscas e as páginas lidas |
| Verificar atualização | `api.github.com` (e, para baixar, hosts do GitHub) | A cada verificação; dá para desligar em Configurações › Atualizações | Nada seu; o GitHub vê o seu IP. O arquivo só é aceito se o SHA-256 bater |
| YouTube | `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Só depois de você conectar a conta e confirmar cada vídeo | O vídeo, o título e a descrição aprovados |
| Redes sociais | Bluesky, a sua instância do Mastodon, `api.telegram.org`, o webhook do Discord | Só quando **você aprova cada postagem** | O texto e os arquivos aprovados |
| Avisos das rotinas | `api.telegram.org` (o **seu** bot, na **sua** conversa) e `smtp.gmail.com` (o **seu** Gmail, com senha de app) | Só nas rotinas em que você marcou “Enviar o resultado por” | O nome da rotina, o projeto e a resposta da tarefa. Projetos **Financeiro** nunca enviam |
| Métricas do YouTube | `www.googleapis.com` | Ao abrir Conexões › Redes e métricas, no máximo a cada 30 minutos (ou ao clicar em Atualizar) | O pedido de leitura do canal conectado; nada seu é enviado |
| Biblioteca de APIs | O serviço da própria chave (GitHub, OpenAI, Anthropic, Google, Groq, OpenRouter, ElevenLabs) | Só quando você clica em “Testar e ver consumo” | A chave no cabeçalho da chamada |
| Ditado e leitura em voz | O serviço de voz do **navegador** (por exemplo, o Chrome pode enviar o áudio ao Google) | Só se você usar o microfone ou a leitura | O Code Room não recebe o áudio |
| MCP e navegador dos agentes | O que você liberou ao agente | Só nos agentes em que você ligou | Conforme a ferramenta |
| Celular e Tailscale | O seu próprio aparelho, pela sua rede | Só se você ligar em Configurações › Acesso | O painel, com token do aparelho |

**Nunca saem:** a chave de acesso, as chaves da Biblioteca de APIs fora da chamada que você pediu, as senhas das redes fora do envio aprovado, e qualquer dado de projeto **Financeiro** para IA remota (o Hermes é recusado nesse tipo de projeto).

## Endereços exatos que o código chama
`api.github.com`, `github.com`, `objects.githubusercontent.com` e `release-assets.githubusercontent.com` (atualizações) · `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`, `youtubeanalytics.googleapis.com` (YouTube) · `generativelanguage.googleapis.com` (chave do Gemini) · `bsky.social` (Bluesky) · `api.telegram.org` (Telegram, postagens e avisos) · `smtp.gmail.com` (avisos por e-mail, porta 465 com TLS) · `api.openai.com`, `api.anthropic.com`, `api.groq.com`, `openrouter.ai`, `api.elevenlabs.io` (teste de chave na Biblioteca de APIs). `kiro.dev` aparece somente como link clicado pela pessoa para instalar o Kiro CLI; o Code Room não consulta esse site automaticamente. Mastodon e Discord usam o endereço que **você** cadastrou. Um teste automático (`test/privacidade.test.mjs`) falha se o código passar a citar um endereço que não esteja listado aqui.

## O que só funciona se você ligar
Estas funções agem no seu computador ou fora dele, e **vêm desligadas**. Cada uma tem aviso na própria tela.
- **Modo piloto** do Assistente (interruptor no chat): lê e edita arquivos do projeto em foco, roda programas liberados, usa skills e MCP.
- **Programas, MCP, navegador e pesquisa na web por agente:** campos do formulário do agente. Programas que dão controle total do computador (PowerShell, cmd, rm…) nunca são liberados.
- **Levar para outras IAs:** copia skills e MCP para o Codex e o Antigravity, sem sobrescrever, com backup.
- **Publicar:** nada é publicado sem a sua aprovação, postagem por postagem.
- **Acesso pelo celular, rede local e Tailscale.**
- **Obsidian em modo “Alimentar”** e **Git** (commits locais; nunca envia ao GitHub sozinho).

## Como conferir
- **Conexões › O que o Code Room enviou:** mostra as últimas 40 chamadas para fora das **redes sociais**, do **YouTube** (login e upload), da **verificação de atualização** e dos testes da **Biblioteca de APIs** (método, endereço, cabeçalhos, conteúdo e código da resposta). Senhas, tokens e chaves aparecem como `***`, e a resposta do serviço não é guardada. **Não aparecem aí:** os pedidos às IAs, que saem pelos CLIs delas. O conteúdo do vídeo enviado ao YouTube aparece só como “arquivo enviado em partes”.
- `npm run audit` roda ataques reais contra um serviço isolado (chave errada, `Host` e `Origin` forjados, travessia de pasta, vazamento da chave).
- Toda chamada de rede do código fica em `server/` e usa `fetch(` ou os CLIs das IAs: `grep -rn "fetch(" server/`.
- **Regra para quem contribui:** um pull request que adiciona ou muda algo que sai do computador **atualiza esta lista no mesmo PR**, e a revisão confere a lista contra o código.
