# Brasa Arena

Jogo de tiro em primeira pessoa **1 contra 1, multiplayer, direto no navegador**.
Partidas curtas, mapa pequeno e simétrico, foco em mira e reflexo.

Tudo é original: mapa, armas, nomes e visual foram feitos do zero, sem copiar nenhum jogo existente.

## Tecnologias

- **Cliente:** TypeScript + Vite + Three.js, Pointer Lock para o mouse e Web Audio para os sons.
- **Servidor:** Node.js + TypeScript com WebSocket (biblioteca `ws`).
- **Servidor autoritativo:** o servidor decide posição, dano, mortes e placar.
- **Código compartilhado:** `shared/` tem tipos, constantes, mapa e física usados pelos dois lados.

## Como rodar localmente

Requisitos: **Node.js 20 ou mais novo** (testado com Node 22).

```powershell
npm install
npm run dev
```

O comando `npm run dev` sobe o servidor (porta 3000) e o cliente (porta 5173) juntos.
Abra **http://localhost:5173** no navegador. Para testar sozinho, abra duas abas:
uma cria a sala e a outra entra com o código.

Outros comandos:

```powershell
npm test            # testes da física, do combate, da compensação de lag e do fim de partida
npm run typecheck   # checagem de tipos do cliente e do servidor
npm run build       # gera dist/ (cliente) e server-dist/ (servidor)
npm start           # roda o build de produção em http://localhost:3000
```

## Como jogar

1. Digite um **apelido** e clique em **Criar sala**. Você recebe um **código de 5 letras**.
2. Seu amigo digita o código em **Entrar na sala**.
3. Quando os dois estiverem na sala, a partida começa. Clique para capturar o mouse.
4. A partida termina com **20 abates** ou quando acabar o **tempo (10 minutos)**. Quem tiver mais abates vence.
5. Na tela final, clique em **Revanche**. A partida recomeça quando os dois aceitarem.

### Controles

| Ação | Controle |
| --- | --- |
| Andar | W A S D |
| Pular | Espaço |
| Agachar | Ctrl |
| Correr | Shift |
| Mirar | Mouse (depois de capturar o mouse) |
| Atirar | Botão esquerdo (segure no rifle; clique na pistola e na faca) |
| Mira com zoom | Botão direito (zoom leve no rifle) |
| Recarregar | R |
| Trocar arma | 1 rifle, 2 pistola, 3 faca, ou roda do mouse |
| Placar | Segure Tab |
| Sair do mouse | Esc |

**Armas:** Rifle Ágil (automático, 30 + 60 balas), Pistola Pulso (semiautomática, 12 + 24 balas) e Faca (corpo a corpo).
Cabeça dá **4x** de dano, tronco **1x** e pernas **0,75x**.

## Deploy no Render (plano Free)

O projeto tem um arquivo `render.yaml` (Blueprint). Ele cria um único Web Service que serve o jogo e o WebSocket na mesma porta, então o jogo fica em um só link.

1. Crie uma conta grátis em **render.com**, entrando com o login do GitHub.
2. Clique em **New > Blueprint** e escolha o repositório **luizmathias1/games**.
3. Espere o deploy terminar e copie o link `.onrender.com` que aparece.
4. Mande o link para seu amigo, crie a sala e passe o código.

Depois disso, todo `git push` na branch `main` gera um novo deploy automático.

Observações sobre o plano Free:

- O serviço desliga depois de cerca de 15 minutos sem tráfego e leva cerca de 1 minuto para ligar de novo. O jogo mostra **"Conectando ao servidor..."** e tenta reconectar sozinho.
- O endereço `/health` responde `ok` e é usado pelo Render para checar se o serviço está no ar.

## Estrutura do projeto

```
client/          cliente (Vite + Three.js)
  src/           cena, física visual, HUD, rede, sons, arma em primeira pessoa
  index.html
server/          servidor (Node + ws)
  src/           salas, lobby, combate, lag compensation, rotas HTTP
shared/          código comum: config.ts (ajustes), map.ts, physics.ts, hitbox.ts, protocol.ts
dist/            build do cliente (gerado)
render.yaml      configuração do deploy no Render
```

## Ajustando o jogo

Os números do jogo (velocidade, dano, cadência, munição, tempo de partida) ficam em **`shared/config.ts`**.
Por exemplo, para mudar o dano do rifle, edite `WEAPONS.rifle.damage`.

## Limitações conhecidas

- Não há contas nem ranking: basta o código da sala.
- Cada sala tem no máximo 2 jogadores (1 contra 1).
- O modelo dos jogadores é provisório (cápsula com visor), e os sons são gerados por código.
