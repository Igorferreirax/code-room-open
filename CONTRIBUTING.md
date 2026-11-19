# Como contribuir

Obrigado por querer ajudar. O Code Room é um projeto aberto (licença MIT).

## Antes de começar
- Abra uma *issue* descrevendo o problema ou a ideia, para combinarmos antes de você investir tempo.
- Leia o [README](README.md), o [roadmap](docs/ROADMAP.md) e o [backlog](docs/BACKLOG.md).
- Vulnerabilidades: não abra issue pública. Veja o [SECURITY.md](SECURITY.md).

## Ambiente
- Windows 10 ou 11, Node.js 24 ou superior. Não há dependências para instalar (`package.json` não tem pacotes).
- `npm test`, `npm run audit` e `npm run check` devem passar antes de qualquer *pull request* (o CI do GitHub roda os três no Windows).
- `npm run test:ui` precisa de Chrome e Playwright para Python. O teste de toque do Canvas é intermitente (já conhecido).

## Regras do projeto
- **Nunca invente valores.** Dado ausente aparece como “indisponível”, nunca como zero.
- **Nada de segredos** no código, nos testes, nos prints nem nos logs. A chave de acesso (`.data/access.key`) nunca é versionada.
- **Testes de verdade.** Mudança de comportamento traz teste. Não marque como testado o que só foi lido ou simulado.
- **Português do Brasil** na interface e nos textos, com acentuação correta.
- Sem dependências novas sem uma boa razão: o projeto é propositalmente leve.
- Testes não podem chamar provedores de IA nem gastar cota.
- **Privacidade:** um pull request que adiciona ou muda algo que **sai do computador** (chamada de rede, envio a uma IA, nova chave guardada) atualiza [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md) no mesmo PR. A revisão confere a lista contra o código.
- Tudo que age fora do app (publicar, instalar em outra IA, rodar programa) **vem desligado** e exige o “sim” da pessoa.

## Pull request
1. Faça um fork e crie uma branch.
2. Mudanças pequenas e focadas, com mensagem de commit clara.
3. Descreva o que mudou, como testou e o que não conseguiu verificar.

## Corrigir com a sua própria IA
O Code Room foi feito para ser melhorado pelas IAs de quem usa. O caminho seguro:
1. Em **Configurações › Contribuir**, relate a falha ou a ideia (abre uma *issue* já preenchida no GitHub; você confere antes de enviar).
2. Faça uma cópia (fork) e trabalhe nela, nunca na instalação que você usa no dia a dia:
   ```
   gh repo fork Igorferreirax/code-room-open --clone
   cd code-room-open
   git switch -c correcao-curta
   ```
3. Cadastre essa pasta como um projeto no Code Room e peça a correção ao seu agente (ou use o terminal com a sua IA). Rode `npm test`, `npm run audit` e `npm run check`.
4. Envie a proposta: `gh pr create --repo Igorferreirax/code-room-open --fill`.
5. O mantenedor revisa cada proposta antes de qualquer versão sair. Aprovada, ela entra no `main` e você aparece como contribuidor do projeto no GitHub.
