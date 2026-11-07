# Checklist de lançamento e distribuição

Atualizado em 06/11/2026. ✅ verificado · ⚠️ verificado com ressalva · ⬜ falta · 👤 depende do dono do projeto.

## 1. Última validação local do repositório

Rodada em 06/11/2026, após o commit de modelo/esforço, renomear conversas, status ao vivo e painel compacto de uso:

| | Verificação | Resultado |
|---|---|---|
| ✅ | `npm test` | 167 de 167; inclui testes de modelo/esforço, renomear conversa, status ao vivo, painel de Uso, onboarding de vídeo e relatórios de rotina. |
| ✅ | `npm run audit` | 62 de 62 verificações na rodada mais recente; inclui 403 do celular pareado em `/api/preflight`. |
| ✅ | `npm run check` | 90 de 90 arquivos com sintaxe válida. |
| ⚠️ | Inspeção visual e rastreador de interface | Não executados nesta sessão: o host de navegador não ficou disponível. O relato anterior do usuário foi de 160 cliques sem problemas. |
| ⚠️ | Toque do Canvas no celular | Continua intermitente conforme o relato mais recente; não declarar resolvido até repetir em ambiente de navegador. |

## 2. Pacote Windows
| | Verificação | Resultado |
|---|---|---|
| ✅ | Zip portátil rebuilt em 06/11/2026 | 41,1 MB; Node v26.7.0 embutido; SHA-256 `04068a2c5eb73f257489f940a53ae9e91ea0e5dac8410f5384fe2502ba1c77bb`; smoke test isolado inclui as mudanças recentes. |
| ✅ | Smoke test do zip novo em pasta temporária isolada | Extraído e iniciado com o Node embutido; API autenticada respondeu `v0.2.0`; painel de Uso sem tabela repetida e checagem de vídeo encontrados. Roteiro: `powershell -ExecutionPolicy Bypass -File scripts\smoke-package.ps1`. |
| ⚠️ | Abrir o zip em outro computador sem Node e testar com Smart App Control | Pendente. O smoke test isolado não substitui o teste numa máquina limpa externa. |
| ⚠️ | Instalador `.exe` | Não foi gerado nesta rodada porque Inno Setup 6 não está instalado no ambiente. O `.exe` antigo não foi mantido para evitar distribuir um pacote desatualizado. |
| ⬜ | Novo fluxo visual do instalador | Quatro referências revisadas; especificação em `docs/INSTALADOR-UX.md`. Ainda não implementado/compilado, pois este ambiente não tem Inno Setup 6. |
| ⬜ | Assinatura digital (SignPath Foundation, gratuito para código aberto; ou Azure Artifact Signing; ou certificado pago) | 👤 decidir antes de distribuir instalador `.exe` |
| ⬜ | Teste num computador de outra pessoa, sem nenhuma ferramenta de desenvolvimento | 👤 |

## 3. Atualização do app

O fluxo já existe em Configurações: consulta opcional de Release, aviso, download do pacote do Windows, conferência SHA-256 e instalação com retorno automático se a versão nova não iniciar. Os testes automatizados cobrem versão, Release inválido, falhas de rede, download, hash e fluxo de instalação. Falta validar a versão recém-empacotada em outro computador e publicar o Release correspondente.

## 4. Antes de tornar o repositório público
- ✅ Limpeza feita (sem segredos, e-mail ou caminhos pessoais; histórico novo com e-mail `noreply`).
- ⬜ Ligar *Private vulnerability reporting* no GitHub (o `SECURITY.md` pede isso). 👤
- ⬜ Trocar `<seu-usuario>` nos links do README e do INSTALAR pelo endereço final. 👤
- ⬜ Publicar/atualizar o **Release** (zip + `SHA256SUMS.txt`) e conferir os links da landing mantida fora deste repositório.
- ⬜ Imagem de compartilhamento (social preview) do repositório e da landing.

## 5. Ainda dependem de você
Escolher o supervisor, caminho do `flowapi.baixar_video`, credencial do YouTube, **parear um celular real** (testado só por emulação) e rodar o fluxo com os CLIs de verdade num computador limpo.
