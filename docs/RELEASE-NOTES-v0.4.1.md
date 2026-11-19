# Code Room 0.4.1

Correção de segurança sobre a 0.4.0.

## O que mudou
- A regra de quem pede (celular ou acesso de fora) agora é checada sobre a mesma ação que vai executar, antes de qualquer efeito — sem diferença entre conferir e aplicar.
- O celular não pode mais disparar as ações que rodam agentes ("comparar IAs", "criar rotina" e "gerenciar rotina").

## Testes
- 537 testes: 536 aprovados. A única falha é instável (teste de reinício, sem relação com estas mudanças — passou 2x seguidas na repetição, 11/0).
