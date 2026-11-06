# Segurança

## Como o Code Room se protege
- O serviço escuta **somente em `127.0.0.1`**. Acesso por rede local ou Tailscale vem desligado e só liga em Configurações › Acesso, nos endereços exatos liberados.
- Toda chamada à API exige a **chave de acesso** (`.data/access.key`). Pedidos com `Host` ou `Origin` forjados são recusados.
- Cada celular pareado tem **token próprio** (guardado como hash), revogável, com menos poder que o dono. Tentativas erradas vindas de fora do computador são bloqueadas.
- O Code Room usa os CLIs já logados no seu computador e **não guarda nem mostra credenciais**.
- `npm run audit` roda 27 ataques reais contra um serviço isolado (chave errada, `Host`/`Origin` forjados, travessia de pasta, vazamento da chave, ids maliciosos, corpo gigante, escuta fora do 127.0.0.1).

## Reportar uma vulnerabilidade
**Não abra uma issue pública.** Use o recurso de relatório privado de vulnerabilidades do GitHub (aba *Security › Report a vulnerability*) neste repositório. Descreva o que encontrou, como reproduzir e o impacto. Respondemos assim que possível.

## Limites que você deve conhecer
- O Code Room executa agentes de IA que podem **ler e escrever arquivos** nos projetos que você autoriza. Use projetos confiáveis e o modo somente leitura quando não precisar de escrita.
- Quem tem a chave de acesso controla o Code Room. Não a compartilhe nem a envie em mensagens, prints ou issues.
