# DAO-WARDEN

Agent-strażnik DAO na **Arc Testnet** wykrywający *governance attacks* — ataki, w których ktoś kupuje większość głosów i przepycha propozycję drenującą treasury (odpowiednik ataku na BONK DAO z lipca 2026: przegłosowanie propozycji przy skrajnie niskiej frekwencji, bez exploita kodu, przez normalny mechanizm głosowania).

Odtwarzamy **klasę podatności** BONK na EVM (vote-buying, niskie kworum, brak timelocka) — nie kopiujemy kodu z Solany.

## Sieć (zweryfikowane empirycznie 2026-07-12)

| Parametr | Wartość |
|---|---|
| Chain | Arc Testnet (Circle) |
| chainId | `5042002` (hex `0x4cef52`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `testnet.arcscan.app` |
| Czas bloku | ~0.5 s |
| Gas token | USDC (natywny) |

## Stack

- **Kontrakty:** Solidity 0.8.28 + OpenZeppelin Contracts v5.6.1 (ERC20Votes, Governor, TimelockController), Foundry.
- **Zegar Governora:** tryb **timestamp** (`mode=timestamp`) — okresy głosowania w sekundach, odporne na blok 0.5 s.
- **Agent:** TypeScript + Viem (Etap 3+).
- **LLM:** Claude API (model Haiku) — klucz wyłącznie ze zmiennej środowiskowej (Etap 4).
- **Tożsamość/audyt:** ERC-8004 IdentityRegistry + IPFS (Etap 6).

## Struktura

```
src/        kontrakty (GovToken, Treasury, DAOGovernor, mocks)
test/       testy Foundry (golden test ataku)
script/     skrypty deployu
agent/      agent TS + Viem (Etap 3+)
docs/       notatki i decyzje projektowe
```

## Mapa etapów

- [x] **Etap 0** — środowisko, repo, OZ, konfiguracja Arc
- [ ] **Etap 1** — kontrakty podatnego DAO + testy lokalne *(w toku)*
- [ ] **Etap 2** — deploy na Arc + symulacja ataku end-to-end (golden test on-chain)
- [ ] **Etap 3** — agent: rdzeń deterministyczny (listener + parser + scoring)
- [ ] **Etap 4** — warstwa LLM (Claude): narracja vs realne instrukcje
- [ ] **Etap 5** — reakcja agenta (delegacja + głos NIE)
- [ ] **Etap 6** — tożsamość ERC-8004 + audyt + reputacja
- [ ] **Etap 7** — mitygacja: redeploy z timelockiem, dowód powstrzymania ataku

## Zasoby z poprzednich prac (`/home/kajko/arc-testnet-hello`)

- **Wallet B** `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D` (~13.5 USDC gas) — deployer, klucz w `arc-testnet-hello/.env` jako `PRIVATE_KEY`.
- Działający `CIRCLE_API_KEY` + `ENTITY_SECRET`, portfele DCW (custody Circle) — w odwodzie.
