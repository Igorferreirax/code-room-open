# Instalar o Code Room (Windows)

Escolha uma das três formas.

> **Estado:** os pacotes das opções A e B ainda não foram publicados nos Releases. Até lá, use a opção C ou rode pelo código (`npm start`, veja o [README](README.md)).

## A. Zip portátil (sem instalar nada)
1. Baixe o `.zip` na página de [Releases](../../releases) do repositório e descompacte em qualquer pasta.
2. Dê dois cliques em `Iniciar-Code-Room.cmd`. O navegador abre já autenticado.
3. Na primeira vez, abra **Rotinas › Verificar o ambiente**: ele diz o que falta (Node, ffmpeg, CLIs).

## B. Instalador `.exe`
1. Baixe o instalador na página de Releases e abra.
2. Se o Windows mostrar **“O Windows protegeu o seu PC”**, é esperado: o instalador é novo e não tem assinatura digital paga. Não significa que um vírus foi encontrado.
   - Clique em **Mais informações** e depois em **Executar assim mesmo**.
   - Para conferir antes, compare o SHA-256 do arquivo com o publicado na página do Release: `Get-FileHash .\Code-Room-Setup.exe -Algorithm SHA256`.
3. Termine a instalação e abra o Code Room pelo atalho.

## C. Peça para a sua IA instalar
Cole no Claude Code ou no Codex:

> Instale o Code Room a partir de https://github.com/<seu-usuario>/code-room e abra para mim.

A IA clona o repositório, confere o Node (24 ou superior) e roda `npm start`.

## Depois de instalar
- Entre com os CLIs que você já usa: `codex login`, `claude auth login` (ou o login do Antigravity). O Code Room **não** guarda credenciais.
- A chave de acesso fica em `.data/access.key` (só no seu computador).
- Acesso pelo celular: **Configurações › Acesso** (vem desligado). Veja o [README](README.md).

## Desinstalar
Apague a pasta do Code Room. Os dados dele ficam na pasta `.data` dentro dela.

> Segurança: não abra programas baixados de fontes que você não conhece. Por isso o Code Room é código aberto: você pode ler tudo antes de rodar.
