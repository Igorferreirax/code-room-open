# Checklist de lançamento da v1

Atualizado em 06/11/2026. ✅ verificado · ⚠️ verificado com ressalva · ⬜ falta · 👤 depende do dono do projeto.

## 1. Testes automáticos (rodam sem gastar cota de IA)
| | Verificação | Resultado |
|---|---|---|
| ✅ | `npm test` (backend e telas) | 87 de 87 |
| ✅ | `npm run audit` (27 ataques reais: chave, Host/Origin forjados, travessia de pasta, vazamento da chave...) | 27 de 27 |
| ✅ | `npm run check` (sintaxe) | 62 de 62 |
| ✅ | `npm run test:onboarding` (triagem das IAs e tutorial, desktop e celular) | 27 de 27 |
| ⚠️ | `npm run test:ui` (12 telas, desktop e celular) | 113 de 114: o teste de **toque do Canvas** (arrastar do ponto de saída com o dedo) é intermitente. Já falhava antes das mudanças recentes. |

## 2. Pacote Windows
| | Verificação | Resultado |
|---|---|---|
| ✅ | Zip portátil em pasta limpa, **sem Node instalado**, arquivos marcados como baixados da internet, Smart App Control ligado | sobe com o Node embutido, dados em `%LOCALAPPDATA%\CodeRoom\data`, não abre um 2º serviço, fecha direito |
| ✅ | Atalhos (área de trabalho e menu Iniciar) criados e removidos; pergunta única no primeiro uso | ok |
| ⚠️ | Instalador `.exe` | **compila**, mas **nunca foi executado**: o Smart App Control do Windows 11 bloqueia instalador sem assinatura digital (sem opção de executar assim mesmo). Recomendação: publicar o zip primeiro e o `.exe` só depois de assinado. |
| ⬜ | Assinatura digital (SignPath Foundation, gratuito para código aberto; ou Azure Artifact Signing; ou certificado pago) | 👤 decidir |
| ⬜ | Teste num computador de outra pessoa, sem nenhuma ferramenta de desenvolvimento | 👤 |

## 3. Atualização: "tem versão nova? Atualizar"
**Hoje não existe.** O app só mostra a versão no rodapé (`v0.2.0`). Como os dados ficam fora da pasta do programa, trocar a versão não apaga projetos, agentes nem histórico.

Proposta (ainda não construída):
1. **Verificação:** o *serviço* (não o navegador) consulta o último Release público do repositório no GitHub ao abrir e a cada 12 horas, com tempo limite de 5 s e falha silenciosa (sem internet, nada acontece). Só vai um pedido simples ao GitHub (seu IP e o nome do app); nenhum dado seu. Um interruptor em **Configurações** permite desligar.
2. **Aviso:** faixa “Nova versão 0.x.y disponível · Ver novidades · **Atualizar**”. Não oferece versão igual nem menor (sem *downgrade*).
3. **Atualizar (primeira versão):** baixa o zip do Release, **confere o SHA-256** publicado no Release, e abre a pasta para você trocar. **Atualizar em um clique (depois):** um script auxiliar espera o serviço fechar, troca a pasta do programa, mantém os dados e reabre.
4. **Segurança:** só aceita arquivos do próprio repositório; recusa se o SHA-256 não bater; quando houver assinatura digital, confere também.

Como vamos testar (antes de lançar):
- Comparação de versões: `0.2.0 < 0.2.1 < 0.10.0`, versões *pre-release*, versão igual e menor.
- Um servidor de Releases **falso** (variável `CODE_ROOM_RELEASES_URL`) para simular: sem internet, resposta lenta, resposta inválida, interruptor desligado, nota de versão com HTML malicioso (deve ser escapada).
- Ponta a ponta: instalar a 0.2.0 do zip, publicar uma 0.2.1 falsa, ver o aviso, atualizar, e conferir que **projetos, agentes e chave continuam** e que a versão mudou.

## 4. Antes de tornar o repositório público
- ✅ Limpeza feita (sem segredos, e-mail ou caminhos pessoais; histórico novo com e-mail `noreply`).
- ⬜ Ligar *Private vulnerability reporting* no GitHub (o `SECURITY.md` pede isso). 👤
- ⬜ Trocar `<seu-usuario>` nos links do README e do INSTALAR pelo endereço final. 👤
- ⬜ Criar o primeiro **Release** (zip + `SHA256SUMS.txt`) e preencher os links em `js/config.js` da landing.
- ⬜ Imagem de compartilhamento (social preview) do repositório e da landing.

## 5. Ainda dependem de você
Escolher o supervisor, caminho do `flowapi.baixar_video`, credencial do YouTube, **parear um celular real** (testado só por emulação) e rodar o fluxo com os CLIs de verdade num computador limpo.
