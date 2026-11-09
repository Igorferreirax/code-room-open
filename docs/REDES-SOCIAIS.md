# Redes sociais, rotinas diárias e biblioteca de APIs

## Como funciona
1. **Conexões › Redes sociais**: cadastre as contas (quantas quiser, de qualquer rede). Cada conta tem um **apelido** para mencionar.
2. Em qualquer pedido (chat, equipe, rotina), escreva `+apelido`. Exemplo: `faça o post do dia sobre lendas e poste em +terror-youtube e +terror-bs`.
3. O agente escreve a postagem e o Code Room cria uma **proposta**. Ela aparece no chat como cartão “Aguardando você”, com texto editável e o horário (**Publicar agora** ou **Agendar**).
4. **Nada é publicado sem a sua aprovação, uma por uma.** Agendadas saem no horário **com o Code Room aberto e o computador ligado**.
5. Redes sem publicação automática geram um **pacote pronto** (texto + arquivos) para você copiar e postar; depois marque como postado.

Limites de segurança: no máximo 10 postagens por dia por conta (ajustável até 50); projetos Financeiro nunca postam; senhas e tokens ficam só em `.data/social-secrets.json` (permissão restrita) e não voltam para a tela.

## O que cada rede aceita (levantamento de 09/11/2026)
Fontes em boa parte de terceiros: **confira a documentação oficial antes de depender**, as regras e preços mudam.

| Rede | No Code Room | Observação |
|---|---|---|
| YouTube | publica (vídeo) | usa o login do Google já conectado |
| Bluesky | publica (texto + até 4 imagens) | senha de aplicativo |
| Mastodon | publica (texto + mídia) | token da sua instância |
| Telegram | publica (texto, foto, vídeo) | bot + canal |
| Discord | publica (webhook) | endereço do webhook do canal |
| X | pacote pronto | API paga por uso desde 2026 (cerca de US$ 0,015 por post); free tier descontinuado ou contestado |
| Instagram | pacote pronto | API só para conta profissional + app Meta; vídeo exige endereço público do arquivo |
| Threads | pacote pronto | app Meta; limite alto por dia |
| TikTok | pacote pronto | app não auditado só posta privado, até 5 usuários/dia |
| LinkedIn | pacote pronto | perfil pessoal é viável; páginas exigem aprovação |
| Facebook | pacote pronto | app Meta |

## Rotinas diárias a partir do que você já criou
- Na tela de uma tarefa (**Repetir todo dia**) e no cartão **Você pediu** do chat: abre a rotina já preenchida (projeto, quem executa, objetivo, 08:00 diário). Você ajusta e salva.
- Em **Rotinas › Nova rotina** há modelos (notícias do dia, cursos gratuitos, vagas, post do dia). Eles só preenchem o formulário; troque os trechos entre [colchetes].
- Rotina que pesquisa na internet precisa de um agente com **Pesquisar na web** (só Claude Code; fica bloqueado em projeto Financeiro).
- Os resultados chegam em Entregas e em “Precisa de você agora”.

## Biblioteca de APIs (Conexões)
Guarda chaves de GitHub, OpenAI, Anthropic, Gemini, Groq, OpenRouter, ElevenLabs e outras (só guardar). **Testar e ver consumo** confirma se a chave funciona e mostra o consumo **quando o serviço informa**: GitHub (limite por hora), OpenRouter (gasto e limite), ElevenLabs (caracteres). OpenAI, Anthropic, Gemini e Groq não expõem saldo por chave comum: a tela diz isso e indica onde conferir.
Login por OAuth (sem colar chave) exige registrar um aplicativo seu em cada serviço; é a próxima etapa, por serviço.
