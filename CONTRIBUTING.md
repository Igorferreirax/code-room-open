# Como contribuir

Obrigado por querer ajudar. O Code Room é um projeto aberto (licença MIT).

## Antes de começar
- Abra uma *issue* descrevendo o problema ou a ideia, para combinarmos antes de você investir tempo.
- Leia o [README](README.md), o [roadmap](docs/ROADMAP.md) e o [backlog](docs/BACKLOG.md).
- Vulnerabilidades: não abra issue pública. Veja o [SECURITY.md](SECURITY.md).

## Ambiente
- Windows 10 ou 11, Node.js 24 ou superior. Não há dependências para instalar (`package.json` não tem pacotes).
- `npm test`, `npm run audit` e `npm run check` devem passar antes de qualquer *pull request*.
- `npm run test:ui` precisa de Chrome e Playwright para Python. O teste de toque do Canvas é intermitente (já conhecido).

## Regras do projeto
- **Nunca invente valores.** Dado ausente aparece como “indisponível”, nunca como zero.
- **Nada de segredos** no código, nos testes, nos prints nem nos logs. A chave de acesso (`.data/access.key`) nunca é versionada.
- **Testes de verdade.** Mudança de comportamento traz teste. Não marque como testado o que só foi lido ou simulado.
- **Português do Brasil** na interface e nos textos, com acentuação correta.
- Sem dependências novas sem uma boa razão: o projeto é propositalmente leve.
- Testes não podem chamar provedores de IA nem gastar cota.

## Pull request
1. Faça um fork e crie uma branch.
2. Mudanças pequenas e focadas, com mensagem de commit clara.
3. Descreva o que mudou, como testou e o que não conseguiu verificar.
