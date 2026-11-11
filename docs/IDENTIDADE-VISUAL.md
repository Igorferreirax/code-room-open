# Identidade visual do Code Room

Este arquivo registra o padrão usado pelas fontes do repositório. A landing page fica em outro repositório (`Code Room Landing`) e usa os mesmos arquivos de marca.

## Padrão atual (desde a 0.3.4)

- **Nome:** `Code Room`, sempre escrito em duas palavras. No cabeçalho do app, `Room` recebe a cor de destaque.
- **Símbolo:** o personagem pixel sentado com o notebook, entre a planta e a lanterna, num quadrado escuro de cantos arredondados com borda azul. Arquivos: `public/assets/icon-512.png` (mestre), `icon-256.png`, `favicon.png`, `installer/code-room.ico` e `installer/code-room.png`.
- **Logo horizontal:** o símbolo com o nome em letras pixel, a barra azul antes e o cursor laranja depois (`public/assets/logo-wide.png` e `docs/img/logo-wide.png`). Usada no login do app e no topo do README. Sempre com `alt="Code Room"`.
- **Banner da tela inicial:** recorte largo da cena da sala (`public/assets/home-banner.webp`), acima da caixa de conversa.
- **Tipografia do app:** `Segoe UI Variable Display`, com fallback para `Segoe UI`, `system-ui` e fontes sans-serif do sistema. O corpo usa `Segoe UI Variable Text` e o mesmo fallback.
- **Cores base do tema noite:** fundo `#08101f`, superfície `#0b1527`, texto `#e8eefc`, azul `#2b7bff` e azul claro `#4a8fff`. O laranja da lanterna e do cursor (`#f5a524`) é o segundo destaque, usado com moderação.
- **Logos de terceiros:** OpenAI/Codex, Claude e Gemini vêm da coleção Simple Icons (CC0); a do Antigravity é a que acompanha o próprio programa. Ficam em `public/brand-icons.js` e servem só para identificar a integração.

## Aplicação

- Arte em pixel: sempre `image-rendering: pixelated` ao ampliar.
- Para regerar os ícones depois de trocar `icon-512.png`: `python installer/make-brand-icons.py` (também atualiza o favicon da landing, se a pasta existir) e `python installer/make-wizard-images.py` (imagens do instalador).
- Os arquivos originais em alta resolução ficam fora do repositório, na pasta de design do autor.
