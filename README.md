# Code Room

**Seus agentes de IA trabalhando juntos, na mesma sala.** O Code Room roda no seu computador, junta as IAs de linha de comando que você já usa (Codex, Claude Code e Gemini/Antigravity) e faz uma passar o trabalho para a outra. Nada sai sem a sua aprovação.

> English: see [README.en.md](README.en.md).

![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

## O que ele faz
- **Uma sala, vários agentes.** Cada agente tem nome, função, provedor e estado em tempo real, mostrados num escritório pixel art, em lista ou num Canvas.
- **Repasses entre agentes.** O trabalho concluído de um vira a tarefa do próximo, com resumo e arquivos. No Canvas, arraste de um agente a outro para ligá-los. Há limite de idas e voltas, e o ciclo para quando alguém escreve “SEM PENDÊNCIAS”.
- **Equipes.** Fluxo desenvolvedor → revisor, com plano do supervisor validado pelo backend.
- **Aprovação antes de sair.** A prévia espera em `AGUARDANDO_APROVACAO/<CANAL>`. *Aprovar* entrega o pacote em `POSTAR_<CANAL>`. *Pedir ajuste* refaz só o que você apontar. *Reprovar* move tudo para a `LIXEIRA` (nada é apagado de vez). Nada é publicado sozinho.
- **Rotinas.** Por horário, manuais ou quando um arquivo aparece.
- **Consumo honesto.** O que o provedor não informa aparece como “indisponível”, nunca como zero nem inventado.
- **No celular.** Pareamento por QR (código de uso único, token por aparelho, revogável) pela rede local ou pelo Tailscale. Vem **desligado** por padrão.
- **Primeiro uso guiado.** Em uma instalação nova, uma triagem confere quais IAs (Codex, Claude Code, Gemini) estão instaladas e conectadas, mostra o comando exato para instalar ou entrar, e cria agentes iniciais com um clique. Depois, um tutorial passo a passo apresenta as 12 telas. Dá para **pular** a qualquer momento e rever pelo menu do usuário › Guia de boas-vindas.
- **Local e privado.** O serviço escuta só em `127.0.0.1`. Usa os CLIs que você já tem logados; o Code Room não guarda nem mostra credenciais.

## Requisitos
- Windows 10 ou 11.
- Node.js 24 ou superior (testado no 26). O pacote do Windows (zip portátil) já leva o Node dentro: veja [INSTALAR.md](INSTALAR.md).
- Pelo menos um destes CLIs, logado: Codex (`codex login`), Claude Code (`claude auth login`) ou Antigravity/Gemini.
- Opcional: Python 3, ffmpeg e HyperFrames, para o modo de lote de vídeo.

## Começar
```bash
git clone https://github.com/<seu-usuario>/code-room.git
cd code-room
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
[docs/ROADMAP.md](docs/ROADMAP.md) · [docs/BACKLOG.md](docs/BACKLOG.md) · [docs/IMPLEMENTACAO.md](docs/IMPLEMENTACAO.md) · [docs/VALIDACAO-BACKEND.md](docs/VALIDACAO-BACKEND.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md)

## Licença e créditos
[MIT](LICENSE). Desenvolvido por [Bytelab](https://www.agenciabytelab.com.br).
