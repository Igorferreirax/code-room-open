# Roadmap final: últimas verificações até a entrega pública

Legenda: ✅ feito · 🔄 em andamento · ⬜ a fazer · 👤 depende do Igor

## A. Qualidade (eu faço)
1. ✅ Rodar tudo de novo: testes do servidor, `crawl_ui`, `ui_assistant`, `ui_providers`, `ui_smoke`, `audit-security`.
2. ⚠️ Toque no Canvas: passou nas últimas rodadas (114/114), mas continua intermitente sob carga; não marcado como resolvido.
3. ✅ Conferir no navegador a tela de Acesso remoto (botão Diagnosticar, QR com IP do Tailscale), em largura de celular.
4. ✅ Limpeza dos temporários do desenvolvimento (TEMP, pastas de teste, processos presos nas portas 4798/4799).

## B. Pacote e instalador (eu faço)
5. ✅ Reconstruir zip portátil e `Setup.exe` com o código atual (`installer/build.ps1`), gerar `SHA256SUMS.txt`.
6. ✅ Teste de fumaça do pacote (`scripts/smoke-package.ps1`: OK). ⬜ `installer/test-update.ps1` ainda não rodou com o pacote novo.
7. ✅ Conferir links e SHA-256 da landing contra os arquivos reconstruídos.

## C. Landing (eu faço)
8. ✅ Revisão final da landing: canonical, Open Graph, Twitter card, JSON-LD (aplicativo + FAQ), robots.txt e sitemap; sem erro de console, sem rolagem lateral, um só "Baixar" e links do Release corretos em 390 e 1440 px.
9. ⬜ Garantir que o domínio de produção publique a landing nova (não o app).

## D. Publicação 👤
10. ✅ Repositório público (auditado: sem chaves, e-mails ou IPs pessoais no código nem no histórico).
11. ✅ Release v0.2.0 publicado; downloads e SHA-256 conferidos.
12. ✅ Landing nova em produção (code-room-coral.vercel.app); botões conferidos.
13. 👤 Vincular o domínio .com.br da Bytelab.

## E. Depois da entrega (backlog)
- Acesso remoto: depurar com o Igor no celular (rede local e Tailscale).
- Sessão ao vivo por tarefa no chat; Git integrado; limpeza/retenção com prévia; receitas salvas.
- Servidor MCP, ferramentas locais (HyperFrames), Hermes na VPS, várias janelas de chat.
- Assinatura digital do Setup.exe (SignPath) para o Smart App Control.
- Teste real com vídeos e com o agente de postagem do YouTube.
- Quando tocar projetos reais só por dentro do Code Room: avisar o Igor.
