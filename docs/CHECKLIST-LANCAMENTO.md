# Checklist de lançamento (Code Room 0.2.2)

Marque cada item antes de divulgar. **[x]** = já verificado (com a data); **[ ]** = falta testar.

## 1. Instalação e atualização
- [ ] Zip portátil em uma máquina limpa (sem Node, sem Code Room): extrair e abrir `Iniciar-Code-Room.cmd`.
- [ ] Atualização 0.2.1 → 0.2.2 pelo botão **Atualizar**, dentro de um app instalado de verdade.
- [ ] Ícone da área de trabalho: dois cliques, com e sem outro Code Room aberto (porta ocupada).
- [ ] Desinstalar pelo Windows (Configurações › Aplicativos) e conferir que os dados do usuário ficam.
- [x] Pacote portátil sobe isolado e responde v0.2.2 (fumaça do pacote, 07/11).
- [x] Atualizador simulado: baixa, confere SHA-256, aplica e volta atrás se falhar, 28 de 28 (07/11).
- [x] Hashes do zip e do Setup.exe publicados batem com os arquivos baixados (07/11).

## 2. Uso real com as IAs (gasta cota)
- [ ] Primeiro uso guiado: detectou Codex, Claude Code e Gemini e mostrou o login certo.
- [ ] Uma missão pequena com cada IA, com a entrega indo para aprovação.
- [ ] Repasse entre dois agentes e uma equipe (desenvolvedor → revisor).
- [ ] Assistente executando uma ação (criar agente) depois do clique de confirmação.
- [ ] Rotina por horário e pasta de entrada (lote) rodando de verdade.
- [x] Fluxos com IA simulada e comandos locais do Assistente (testes automáticos, 07/11).

## 3. Celular
- [ ] Pareamento por Tailscale no Android (guia: `docs/CELULAR-PROMPT.md`).
- [ ] Uso pelo celular fora de casa, no 4G.
- [ ] Revogar o aparelho pelo computador e conferir que o celular perde o acesso.
- [x] Layout do celular sem estouro de largura em todas as telas (07/11).

## 4. Landing e repositório
- [x] SEO: título, descrição, canonical, Open Graph, Twitter, JSON-LD, `robots.txt`, `sitemap.xml` (07/11).
- [x] Imagem de compartilhamento 1200×630 e ícone da Apple (07/11).
- [x] Imagens em WebP: a página caiu de 2,7 MB para cerca de 1,4 MB (07/11).
- [x] Acessibilidade (axe-core, regras WCAG 2 A/AA e boas práticas): 0 violações em desktop e celular (07/11).
- [x] Todos os links do README, da Release e da landing respondem (07/11).
- [x] CI verde, descrição e tópicos do repositório (07/11).
- [ ] Colar o link da landing no WhatsApp, LinkedIn e X e conferir a prévia (imagem e título).
- [ ] Ler o README e a landing como alguém que nunca viu o projeto.

## 5. Divulgação
- [ ] Trilha sonora do Reel escolhida e aplicada.
- [ ] Texto do vídeo bate com o app de hoje (não prometer instalador assinado nem recursos que não existem).
- [ ] Descrição, tags e links do YouTube conferidos (landing e GitHub).
- [ ] Capa e legenda do Instagram, TikTok, Shorts e LinkedIn (`legendas.md`).
- [ ] Pasta de divulgação revisada: nenhum dado pessoal na tela gravada.

## 6. Antes de apertar o botão
- [ ] Assinar o `Setup.exe` (`docs/ASSINATURA.md`) **ou** manter o zip como recomendação principal (já está assim na landing).
- [ ] Decidir sobre os PRs do Dependabot (actions) e os dois processos `node` antigos de 06/11.
- [ ] Avisar quem vai testar de que o Windows pode avisar ao abrir o `Setup.exe`.
