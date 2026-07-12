# DAO-WARDEN — dziennik sesji i stan odzyskiwania

> Ten plik pełni dwie role: (1) **sekcja LIVE u góry** — co dzieje się właśnie teraz i jak
> dokończyć, gdyby komputer się wyłączył; (2) **dziennik** — chronologiczny zapis prac
> (materiał także do prezentacji, patrz `PITCH.md`).

---

## 🟢 STAN LIVE (na 2026-07-12) — 🎉 ETAP 7 UKOŃCZONY ON-CHAIN. CAŁA ROADMAPA (0-7) GOTOWA.

**Ukończone: Etapy 0, 1, 2, 3, 4, 5, 6, 7 — wszystkie wdrożone i zweryfikowane na Arc.** Nic nie
działa w tle. Zostały tylko rzeczy „kosmetyczne" do finalnego pokazu dla komisji (patrz na dole).

**Etap 7 — deploy + dowód E2E on-chain (2026-07-12):**
- Wdrożono wariant **timelocked-fast** (`docs/deployed-timelocked.json`): GovToken
  `0x32Ebc2098E99904047303FbBDda8C93FA255ad5A` · **Timelock `0x5fB14e2398E53d15E044b770B8aCB67FDa04337f`**
  (minDelay 120s) · DAOGovernor `0x641181a13c3114392e40fB4dc0785ACE279E9c1E` · Treasury
  `0xB565228545e798495F10330685779eB5C2b639f4` (owner = timelock) · MockAsset
  `0x5907970226D869A4195EE0245ba5E16c35B10c7b`. Role: Governor=PROPOSER, agent=CANCELLER, deployer
  zrzekł się admina. Wszystko potwierdzone `cast`.
- **Dowód E2E (`DEPLOYED_FILE=deployed-timelocked.json npm run stage7`):** scenariusz, w którym uczciwi
  są apatyczni → **atak WYGRYWA głosowanie** (Succeeded), trafia do kolejki timelocka (Queued), a agent
  (rdzeń CRITICAL 100/100 + LLM MAJOR_MISMATCH 85/100 → VOTE_NO) **anuluje operację w oknie minDelay**
  (tx `0x0b4265cd43…`) → **stan Canceled, skarbiec 1,000,000 mUSD nietknięty, `execute` odrzucone.**
  To dowodzi DRUGIEJ warstwy obrony — działa nawet gdy pierwsza (głos, Etap 5) jest nieaktywna.

**Etap 7 — kod (2026-07-12):**
- `src/DAOGovernorTimelocked.sol` — wariant zmitygowany: JEDNA zmiana wzgl. podatnego = egzekucja
  przez `GovernorTimelockControl`. Kworum 1% i próg 0 CELOWO bez zmian (czysty dowód: broni sam timelock).
- `test/TimelockDefense.t.sol` — golden test mitygacji, **5/5 PASS**. Cztery dowody: (1) po Succeeded
  brak natychmiastowej egzekucji (koniec „drenażu w 1 tx" z Etapu 2), (2) **agent z CANCELLER_ROLE
  anuluje w oknie minDelay → Canceled, skarbiec cały** (sedno), (3) uczciwie: bez anulowania atak wchodzi
  po minDelay (samo opóźnienie to nie obrona — timelock i agent są komplementarne), (4) legalne
  propozycje działają normalnie. Cała suita repo: **21/21**.
- `script/DeployTimelockedDAO.s.sol` — deploy wariantu (fast, minDelay 120s); skarbiec → owner = timelock,
  Governor dostaje PROPOSER_ROLE, agent CANCELLER_ROLE, deployer zrzeka się admina.
- Agent: `agent/src/cancel.ts` (liczy salt/opId jak GovernorTimelockControl — **salt zweryfikowany
  numerycznie zgodny z Solidity**, anuluje operację), `stage7-demo.ts` (`npm run stage7`), `abi.ts`
  rozszerzone o queue/timelock/TimelockController, `config.ts` czyta opcjonalny `Timelock`. tsc czysto.
- Estymata gazu (z `test_MeasureTimelockedDeployGas`): Timelock 1.44M + Governor 3.60M + wiring 0.06M
  + Treasury 0.25M + GovToken 1.62M + MockERC20 0.46M + mint/transfery ≈ **~7.6M gas ≈ ~0.15 USDC**.

**➡️ NASTĘPNY KROK: roadmapa techniczna 0-7 zamknięta.** Zostały opcje na finalny pokaz dla komisji:
(a) spiąć narrację w `PITCH.md` (mamy komplet: baseline atak z Etapu 2, obrona głosem z Etapu 5, obrona
timelockiem z Etapu 7, tożsamość/audyt ERC-8004 z Etapu 6); (b) ewentualnie odtworzyć pełny cykl na
realistycznym (~1h) wariancie zamiast fast; (c) rozważyć przypięcie AgentCard do publicznego IPFS.
Nic z tego nie jest wymagane do działania — rdzeń jest kompletny i udowodniony on-chain.

---

### (poprzedni stan LIVE — archiwum)
**Ukończone: Etapy 0, 1, 2, 3, 4, 5, 6.** Nic nie działa w tle — nic nie wisi, nie trzeba niczego
pilnować. Można bezpiecznie wyłączyć komputer.

**Gdzie jesteśmy (skrót dla szybkiego wznowienia):**
- Zbudowany i wdrożony na Arc **podatny DAO** (kworum 1%, próg 0, brak timelocka) — dwie instancje:
  realistyczna (`deployed.json`, cykl ~1h, na finalny pokaz) i szybka (`deployed-fast.json`, cykl ~35s,
  do iterowania Etapów 5-7).
- **Agent** (TypeScript+Viem, katalog `agent/`) w pełni działa: wykrywa ataki (rdzeń deterministyczny +
  warstwa LLM Claude Haiku) I reaguje (głosuje NIE oddelegowaną siłą).
- **Udowodniony kontrast:** bez agenta atak opróżnił skarbiec (Etap 2); z agentem ten sam atak jest
  odrzucany — DEFEATED, skarbiec nietknięty (Etap 5).
- **Tożsamość ERC-8004 (Etap 6):** agent zarejestrowany w `IdentityRegistry` (agentId 1, AgentCard na
  IPFS), każda decyzja zostawia kryptograficzny ślad w `ValidationRegistry`, walidator buduje reputację.

**➡️ NASTĘPNY KROK: Etap 7** — redeploy DAO z `TimelockController` i dowód, że timelock daje okno
obronne nawet gdy agent nie zdąży w oknie głosowania (obrona komplementarna do Etapu 5, który broni
W TRAKCIE głosowania). Nie wymaga pilnowania czasu — zwykła praca.

**Jak wznowić agenta / demo po powrocie:**
```bash
cd /home/kajko/dao-warden/agent
npm run identity                                  # on-chain tożsamość ERC-8004 + reputacja (read-only)
npm run stage6                                    # E2E Etap 6: audyt decyzji WGIP-1 + ocena walidatora
DEPLOYED_FILE=deployed-fast.json npm run stage5   # pełne demo obrony (~40s, świeży cykl ataku)
DEPLOYED_FILE=deployed-fast.json npm run scan     # ocena istniejących propozycji (rdzeń + LLM)
```
(Bez `DEPLOYED_FILE` agent celuje w realistyczny DAO. `ANTHROPIC_API_KEY` w `.env` włącza warstwę LLM.
Rejestry ERC-8004 są niezależne od `DEPLOYED_FILE` — zawsze z `docs/deployed-erc8004.json`.)

---

## Inwentarz (Arc Testnet, chainId 5042002)

**Kontrakty:** GovToken `0xa2f16689aBCDaF264F96e66724CFbdB33EfFF622` · DAOGovernor
`0x0CbCaa61344Efef42916a7461e1bF2B673Fc4a21` · Treasury `0xD3FBEE1CAD68EC7c4C68632A1175b4Dba9BAF293`
· MockAsset mUSD `0xe17a3d3c1bECAAC8A7f66F54598204C9F60EeaE5`.

**Rejestry ERC-8004 (Etap 6):** IdentityRegistry `0x5a33040857B28DCB05CBE4dC32028705AaF34D36` ·
ValidationRegistry `0xb7f7F332a3A8523fbd3F18bC624544a63f422dE4`. Agent: agentId 1, właściciel =
portfel agenta `0x0bDE…BEFC`, AgentCard `ipfs://bafkreih3vn4ehc3ilgor6ces6cswjzwmcclapcy6nm34sijklnvlwfqnyu`
(plik `docs/agent-card.json`; CID prawdziwy, ale nieprzypięty — patrz `docs/agent-card.cid.txt`).
Inwentarz i tx w `docs/deployed-erc8004.json`.

**Portfele (klucze w `.env`, gitignored):**
- deployer (Wallet B) `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D` — ~12.14 USDC
- attacker `0x3Dfda2a699cF86FB08428CF7100c6bed6fd00586` — 50k WGOV, 0.5 USDC
- honest_voter `0x4979b3d5B712BEd2407D3E69CBA55CAaFc4fe2c5` — 100k WGOV, 0.25 USDC
- agent `0x0bDEb6882AEeFA2E3CcC956FAB425C2c4479BEFC` — 0.25 USDC
- validator `0xFd8d7CbE0cC709468595926DE552b6E6a2c955fB` — 0.2 USDC

**Propozycja ataku:** id `106580324092998781649523553524390498126338184535661068633139847809166702258296`,
opis `"WGIP-1: Grant operacyjny na rozwoj ekosystemu"`, descHash
`0xe454b786d4548d736c838b4c3e1afd0dd562d787e7563810788a6f3901796503`.

---

## Dziennik

### Sesja 1 — 2026-07-12 — Etapy 0, 1, 2 (część)

**Etap 0 — środowisko.** Potwierdzono: git 2.43, node v24.18, Foundry 1.7.1 (nic nie instalowano).
`forge init` + `forge install OpenZeppelin/openzeppelin-contracts` → OZ **v5.6.1**. `foundry.toml`:
solc 0.8.28, `evm_version = cancun`, optimizer 200.

**Weryfikacja Arc (empiryczna, nie z pamięci):**
- chainId `5042002`, czas bloku **~0.5 s** (delta timestampów / 10 bloków), gas ~20.24 gwei.
- Opcodes: **PUSH0 i MCOPY wspierane** — sprawdzone read-only `cast call --create` (`0x5f5ff3`,
  `0x...5e...f3`), oba zwróciły `0x`. Skorygowano wcześniejsze założenie o wymogu `paris`.

**Etap 1 — kontrakty + testy.** Napisano `GovToken` (ERC20Votes, zegar timestamp), `DAOGovernor`
(kworum 1%, próg 0, bez timelocka), `Treasury` (Ownable=Governor), `MockERC20`. Testy Foundry
**4/4 PASS** (`test/DAOGovernanceFlow.t.sol`): tryb zegara, kworum 1%, właściciel skarbca, pełny
cykl mint→delegacja→propozycja→głos→wykonanie. Koszt deployu zmierzony (`gasleft`): ~5.5M gas.

**Etap 2 — deploy + atak.**
- Deploy `script/DeployDAO.s.sol --broadcast`. Dystrybucja: attacker 50k / honest 100k / float
  850k WGOV; skarbiec 1M mUSD. Zweryfikowano niezależnie przez `cast` (kod, parametry, właściciel).
- Wygenerowano 4 świeże portfele ról, zasilono gazem z Wallet B.
- **Atak (ZAKOŃCZONY):** attacker `delegate` (tx `0xe0633555…`) → `propose` WGIP-1 drenujące 1M
  mUSD na własny adres (tx `0xe8b45ac7…`) → `castVote` For (tx `0xa6f9bcda39…b4a2bef66e`) → po
  końcu głosowania `execute` (tx `0x0381784133e786bbbeccd67da354ae0f07b7b50e9f17c4f1eb93eb4ce5cbdd21`,
  status 1, blok 51461489). Wynik głosów: For 50 000, Against 0, Abstain 0 — kworum (10 000)
  przekroczone 5×, honest bierny. **Efekt: skarbiec 1 000 000 → 0, atakujący 0 → 1 000 000 mUSD.**
  Czas realny propozycja→drenaż: ~1h (60s delay + 3600s głosowania). **Morał:** 5% tokenów opróżnia
  skarbiec w <1h, bez żadnego exploitu — czysta klasa BONK.

**Decyzje z tej sesji (i dlaczego):** zegar timestamp (blok 0.5 s), aktywo skarbca = MockERC20 dla
pełnej kontroli w teście, `evm_version cancun`, dystrybucja 50k/100k dobrana tak, by obrona (2×
siła atakującego) mogła wygrać — o ile zdąży zareagować (sedno wartości timelocka w Etapie 7).

**Etap 3 — agent deterministyczny (ZAKOŃCZONY).** Katalog `agent/` (TypeScript + Viem, uruchamiany
przez `tsx`). Potok: listener `ProposalCreated` → parser calldata (`decode.ts`, rozpoznaje
`Treasury.withdraw` 0xd9caed12) → scoring `risk.ts` (4 reguły: TREASURY_SPEND +30, TREASURY_FRACTION
+0..40, SELF_DEALING +15, PROPOSER_MEETS_QUORUM +15; progi 70/45/25). Dwa tryby: `npm run scan`
(historyczne) i `npm run watch` (na żywo, polling). **Decyzja:** ocena na stanie z bloku powstania
propozycji (bez tego, po drenażu saldo skarbca=0 fałszowało regułę frakcji — złapane i naprawione).
Weryfikacja: `scan` na WGIP-1 → **CRITICAL 100/100** (wszystkie 4 sygnały); `watch` łączy się z Arc
i nasłuchuje; `tsc --noEmit` czysto.

**Etap 4 — warstwa LLM (ZAKOŃCZONY).** `agent/src/llm.ts` — Claude **Haiku 4.5** (`claude-haiku-4-5`)
przez `@anthropic-ai/sdk`, structured outputs (`output_config.format` + json_schema, enum na verdykcie).
Porównuje `description` (narracja) z zdekodowanymi intencjami (realne działanie) → `{verdict, mismatchScore,
redFlags, reasoning}`. Klucz TYLKO z `ANTHROPIC_API_KEY` (nigdy w kodzie); warstwa opcjonalna — rdzeń
działa bez niej (flaga `llmAvailable()`). Wpięte w `scan` i `watch`, wynik w raporcie. Weryfikacja na
WGIP-1: **MAJOR_MISMATCH 85/100** — model rozpoznał, że „grant operacyjny" maskuje drenaż 100% skarbca
na adres wnioskodawcy, nazwał to sygnaturą BONK. `tsc --noEmit` czysto.

**Szybki wariant DAO wdrożony (2026-07-12)** do iterowania Etapów 5-7 — `script/DeployFastDAO.s.sol`,
delay 5s / period 30s, cykl ~35s. Adresy w `docs/deployed-fast.json`: GovToken `0x0e9337D3…`, DAOGovernor
`0xddd55F7a…`, Treasury `0x7fc58608…`, MockAsset `0xbFA5369F…`. Agent celuje w wariant przez
`DEPLOYED_FILE=deployed-fast.json` (config.ts czyta tę zmienną). Realistyczny DAO zostaje na finalny pokaz.

**Etap 5 — reakcja agenta (ZAKOŃCZONY).** Nowe pliki: `wallet.ts` (klient portfela agenta z
`AGENT_PRIVATE_KEY`), `decide.ts` (łączy rdzeń + LLM w decyzję VOTE_NO/ALLOW; próg: score≥45 LUB
LLM=MAJOR_MISMATCH), `react.ts` (`castNoVote` — głos support=0 oddelegowaną siłą), `stage5-demo.ts`
(pełny scenariusz). Uruchomienie: `DEPLOYED_FILE=deployed-fast.json npm run stage5`. **Wynik E2E,
zweryfikowany `cast`:** uczciwy delegował 100k agentowi → atakujący złożył WGIP-2 (drenaż 1M) i zagłosował
ZA (50k) → agent wykrył (CRITICAL 100 + MAJOR_MISMATCH 95), zagłosował NIE (100k) → **ZA 50k < PRZECIW
100k → DEFEATED (state=3), agent hasVoted=true, skarbiec 1 000 000 mUSD nietknięty.** Kontrast z Etapem 2
(bez agenta atak opróżnił skarbiec) jest sednem wartości projektu.

### Sesja 2 — 2026-07-12 — Etap 6 (tożsamość ERC-8004 + audyt + reputacja)

**Weryfikacja specyfikacji (empiryczna, nie z pamięci).** Pobrano aktualny ERC-8004 z eips.ethereum.org
— standard jest już oparty na **ERC-721 + URIStorage** (`register(agentURI, metadata[])` → `agentId` =
tokenId), a NIE na starszym `newAgent(agentDomain, agentAddress)`. Zaprojektowano pod aktualną wersję.

**Kontrakty (`src/erc8004/`, solc 0.8.28, OZ 5.6.1).**
- `IdentityRegistry` — ERC-721 URIStorage: `register` (+ overload), `getMetadata`/`setMetadata`,
  `setAgentURI`, `getAgentWallet`, zdarzenia `Registered`/`MetadataSet`/`URIUpdated`. Świadome
  uproszczenia vs. spec (opisane w NatSpec + `deployed-erc8004.json`): pominięto `setAgentWallet` z
  podpisem EIP-712 (portfel agenta == właściciel).
- `ValidationRegistry` — `validationRequest`/`validationResponse` + odczyty (`getValidationStatus`,
  `getSummary`, `getAgentValidations`, `getValidatorRequests`). Niesie DWIE funkcje Etapu 6: audytowalny
  ślad decyzji (request) + sygnał reputacji walidatora (response 0-100). `constructor(identity)` zamiast
  `initialize` (brak proxy — prostszy deploy).
- **Testy Foundry: 10/10 PASS** (`test/ERC8004.t.sol`) — pełny cykl rejestracja→request→response→reputacja,
  kontrola dostępu (nie-właściciel nie zgłosi, nie-walidator nie odpowie), granice (response>100 revert,
  duplikat hash revert). Cała suita repo: **15/15**.

**AgentCard + IPFS.** `docs/agent-card.json` (format `registration-v1`: name/description/services/
supportedTrust). Policzono **prawdziwy CIDv1 (raw+sha256)** skryptem `scripts/ipfs-cid.mjs` →
`bafkreih3vn4ehc3ilgor6ces6cswjzwmcclapcy6nm34sijklnvlwfqnyu`. **Uczciwie:** brak creds do pinningu w
tym środowisku — CID jest content-addressowany i weryfikowalny z treści, ale plik nie jest przypięty do
publicznej bramki (osobny krok hostingu). Udokumentowane w `docs/agent-card.cid.txt`.

**Deploy (Arc, po zatwierdzeniu przez użytkownika — plan z estymatą gazu przedstawiony wcześniej).**
`script/DeployERC8004.s.sol`: deployer (Wallet B) wdrożył oba rejestry, następnie **agent zarejestrował
sam siebie** (żeby być `ownerOf(agentId)` i móc zgłaszać własne decyzje). Zweryfikowano niezależnie
przez `cast`: kod obecny, `ownerOf(1)` = agent, `tokenURI` = nasz CID, metadane `framework=dao-warden` /
`guards=<Governor>` / `validator=<validator>`, `ValidationRegistry.getIdentityRegistry()` = IdentityRegistry.
- deploy IdentityRegistry: tx `0xcbde2ca62372bd9ca43ed0d7f6f262e7618b109dc178798234f1d1a886414b38`
- deploy ValidationRegistry: tx `0x90be37f96422540573d199352afe845be128d2d8b1c689dca65fd719ad17760e`
- register agent: tx `0xd288094b0c8f5822fd0484520bfb0def6a25d1b1579634e7d65c7109ae38b28f`

**Integracja agenta (TypeScript, `agent/src/`).** `erc8004.ts` (adresy + ABI + klienci), `identity.ts`
(odczyt tożsamości), `audit.ts` (agent buduje kanoniczny rekord decyzji, składa `validationRequest`),
`validate.ts` (walidator odpowiada + odczyt reputacji), `cid.ts` (CID po stronie agenta), `stage6-demo.ts`
+ `identity-cli.ts`. `tsc --noEmit` czysto.

**Demo E2E (`npm run stage6`) — audyt PRAWDZIWEJ decyzji o ataku WGIP-1.** Agent przeskanował chroniony
Governor, znalazł WGIP-1, ocenił swoim pełnym potokiem (**CRITICAL 100/100 + LLM MAJOR_MISMATCH 92/100 →
VOTE_NO**), złożył rekord decyzji do ValidationRegistry, a walidator ocenił decyzję **100/100**
(tag `attack-defense`). Odczyt reputacji: **1 ocena, średnia 100**. Transakcje:
- validationRequest (agent): tx `0x25c57718310350ed6295d75618e066eb0b44ff5ddc4ecdb2741a025967387a73`
  · requestHash `0x13b6af1c…e73197` · requestURI `ipfs://bafkreighw2gqagqepbv64jypkz4amwdwjbfgegkharksmgdoubamtiqlzi`
- validationResponse (walidator): tx `0x81386c4a054502bbe0524cb7702e7743d8174c2b1e2961a3892041008eab6c0e`

**Kontrola integralności (kluczowy dowód audytowalności):** keccak256 zapisanego rekordu decyzji
(`docs/decisions/13b6af1c0df212e2.json`) = `requestHash` on-chain, a jego CID = zapisany `requestURI`.
To dowodzi, że zobowiązanie on-chain wiąże się DOKŁADNIE z zacommitowanym rekordem — decyzji nie da się
później po cichu zmienić. Cały stan potwierdzony niezależnie przez `cast` (getAgentValidations/getSummary/
getValidationStatus/getValidatorRequests).

**Następny krok:** Etap 7 — redeploy DAO z `TimelockController`, dowód że timelock daje okno obronne nawet
gdy agent nie zdąży w oknie głosowania (obrona komplementarna do Etapu 5, który broni w trakcie głosowania).
