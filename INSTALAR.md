# Instalar o Code Room (Windows)

Escolha uma das três formas.

> **Estado:** os pacotes das opções A e B ainda não foram publicados nos Releases. Até lá, use a opção C ou rode pelo código (`npm start`, veja o [README](README.md)).

## A. Zip portátil (sem instalar nada)
1. Baixe o `.zip` na página de [Releases](../../releases) do repositório e descompacte em qualquer pasta (por exemplo, `C:\CodeRoom`).
2. Dê dois cliques em `Iniciar-Code-Room.cmd`. O navegador abre já autenticado.
3. Para ter o **ícone na área de trabalho** e no menu Iniciar, dê dois cliques em `Criar-Atalhos.cmd` (não precisa de administrador). Para fechar o serviço, use o atalho **Fechar o Code Room** no menu Iniciar.
4. Na primeira vez, abra **Rotinas › Verificar o ambiente**: ele diz o que falta (ffmpeg, CLIs).

O zip já leva o Node dentro: **você não precisa instalar o Node**. Seus dados (projetos, histórico, chave de acesso) ficam em `%LOCALAPPDATA%\CodeRoom\data`, fora da pasta do programa: para atualizar, basta descompactar a versão nova por cima ou ao lado, sem perder nada.

## B. Instalador `.exe`
1. Baixe o instalador na página de Releases e abra.
2. Se o Windows mostrar **“O Windows protegeu o seu PC”**, é esperado: o instalador é novo e não tem assinatura digital paga. Não significa que um vírus foi encontrado.
   - Clique em **Mais informações** e depois em **Executar assim mesmo**.
   - Para conferir antes, compare o SHA-256 do arquivo com o publicado na página do Release: `Get-FileHash .\Code-Room-Setup.exe -Algorithm SHA256`.
3. Termine a instalação (não precisa de administrador). O assistente cria o **ícone do Code Room na área de trabalho** (você pode desmarcar) e no menu Iniciar, junto com o atalho **Fechar o Code Room**.

## C. Peça para a sua IA instalar
Cole no Claude Code ou no Codex:

> Instale o Code Room a partir de https://github.com/<seu-usuario>/code-room e abra para mim.

A IA clona o repositório, confere o Node (24 ou superior) e roda `npm start`.

## Depois de instalar
- Entre com os CLIs que você já usa: `codex login`, `claude auth login` (ou o login do Antigravity). O Code Room **não** guarda credenciais.
- A chave de acesso fica em `.data/access.key` (só no seu computador).
- Acesso pelo celular: **Configurações › Acesso** (vem desligado). Veja o [README](README.md).

## Desinstalar
- **Instalador:** Configurações do Windows › Aplicativos › Code Room › Desinstalar. Seus dados em `%LOCALAPPDATA%\CodeRoom\data` **não** são apagados (apague essa pasta se quiser remover tudo).
- **Zip portátil:** rode `scripts\criar-atalhos.ps1 -Remover` para tirar os atalhos e apague a pasta do programa.
- **Pelo código-fonte:** apague a pasta. Os dados ficam em `.data` dentro dela.

## Para quem gera os pacotes
`powershell -ExecutionPolicy Bypass -File installer\build.ps1` gera, em `dist\`, o zip portátil (e o instalador `.exe`, se o [Inno Setup 6](https://jrsoftware.org/isinfo.php) estiver instalado) e o `SHA256SUMS.txt`. O Node embutido vem da sua máquina (licença MIT, aviso em `installer\LICENSE-node.txt`).

> Segurança: não abra programas baixados de fontes que você não conhece. Por isso o Code Room é código aberto: você pode ler tudo antes de rodar.
