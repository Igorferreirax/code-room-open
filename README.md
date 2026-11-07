# Code Room

**Seus agentes de IA trabalhando juntos, na mesma sala.** O Code Room roda no seu computador, junta as IAs de linha de comando que você já usa (Codex, Claude Code e Gemini/Antigravity) e faz uma passar o trabalho para a outra. Nada sai sem a sua aprovação.

> English: see [README.en.md](README.en.md).

![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)
![Windows 10 e 11](https://img.shields.io/badge/Windows-10%20%C2%B7%2011-0078d4?logo=windows&logoColor=white)
![Node.js 24+](https://img.shields.io/badge/node-%E2%89%A524-5fa04e?logo=node.js&logoColor=white)
![Zero dependências](https://img.shields.io/badge/depend%C3%AAncias%20de%20execu%C3%A7%C3%A3o-0-f08a3c)
[![CI](https://github.com/Igorferreirax/code-room-open/actions/workflows/ci.yml/badge.svg)](https://github.com/Igorferreirax/code-room-open/actions/workflows/ci.yml)
[![Baixar](https://img.shields.io/github/v/release/Igorferreirax/code-room-open?label=baixar&color=2b7bff)](https://github.com/Igorferreirax/code-room-open/releases/latest)

Se o Code Room te ajudou, **[deixe uma estrela ⭐](https://github.com/Igorferreirax/code-room-open)**. Ajuda outras pessoas a achar o projeto.

## Conteúdo
- [O que ele faz](#o-que-ele-faz) · [Baixar e abrir](#baixar-e-abrir-windows) · [Requisitos](#requisitos) · [Começar](#começar-pelo-código-fonte) · [Testes](#testes)
- [Problemas comuns](#problemas-comuns) · [Limites conhecidos](#limites-conhecidos) · [Documentação](#documentação)
- [Privacidade e segurança](#privacidade-e-segurança) · [Aviso](#aviso) · [Licença e créditos](#licença-e-créditos)

## O que ele faz
- **Uma sala, vários agentes.** Cada agente tem nome, função, provedor e estado em tempo real, mostrados num escritório pixel art, em lista ou num Canvas.
- **Repasses entre agentes.** O trabalho concluído de um vira a tarefa do próximo, com resumo e arquivos. No Canvas, arraste de um agente a outro para ligá-los. Há limite de idas e voltas, e o ciclo para quando alguém escreve “SEM PENDÊNCIAS”.
- **Equipes.** Fluxo desenvolvedor → revisor, com plano do supervisor validado pelo backend.
- **Aprovação antes de sair.** A prévia espera em `AGUARDANDO_APROVACAO/<CANAL>`. *Aprovar* entrega o pacote em `POSTAR_<CANAL>`. *Pedir ajuste* refaz só o que você apontar. *Reprovar* move tudo para a `LIXEIRA` (nada é apagado de vez). Nada é publicado sozinho.
- **Rotinas.** Por horário, manuais ou quando um arquivo aparece.
- **Consumo honesto.** O que o provedor não informa aparece como “indisponível”, nunca como zero nem inventado.
- **Uso por IA.** Cartões resumem as janelas de uso que cada provedor reporta, com o horário da leitura e o reset; a tabela detalhada existente continua abaixo.
- **Assistente.** Conversas podem ser renomeadas; o contexto inclui o status atual das tarefas, equipes e pastas de entrada.
- **Modelos e esforço.** Configure no agente ou temporariamente para uma missão individual, respeitando as opções aceitas por cada IA.
- **No celular.** Pareamento por QR (código de uso único, token por aparelho, revogável) pela rede local ou pelo Tailscale. Vem **desligado** por padrão.
- **Primeiro uso guiado.** Em uma instalação nova, uma triagem confere quais IAs (Codex, Claude Code, Gemini) estão instaladas e conectadas, mostra o comando exato para instalar ou entrar, e cria agentes iniciais com um clique. Depois, um tutorial passo a passo apresenta as 12 telas. Dá para **pular** a qualquer momento e rever pelo menu do usuário › Guia de boas-vindas.
- **Local e privado.** O serviço escuta só em `127.0.0.1`. Usa os CLIs que você já tem logados; o Code Room não guarda nem mostra credenciais.

## Requisitos
- Windows 10 ou 11.
- Node.js 24 ou superior (testado no 26). O pacote do Windows (zip portátil) já leva o Node dentro: veja [INSTALAR.md](INSTALAR.md).
- Pelo menos um destes CLIs, logado: Codex (`codex login`), Claude Code (`claude auth login`) ou Antigravity/Gemini.
- Opcional: Python 3, ffmpeg e HyperFrames, para o modo de lote de vídeo.

## Baixar e abrir (Windows)
1. Baixe o **zip portátil** na [página de Releases](https://github.com/Igorferreirax/code-room-open/releases/latest) e extraia em qualquer pasta.
2. Dê dois cliques em `Iniciar-Code-Room.cmd`. O Code Room abre em uma janela própria, e o Node já vem dentro: não precisa instalar nada.
3. No primeiro uso, a triagem confere quais IAs (Codex, Claude Code, Gemini) você já tem e mostra o que falta.

O `Setup.exe` também está na Release, mas **ainda não tem assinatura digital**: o Windows 11 com o Controle Inteligente de Aplicativos o bloqueia. Prefira o zip. Detalhes em [INSTALAR.md](INSTALAR.md).

## Começar (pelo código-fonte)
```bash
git clone https://github.com/Igorferreirax/code-room-open.git
cd code-room-open
npm start
```
No Windows você também pode dar dois cliques em `Iniciar-Code-Room.cmd`: ele inicia o serviço e abre o navegador já autenticado. A chave de acesso fica em `.data/access.key` (nunca é versionada).

## Testes
```bash
npm test          # testes do backend e das telas (sem navegador)
npm run audit     # ataques reais contra um serviço isolado (chave, Host/Origin forjados, travessia de pasta...)
npm run check     # sintaxe de todos os arquivos
npm run test:ui   # roteiro no navegador (precisa de Chrome e Playwright para Python)
npm run test:onboarding   # triagem das IAs e tutorial guiado, no navegador (idem)
```
Nenhum teste chama um provedor de IA nem gasta cota. Os roteiros com CLIs reais ficam em `scripts/validate-real.mjs` e são manuais.

## Limites conhecidos
- Só Windows por enquanto.
- O **modo de lote** (esteira de vídeo) é uma **esteira de exemplo**, nascida de um canal de vídeos: depende de uma skill, de scripts e de ferramentas (ffmpeg, HyperFrames, ElevenLabs) que você precisa ter. Veja `server/batches.mjs`. Generalizar isso está no [roadmap](docs/ROADMAP.md).
- O acesso remoto exige o computador ligado e o Code Room aberto.
- O teste de toque do Canvas no `test:ui` é intermitente.

## Documentação
[docs/VISAO-PRODUTO.md](docs/VISAO-PRODUTO.md) · [docs/STATUS-2026-11-06.md](docs/STATUS-2026-11-06.md) · [docs/ROADMAP.md](docs/ROADMAP.md) · [docs/BACKLOG.md](docs/BACKLOG.md) · [docs/IMPLEMENTACAO.md](docs/IMPLEMENTACAO.md) · [docs/VALIDACAO-BACKEND.md](docs/VALIDACAO-BACKEND.md) · [docs/ASSINATURA.md](docs/ASSINATURA.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md)

## Problemas comuns
- **O Windows avisou ao abrir o Setup.exe.** O instalador ainda não tem assinatura digital. Use o zip portátil ou confira o SHA-256 com o `SHA256SUMS.txt` da release.
- **O celular não abre o endereço.** Ligue o app Tailscale nos dois aparelhos (mesma conta). Em Configurações › Acesso, clique em **Diagnosticar o acesso** e, se preciso, em **Liberar no firewall do Windows**. No chat do Assistente, `/celular` mostra o passo a passo.
- **"Prompt grande demais" no Antigravity.** Corrigido na 0.2.1; atualize o app.
- **Uma IA aparece como "não encontrada".** Instale o CLI dela e entre na conta; a triagem do primeiro uso mostra o comando exato.

## Privacidade e segurança
O serviço escuta só em `127.0.0.1`, a chave fica em `.data/access.key` e nunca é versionada, e o acesso remoto vem desligado. Veja [SECURITY.md](SECURITY.md) para relatar uma falha.

## Aviso
O Code Room é independente e não é afiliado à OpenAI, à Anthropic nem ao Google. Ele usa os CLIs que você já tem; o uso de cada IA segue os termos e a cota da sua conta.

## Licença e créditos
[MIT](LICENSE). Desenvolvido por [Bytelab](https://www.agenciabytelab.com.br).
