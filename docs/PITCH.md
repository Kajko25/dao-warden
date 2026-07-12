# DAO-WARDEN — dokument prezentacyjny

> Dokument utrzymywany na bieżąco jako materiał do przedstawienia komisji oceniającej:
> czym jest DAO-WARDEN, jaki problem rozwiązuje, jak jest zbudowany i jak powstawał.
> Ostatnia aktualizacja: 2026-07-12 (**Etapy 0–7 zakończone — pełna roadmapa domknięta**).

## W skrócie (TL;DR dla komisji)

DAO-WARDEN to **audytowalny agent-strażnik AI**, który broni skarbca DAO przed *governance
attacks* (klasa ataku BONK — przejęcie głosowania, nie włamanie do kodu). Zbudowaliśmy na Arc
celowo podatne DAO jako poligon, a następnie agenta, który je broni na **dwóch niezależnych,
komplementarnych warstwach** — i udowodniliśmy każdą on-chain, w kontrze do policzalnej bazy:

| Scenariusz | Kto broni | Wynik on-chain |
|---|---|---|
| **Baseline** (Etap 2, bez strażnika) | nikt (uczciwi bierni) | skarbiec **1 000 000 → 0 mUSD**, atak `Executed` |
| **Obrona głosem** (Etap 5) | agent głosuje NIE oddelegowaną siłą | propozycja **DEFEATED**, skarbiec cały |
| **Obrona timelockiem** (Etap 7) | agent anuluje w oknie po głosowaniu | propozycja **Canceled**, skarbiec cały |

Do tego: analiza **narracja-vs-instrukcje** przez Claude (wykrywa „ładny opis maskujący drenaż")
i **tożsamość + ślad decyzji + reputacja** przez ERC-8004. Wszystko zweryfikowane niezależnie (`cast`).

---

## 1. Problem — governance attacks

DAO (zdecentralizowane organizacje autonomiczne) zarządzają skarbcami przez głosowanie
tokenami. **Governance attack** to przejęcie kontroli nad taką organizacją **nie przez
włamanie do kodu, lecz przez sam mechanizm głosowania**: atakujący zdobywa większość głosów
i przepycha propozycję, która wyprowadza środki ze skarbca.

**Przykład referencyjny — atak na BONK DAO (lipiec 2026):** atakujący wydał kilka mln $ na
tokeny, przy skrajnie niskiej frekwencji przegłosował sam ze sobą propozycję drenującą skarbiec
i wyprowadził środki. Żaden kontrakt nie został „zhakowany" — zadziałał normalny, zgodny z
regułami mechanizm. To czyni tę klasę ataków szczególnie podstępną: audyt kodu jej nie wykryje.

**Trzy czynniki, które umożliwiają atak:**
1. **Niskie kworum** — do przyjęcia propozycji wystarczy głos znikomej części tokenów.
2. **Brak/zerowy próg propozycji** — każdy może zgłosić dowolną propozycję.
3. **Brak timelocka** — po zakończeniu głosowania środki wypływają natychmiast; uczciwa
   społeczność nie ma okna czasowego, by zareagować.

## 2. Czym jest DAO-WARDEN

DAO-WARDEN to **agent-strażnik AI**, który w czasie rzeczywistym monitoruje DAO i wykrywa
propozycje o cechach governance attack, zanim skarbiec zostanie opróżniony — a docelowo
**aktywnie reaguje** (deleguje sobie siłę głosu i głosuje przeciw), tworząc audytowalny ślad
swoich decyzji.

Kluczowe: agent nie ocenia tylko „czy propozycja przejdzie", lecz **porównuje deklarowaną
narrację propozycji z jej realnymi instrukcjami on-chain** (kogo i ile faktycznie obciąża
calldata) i wykrywa rozbieżność „ładny opis vs drenaż skarbca".

## 3. Dlaczego Arc (Circle)

Budujemy na **Arc Testnet** — blockchainie Circle, w którym natywnym tokenem gazu jest USDC.
Sieć daje sub-sekundową finalizację (blok ~0.5 s) i przewidywalne, stabilne opłaty, co jest
naturalne dla aplikacji operujących na wartości (skarbce, płatności agentów).

## 4. Architektura i podejście

Ponieważ na testnecie nie istnieje prawdziwe DAO do zaatakowania, projekt ma dwie warstwy:

**A. Poligon — celowo podatne mini-DAO** (odtwarza klasę podatności BONK na EVM):
- `GovToken` (WGOV) — token głosujący (standard ERC20Votes).
- `DAOGovernor` — mechanizm głosowania z **kworum 1%**, **zerowym progiem propozycji**,
  **bez timelocka** (wszystkie trzy czynniki ataku).
- `Treasury` — skarbiec, którego środki może wypłacić wyłącznie Governor.

**B. Strażnik** — agent (TypeScript + Viem), który to DAO obserwuje i broni. Warstwa AI
(Claude API) dokłada analizę semantyczną narracja-vs-instrukcje.

**Świadoma decyzja metodologiczna:** rdzeń wykrywania jest **deterministyczny** (parsowanie
instrukcji, scoring ryzyka na twardych regułach) i powstaje **przed** warstwą LLM. LLM dokłada
osąd tam, gdzie reguły nie wystarczą — nie jest jedynym punktem decyzyjnym. To czyni system
audytowalnym i odpornym.

**Warstwa LLM (Etap 4, ZAKOŃCZONA):** dołożyliśmy analizę semantyczną przez **Claude Haiku 4.5**
(TypeScript SDK, structured outputs). Agent porównuje **narrację** propozycji (pole `description`,
pisane dla głosujących) z jej **realnymi instrukcjami on-chain** (zdekodowane calldata) i wykrywa
rozbieżność „ładny opis vs faktyczne działanie". Klucz API wyłącznie ze zmiennej środowiskowej;
warstwa jest opcjonalna — rdzeń deterministyczny działa bez niej. Weryfikacja na WGIP-1: model
zwrócił **MAJOR_MISMATCH (85/100)**, poprawnie rozpoznając, że „grant operacyjny na rozwój
ekosystemu" maskuje transfer 100% skarbca na adres samego wnioskodawcy — nazwał to wprost
sygnaturą ataku BONK. To domyka wykrywanie: twarde reguły łapią mechanikę, LLM łapie intencję.

**Reakcja agenta (Etap 5, ZAKOŃCZONA) — pierwszy raz strażnik DZIAŁA, nie tylko wykrywa.**
Uczciwy (apatyczny) posiadacz deleguje siłę głosu agentowi; ten po przekroczeniu progu ryzyka
automatycznie głosuje **NIE**. Zademonstrowane end-to-end na Arc (szybki wariant DAO, cykl ~35 s):
atakujący złożył propozycję drenującą skarbiec i zagłosował ZA (50k), agent wykrył atak
(CRITICAL 100/100 + MAJOR_MISMATCH 95/100), zdecydował o reakcji i zagłosował NIE oddelegowaną
siłą 100k → **wynik ZA 50k / PRZECIW 100k → propozycja DEFEATED, skarbiec nietknięty (1 000 000 mUSD)**.
Ten sam atak bez agenta (Etap 2) opróżnił skarbiec do zera. To jest sedno wartości DAO-WARDEN:
**strażnik jest zawsze-czujnym delegatem, któremu apatyczna większość powierza swój głos.**

**Tożsamość, audyt i reputacja (Etap 6, ZAKOŃCZONY) — strażnik staje się rozliczalny.**
Zbudowaliśmy i wdrożyliśmy na Arc dwa rejestry zgodne ze standardem **ERC-8004 (Trustless
Agents)**: **IdentityRegistry** (agent jako token ERC-721 z kartą AgentCard na IPFS) i
**ValidationRegistry**. Agent zarejestrował **sam siebie** — jest właścicielem swojego
`agentId`, więc tylko on może zgłaszać własne decyzje do walidacji. Standard niesie tu dwie
funkcje naraz:
- **Audytowalny ślad decyzji** — dla każdej ocenianej propozycji agent składa `validationRequest`,
  gdzie `requestHash` to keccak256 kanonicznego rekordu decyzji (co oflagował i dlaczego). To
  **kryptograficzne zobowiązanie**: decyzji nie da się później po cichu zmienić. Potwierdzone
  co do bajta — keccak zapisanego rekordu = hash on-chain, a jego CID = zapisany `requestURI`.
- **Sygnał reputacji** — **niezależny walidator** ocenia decyzję (`validationResponse`, 0–100);
  `getSummary` agreguje to w reputację agenta. Zademonstrowane na realnym ataku WGIP-1: agent
  zapisał decyzję `VOTE_NO` (CRITICAL 100 + MAJOR_MISMATCH 92), walidator potwierdził ją oceną
  **100/100 → reputacja: 1 ocena, średnia 100**.

Efekt: agent ma **przenaszalną tożsamość on-chain** (`eip155:5042002:<registry>:1`) i
weryfikowalną historię swoich osądów — kluczowe, gdy powierza mu się siłę głosu realnego DAO.

**Mitygacja timelockiem (Etap 7, ZAKOŃCZONY) — druga, niezależna warstwa obrony.** Redeployowaliśmy
DAO, zmieniając **dokładnie jedną zmienną** względem wariantu podatnego: egzekucja przechodzi teraz
przez `TimelockController`. **Kworum 1% i zerowy próg zostawiliśmy celowo bez zmian** — żeby dowód był
czysty: to *sam timelock* (a nie zaostrzenie innych parametrów) daje obronę. Cykl życia propozycji
zmienia się z „Succeeded → natychmiastowy drenaż" na „Succeeded → kolejka → **okno `minDelay`** →
egzekucja". W tym oknie agent, mając na timelocku rolę `CANCELLER`, **anuluje operację ataku**.

Dlaczego to osobna warstwa, a nie powtórka Etapu 5: obrona głosem (Etap 5) działa **w trakcie**
głosowania i wymaga, by agent dysponował wystarczającą oddelegowaną siłą. Timelock działa **po**
wygranym głosowaniu — ratuje sytuację nawet wtedy, gdy pierwsza warstwa zawiedzie (agent nie zdążył,
nie miał głosów, albo atakujący zdobył realną większość). Zademonstrowane end-to-end na Arc dokładnie
w takim „najgorszym" scenariuszu: uczciwi bierni → **atak wygrywa głosowanie** (Succeeded) → trafia do
kolejki (Queued) → agent (CRITICAL 100/100 + LLM MAJOR_MISMATCH 85/100 → VOTE_NO) **anuluje operację w
oknie `minDelay`** → **stan Canceled, skarbiec 1 000 000 mUSD nietknięty, `execute` odrzucone**.

Uczciwie zaznaczamy w testach granicę tej obrony: samo opóźnienie to **nie** zabezpieczenie — jeśli
w oknie `minDelay` nikt nie zareaguje, atak i tak wchodzi. Dlatego timelock i agent są
**komplementarne**: timelock *kupuje czas*, a strażnik ten czas *wykorzystuje*.

## 5. Etapy budowy

| Etap | Zakres | Status |
|---|---|---|
| 0 | Środowisko, repo, OpenZeppelin, konfiguracja Arc | ✅ |
| 1 | Kontrakty podatnego DAO + testy lokalne | ✅ |
| 2 | Deploy na Arc + symulacja ataku end-to-end | ✅ |
| 3 | Agent — rdzeń deterministyczny (listener + parser + scoring) | ✅ |
| 4 | Warstwa LLM (Claude): narracja vs realne instrukcje | ✅ |
| 5 | Reakcja agenta (delegacja + automatyczny głos NIE) | ✅ |
| 6 | Tożsamość ERC-8004 + logowanie decyzji + reputacja | ✅ |
| 7 | Mitygacja: redeploy z timelockiem, dowód powstrzymania ataku | ✅ |

## 6. Kluczowe decyzje inżynierskie (i ich uzasadnienie)

- **Zegar głosowania w trybie `timestamp`, nie numer bloku.** Przy bloku ~0.5 s okresy liczone
  w blokach są niepraktyczne i zależne od zmiennego czasu bloku; timestamp daje okresy w
  sekundach. Token i Governor współdzielą zegar (Governor dziedziczy go z tokena).
- **`evm_version = cancun`** — zweryfikowaliśmy empirycznie (read-only `eth_call`), że Arc
  wspiera opcodes Cancun (PUSH0, MCOPY); OpenZeppelin v5.6 tego wymaga. Skorygowaliśmy wcześniejsze
  (nieaktualne) założenie o konieczności `paris`.
- **Weryfikacja empiryczna zamiast założeń** — każdy fakt o sieci (chainId, czas bloku, wsparcie
  opcodes, cena gazu) potwierdzony na żywo, nie przyjęty z pamięci.
- **Hermetyczne testy** — golden test ataku działa lokalnie (Foundry) z zastępczym aktywem
  (MockERC20), niezależnie od stanu sieci; wersja on-chain używa tego samego kodu.

## 7. Dowody (on-chain, Arc Testnet — chainId 5042002)

Kontrakty wdrożone i zweryfikowane niezależnie (`cast`), eksplorator: `testnet.arcscan.app`.

| Element | Adres / wartość |
|---|---|
| GovToken (WGOV) | `0xa2f16689aBCDaF264F96e66724CFbdB33EfFF622` |
| DAOGovernor | `0x0CbCaa61344Efef42916a7461e1bF2B673Fc4a21` |
| Treasury | `0xD3FBEE1CAD68EC7c4C68632A1175b4Dba9BAF293` |
| Aktywo skarbca (mUSD) | `0xe17a3d3c1bECAAC8A7f66F54598204C9F60EeaE5` |
| Parametry podatności | kworum 1%, próg propozycji 0, brak timelocka |
| Skarbiec (przed atakiem) | 1 000 000 mUSD |
| **IdentityRegistry** (ERC-8004) | `0x5a33040857B28DCB05CBE4dC32028705AaF34D36` |
| **ValidationRegistry** (ERC-8004) | `0xb7f7F332a3A8523fbd3F18bC624544a63f422dE4` |
| agentId globalny | `eip155:5042002:0x5a33…4D36:1` (właściciel = portfel agenta) |
| **Wariant z timelockiem (Etap 7):** | |
| DAOGovernorTimelocked | `0x641181a13c3114392e40fB4dc0785ACE279E9c1E` |
| **TimelockController** (minDelay 120 s) | `0x5fB14e2398E53d15E044b770B8aCB67FDa04337f` |
| Treasury (owner = timelock) | `0xB565228545e798495F10330685779eB5C2b639f4` |
| Role timelocka | Governor = PROPOSER, agent = CANCELLER, admin zrzeczony |

**Symulacja ataku (Etap 2, ZAKOŃCZONA):** atakujący z 50 000 WGOV (5% supply) sam przekroczył
kworum (10 000) i większość, gdy uczciwy posiadacz 100 000 WGOV pozostał bierny — dokładnie
scenariusz BONK. Wynik potwierdzony on-chain: **skarbiec 1 000 000 → 0 mUSD, atakujący 0 →
1 000 000 mUSD**; propozycja w stanie `Executed`. Czas realny propozycja→drenaż ~1h. Transakcja
wykonania: `0x0381784133e786bbbeccd67da354ae0f07b7b50e9f17c4f1eb93eb4ce5cbdd21`. Pełny ślad w
`docs/SESSION-LOG.md`.

Ten wynik to **baza porównawcza (baseline)** dla całego projektu: ten sam atak w Etapie 5 ma zostać
wykryty i odparty przez agenta, a w Etapie 7 — uniemożliwiony przez timelock.

**Agent — rdzeń deterministyczny (Etap 3, ZAKOŃCZONY):** agent (TypeScript + Viem, katalog
`agent/`) nasłuchuje eventu `ProposalCreated`, dekoduje instrukcje propozycji (rozpoznaje
`Treasury.withdraw` po selektorze `0xd9caed12`) i ocenia ryzyko na **czterech deterministycznych
regułach** (ruch środków, % skarbca, samoobsługa, proponujący ≥ kworum) — bez LLM. Kluczowa
decyzja: agent ocenia stan on-chain **z bloku powstania propozycji**, nie bieżący. Weryfikacja:
puszczony na realnej propozycji ataku WGIP-1 zwrócił **CRITICAL 100/100** ze wszystkimi czterema
sygnałami — czyli poprawnie rozpoznał sygnaturę ataku klasy BONK jeszcze przed jego wykonaniem.

**Obrona głosem (Etap 5, ZAKOŃCZONA):** na szybkim wariancie DAO agent odparł ten sam atak głosując
NIE oddelegowaną siłą 100k → **ZA 50k / PRZECIW 100k → DEFEATED**, skarbiec nietknięty (kontrast do
baseline, gdzie skarbiec spadł do zera).

**Obrona timelockiem (Etap 7, ZAKOŃCZONA):** w scenariuszu, gdzie atak **wygrywa** głosowanie
(uczciwi bierni), agent anulował zakolejkowaną operację w oknie `minDelay` → **stan `Canceled`,
skarbiec 1 000 000 mUSD nietknięty, `execute` odrzucone**. Detal inżynierski wart odnotowania: agent
liczy identyfikator operacji timelocka po swojej stronie (`salt = bytes20(governor) XOR
descriptionHash`, dokładnie jak `GovernorTimelockControl`); zgodność z Solidity zweryfikowaliśmy
numerycznie i dodatkowo przez porównanie z on-chain `hashOperationBatch`. Golden test tej mitygacji
(4 dowody, w tym „samo opóźnienie to nie obrona") przechodzi lokalnie **5/5** (cała suita repo 21/21).

## 8. Co ten projekt pokazuje

- Governance attacks to realna, rosnąca klasa zagrożeń, niewykrywalna audytem kodu.
- Obrona wymaga **monitoringu czasu rzeczywistego + reakcji w oknie czasowym** — a nie tylko
  lepszego kodu kontraktu.
- **Jedna warstwa nie wystarcza.** Pokazaliśmy dwie niezależne, komplementarne linie obrony:
  głos w trakcie głosowania (Etap 5) i anulowanie w oknie timelocka po głosowaniu (Etap 7).
  Timelock kupuje czas, strażnik ten czas wykorzystuje — i odwrotnie, obrona głosem działa nawet
  bez timelocka. Razem pokrywają zarówno atak przechwycony wcześnie, jak i ten, który wygrał głos.
- DAO-WARDEN łączy deterministyczne reguły z osądem AI i tożsamością on-chain (ERC-8004),
  budując **audytowalnego, autonomicznego strażnika** — wzorzec przenaszalny na realne DAO.

## 9. Możliwe kierunki rozwoju

- **Realistyczny pokaz na żywo** — odtworzenie pełnego cyklu na wariancie produkcyjnym (okres
  głosowania ~1h) zamiast szybkiego, dla komisji obserwującej w czasie rzeczywistym.
- **Przypięcie AgentCard do publicznego IPFS** — CID jest już prawdziwy i content-addressowany;
  brakuje jedynie hostingu na publicznej bramce (osobny krok, wymaga poświadczeń pinningu).
- **Więcej wzorców ataku** — rozszerzenie reguł poza `Treasury.withdraw` (np. podmiana ustawień
  Governora, zmiana właściciela, przyznanie roli) i kalibracja progów na historycznych propozycjach.
- **Wielu walidatorów** — reputacja z jednego walidatora to punkt startowy; docelowo zbiór
  niezależnych walidatorów z agregacją odporną na zmowę.
