# Identidade visual do Code Room

Este arquivo registra o padrão usado pelas fontes do repositório. A landing page é mantida separadamente; aplicar mudanças nela exige a fonte correspondente.

## Padrão atual

- **Nome:** `Code Room`, sempre escrito em duas palavras. No cabeçalho do app, `Room` recebe a cor de destaque.
- **Tipografia do app:** `Segoe UI Variable Display`, com fallback para `Segoe UI`, `system-ui` e fontes sans-serif do sistema. O corpo usa `Segoe UI Variable Text` e o mesmo fallback.
- **Cores base do tema noite:** fundo `#08101f`, superfície `#0b1527`, texto `#e8eefc`, azul `#2b7bff` e azul claro `#4a8fff`. Os temas claro e amanhecer podem variar a paleta sem trocar o nome ou o símbolo.
- **Símbolo usado hoje:** monograma `CR`, produzido por `installer/make-brand-icons.py`. O app usa `public/assets/favicon.png`; o instalador usa `installer/code-room.ico` e os selos do wizard. O gerador também atualiza o favicon da landing quando a pasta local `../Code Room Landing/assets/marca` existe.
- **Mascote e pixel art:** elementos da interface e do Assistente, não substitutos do nome ou do símbolo da marca.

## Aplicação

Ao atualizar a marca, gere todos os tamanhos pelo mesmo script e mantenha o lockup como texto real para acessibilidade, tradução e redimensionamento. Evite embutir o nome em PNGs separados para app, landing e instalador.

O símbolo porta/CR produzido anteriormente é uma direção possível para a próxima versão do logo, mas ainda precisa ser convertido em arquivo vetorial limpo e aplicado às três fontes. Até isso acontecer, mantenha o monograma atual e não misture os dois símbolos no mesmo release.
