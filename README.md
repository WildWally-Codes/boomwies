# Wiezen & Boomkewies

Belgian whist card games in the browser: **Wiezen**, **Boomkewies** and **Classic Boomke**, against computer players (multiplayer coming).

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine, scoring and hand-sorting tests
npm run build   # static site in dist/
```

## Layout

- `src/engine/` – rules, auctions and scoring as a pure state machine (`createGame`, `applyAction`)
- `src/ai/` – computer players
- `src/ui/` – table rendering, hand sorting and drag-to-reorder
- `src/i18n/` – English and Nederlands strings
- `wiezen.html` – the original single-file prototype (also published as a Claude artifact)

Rules sources: [pagat.com – Boomke Wies](https://www.pagat.com/auctionwhist/boomke-wies.html), [thegameroom.org – Wiezen](https://www.thegameroom.org/wiezen/).
