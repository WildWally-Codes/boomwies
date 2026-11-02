# Wiezen & Boomkewies

Belgian whist card games in the browser: **Wiezen**, **Boomkewies** and **Classic Boomke**, alone against computer players or with up to three friends.

**Play:** https://wildwally-codes.github.io/boomwies/

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine, scoring and hand-sorting tests
npm run build   # static site in dist/ (deployed to GitHub Pages on every push to main)
npm run build:artifact   # single-player single-file page in artifact/ (for the Claude artifact)
```

## Multiplayer

Peer-to-peer over WebRTC (PeerJS), no game server. The host's browser runs the rules and the computer players, checks every move, and sends each guest only their own cards. Friends join with the table code or the invite link (`?join=CODE`); empty seats are computer players. A guest who drops out is replaced by the computer after 30 seconds and gets the seat back on rejoining. If the host leaves, the game pauses and can be resumed from the host's main menu.

Optional build-time settings (`.env` file or CI secrets):

| Variable | Purpose |
|---|---|
| `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS` | TURN relay for players on networks that block direct connections |
| `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH` | self-hosted PeerJS broker instead of the free public one |

## Layout

- `src/engine/` – rules, auctions and scoring as a pure state machine (`createGame`, `applyAction`)
- `src/ai/` – computer players (levels, aggression, background worker)
- `src/net/` – hosting and joining tables over PeerJS
- `src/ui/` – table rendering, hand sorting and drag-to-reorder
- `src/i18n/` – English and Nederlands strings

Rules sources: [pagat.com – Boomke Wies](https://www.pagat.com/auctionwhist/boomke-wies.html), [thegameroom.org – Wiezen](https://www.thegameroom.org/wiezen/).
