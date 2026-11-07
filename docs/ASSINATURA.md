# Assinatura digital do Setup.exe

**Problema:** o `Setup.exe` não tem assinatura, então o Windows 11 com o Controle Inteligente de Aplicativos (Smart App Control) o bloqueia, e o SmartScreen avisa. O zip portátil não tem esse problema.

**Solução:** assinar o instalador com o **SignPath Foundation**, que oferece certificado gratuito para projetos de código aberto. O Code Room é MIT e público, então cumpre o essencial. Os requisitos mudam com o tempo: **confira os atuais em signpath.org** (seção Foundation) antes de pedir.

## O que já está pronto no repositório
- `.github/workflows/release.yml` gera o zip e o `Setup.exe` no GitHub, assina quando o SignPath estiver configurado e publica na Release.
- Sem o SignPath configurado, o mesmo workflow roda e gera o instalador **sem** assinatura (nada quebra).
- `installer/sums.ps1` recalcula o SHA-256 depois da assinatura (assinar muda o arquivo).

## O que só você pode fazer (cerca de 30 minutos, mais a espera da aprovação)
1. **Pedir a aprovação** no site do SignPath Foundation, com a conta do GitHub do projeto (`Igorferreirax/code-room-open`). Costumam pedir:
   - repositório público com licença livre (MIT: ok);
   - uma página de projeto que diga quem assina e que o certificado é do SignPath Foundation (a landing pode ter essa nota no rodapé; peça ao Claude para adicionar quando a aprovação sair);
   - política de privacidade curta (o Code Room não coleta dados; o `SECURITY.md` e o README já explicam o funcionamento local).
2. Depois de aprovado, no painel do SignPath: criar o **projeto** (use o slug `code-room`), a **configuração de artefato** para o `Setup.exe` e a **política de assinatura** de release. Conecte o GitHub como sistema de build confiável.
3. No GitHub, em **Settings › Secrets and variables › Actions** do repositório:
   - Secret `SIGNPATH_API_TOKEN` (o token da API do SignPath);
   - Variáveis `SIGNPATH_ORG_ID`, `SIGNPATH_PROJECT_SLUG` e `SIGNPATH_POLICY_SLUG`.
4. Teste: em **Actions › Release › Run workflow**. O passo "Trocar pelo Setup.exe assinado" confere a assinatura e falha se ela não for válida.

## Para publicar uma versão pelo GitHub
1. Atualize `version` no `package.json` e crie `docs/RELEASE-NOTES-vX.Y.Z.md`.
2. Envie a tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. O workflow gera, assina e publica. Depois, copie os SHA-256 do `SHA256SUMS.txt` da Release para a landing (`js/config.js`).

## Alternativas pagas
Azure Trusted Signing (cerca de US$ 10 por mês, depende de elegibilidade) ou certificado comercial (cerca de US$ 200 a 400 por ano, com token físico). Valores aproximados.
