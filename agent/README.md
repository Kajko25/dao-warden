# DAO-WARDEN — agent (Etap 3: rdzeń deterministyczny + Etap 4: warstwa LLM)

Agent w TypeScript + Viem, który obserwuje `DAOGovernor` na Arc Testnet, dekoduje instrukcje
propozycji i ocenia ich ryzyko **na twardych, deterministycznych regułach**. Warstwa LLM
(Claude Haiku 4.5) dokłada analizę semantyczną — porównuje narrację opisu z realnym działaniem.

## Uruchomienie

```bash
npm install
npm run scan     # przeszukuje historyczne propozycje i ocenia je (test na WGIP-1)
npm run watch    # nasłuch na żywo: każda nowa propozycja oceniana natychmiast
```

Adresy kontraktów czyta z `../docs/deployed.json`, RPC + `ANTHROPIC_API_KEY` z `../.env`.
Warstwa LLM włącza się automatycznie, gdy `ANTHROPIC_API_KEY` jest ustawiony; bez klucza
agent działa w trybie czysto deterministycznym.

## Jak działa (potok)

1. **Listener** (`index.ts` / `scan.ts`) — event `ProposalCreated` z Governora.
2. **Parser** (`decode.ts`) — dekoduje `targets/values/calldatas` na ustrukturyzowane intencje;
   rozpoznaje `Treasury.withdraw(asset,to,amount)` (selektor `0xd9caed12`), resztę oznacza `unknown`.
3. **Scoring** (`risk.ts`) — deterministyczne reguły, wynik 0–100 → LOW/MEDIUM/HIGH/CRITICAL.

## Reguły ryzyka (wagi)

| Kod | Waga | Znaczenie |
|---|---|---|
| `TREASURY_SPEND` | +30 | propozycja rusza środki ze skarbca |
| `TREASURY_FRACTION` | +0..40 | proporcjonalnie do % salda skarbca, jaki wyprowadza (100% = +40) |
| `SELF_DEALING` | +15 | odbiorca wypłaty == proponujący |
| `PROPOSER_MEETS_QUORUM` | +15 | proponujący sam ma siłę głosu ≥ kworum (może przepchnąć sam) |

Progi: ≥70 CRITICAL, ≥45 HIGH, ≥25 MEDIUM, inaczej LOW.

## Ważna decyzja: ocena na stanie z momentu propozycji

Agent czyta stan on-chain (saldo skarbca, siłę głosu, supply) **na bloku powstania propozycji**,
a nie bieżący. Bez tego, gdy skanujemy po dokonanym drenażu, saldo skarbca = 0 i reguła
`TREASURY_FRACTION` fałszywie spadłaby do zera. `scan` ocenia więc na `log.blockNumber`, a `watch`
(na żywo) ocenia stan bieżący = stan w chwili wykrycia.

## Warstwa LLM (Etap 4) — `llm.ts`

Claude **Haiku 4.5** (`claude-haiku-4-5`) przez `@anthropic-ai/sdk`, structured outputs
(`output_config.format` + json_schema). Wejście: opis propozycji + zdekodowane intencje.
Wyjście: `{ verdict: MATCH|MINOR_DISCREPANCY|MAJOR_MISMATCH, mismatchScore 0-100, redFlags[], reasoning }`.
Wykrywa „ładny opis vs realny drenaż" — intencję, której twarde reguły nie widzą. Uzupełnia
rdzeń, nie zastępuje go.

## Weryfikacja

`npm run scan` na propozycji ataku WGIP-1:
- **Rdzeń deterministyczny → CRITICAL 100/100**: TREASURY_SPEND +30, TREASURY_FRACTION +40
  (100% skarbca), SELF_DEALING +15, PROPOSER_MEETS_QUORUM +15 (atakujący 50 000 WGOV = 5× kworum).
- **Warstwa LLM → MAJOR_MISMATCH 85/100**: „grant operacyjny na rozwój ekosystemu" maskuje transfer
  100% skarbca na adres wnioskodawcy — rozpoznane jako sygnatura ataku BONK.

## Reakcja agenta (Etap 5) — `decide.ts` + `react.ts` + `wallet.ts`

Agent nie tylko wykrywa — **działa**. `decide.ts` łączy werdykt rdzenia i LLM w decyzję
(VOTE_NO gdy score≥45 LUB LLM=MAJOR_MISMATCH); `react.ts` oddaje głos NIE (support=0) siłą
oddelegowaną przez uczciwych posiadaczy; `wallet.ts` trzyma klienta portfela agenta (`AGENT_PRIVATE_KEY`).

Demo end-to-end (szybki wariant DAO):
```bash
DEPLOYED_FILE=deployed-fast.json npm run stage5
```
Wynik: atakujący ZA 50k, agent NIE 100k → propozycja **DEFEATED**, skarbiec nietknięty.
Bez agenta (Etap 2) ten sam atak opróżnił skarbiec. `DEPLOYED_FILE` przełącza agenta między
wariantem realistycznym (`deployed.json`) a szybkim (`deployed-fast.json`).
