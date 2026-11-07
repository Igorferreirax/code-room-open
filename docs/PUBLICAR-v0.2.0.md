# Publicar o Code Room v0.2.0 (passo a passo)

Tudo abaixo já está preparado e conferido. Os três passos que **tornam algo público** ficaram para quem é dono da conta executar (o Claude Code os recusou por serem ações públicas):

1. tornar o repositório público;
2. criar o Release com os arquivos;
3. publicar a landing no Vercel.

## Antes de começar (já verificado)
- Histórico do Git: 17 commits, um único autor (e-mail `noreply` do GitHub), nenhum segredo, chave, e-mail pessoal ou caminho do seu computador. Único dado pessoal no repositório: o nome no `LICENSE`.
- O Pix existe só na landing, nunca no app nem no repositório.
- Pacote final reconstruído e testado (`scripts/smoke-package.ps1`: OK). Arquivos em `dist\`:
  - `Code-Room-0.2.0-portatil-win-x64.zip` — SHA-256 `d77a3d7a52d34fde5d2807791421f423859c95d37bc5ec8e9fb6f2474190e9c8`
  - `Code-Room-0.2.0-Setup.exe` — SHA-256 `5e4cff5aa422f1d8902b927a4ddb1e1d38198a885c18928a74039d8d7b943f7c`
  - `SHA256SUMS.txt`
- A landing já está com os links e os SHA-256 acima (`Code Room Landing\js\config.js`).

## 1. Tornar o repositório público
```bash
gh repo edit Igorferreirax/code-room-open --visibility public --accept-visibility-change-consequences
```
Depois, no GitHub: Settings › Code security › ative **Private vulnerability reporting** (o `SECURITY.md` aponta para isso).

## 2. Criar o Release
```bash
cd "C:/Users/Igor/Desktop/Code Room Publico"
gh release create v0.2.0 dist/Code-Room-0.2.0-portatil-win-x64.zip dist/Code-Room-0.2.0-Setup.exe dist/SHA256SUMS.txt --title "Code Room 0.2.0" --notes-file docs/RELEASE-NOTES-v0.2.0.md
```

## 3. Publicar a landing (só depois do passo 2)
```bash
cd "C:/Users/Igor/Desktop/Code Room Landing"
vercel --prod
```
Depois confira em https://… (o endereço que o Vercel mostrar) que sai a landing (não o app) e que os botões baixam os arquivos.

## Depois de publicar
- Baixar o zip do Release, conferir o SHA-256 (`Get-FileHash`) e abrir em um computador limpo.
- O `Setup.exe` **não tem assinatura digital**: o Windows pode avisar (ver INSTALAR.md). Para remover o aviso, é preciso assinar (SignPath Foundation, gratuito para código aberto).
