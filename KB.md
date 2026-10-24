# Local troubleshooting notes

## Každú úpravu aplikácie kontroluje Architekt

Pri každej zmene operátorskej aplikácie alebo jej synchronizačného kontraktu
treba pred publikovaním požiadať Architekta o kontrolu návrhu, kompatibility,
testov a výsledného release balíka. Kontrola nenahrádza testy ani hashové
overenie publikovaného vydania.

Pri synchronizácii dotazov aplikácia zobrazuje iba aktuálne, nezodpovedané a
najnovšie požiadavky pre daný logický prípad. Rozhodnuté a staršie duplicitné
snímky zostávajú v audite, ale nie v aktívnom zozname. Ak aplikácia nevie
overiť `request-status.json`, zoznam musí zlyhať bezpečne a nesmie zobraziť
historické požiadavky ako aktuálne.

## A pending-action list can hide a still-blocked workflow

A UI that reads only undecided operator requests is not a reliable view of workflows waiting for user input. A request may already contain an approval or comment while its underlying case still remains blocked because the supplied answer was incomplete or only authorized further preparation.

For Tinder status, use the validated `awaiting_details` array from the authenticated progress snapshot as the source of truth for the waiting-chat panel. Keep the aggregate count and detail count consistent. Render private fields with `textContent`, retain them only in memory, and refresh elapsed time independently of network polling. The generic operator request list remains a decision transport, not the workflow-status ledger.

## A stalled trigger can turn conservative polling into a deferred queue

When an event trigger stops advancing or is not delivered, a long fallback interval becomes the only discovery path. A ten-minute fallback combined with a per-run limit of three can let new work arrive faster than it is discovered and processed. The visible effect is delayed handling and a deferred queue even though the worker itself remains healthy.

Use a three-minute fallback scan, process up to ten eligible cases per run, and schedule another run whenever the completed pass reports `deferred > 0`. Keep idempotency and terminal-state guards in place so the faster recovery loop cannot repeat sent, uncertain, or already-started work.

## A waiting panel must follow current chat state, not only unanswered questions

Operationally blocked chats include more than `needs_user`. An unconfirmed send, an attempt without a terminal receipt, a stale draft, or a preparation handoff that exceeds the normal processing window all require attention even when no new operator question exists.

Build the private waiting snapshot from the newest case for each chat and include `needs_user`, `uncertain`, `attempt_started`, `stale`, and delayed `prepared` or `dispatched` states. Exclude terminal delivery and ownership states. An `uncertain` or `attempt_started` row is visibility only: it must never trigger an automatic retry. Keep the operator-question count separate from the full waiting count.

## Transport acceptance is not delivery confirmation

A message endpoint can return HTTP 200 and a message identifier while the conversation history still does not contain the outgoing message. Treating that response as `sent` hides a real delivery gap. Collapsing every transport failure into the same `uncertain` result also removes the evidence needed to distinguish a rejected route, malformed response, network interruption, and missing readback.

Persist `attempt_started` before the request. After an accepted response, fetch fresh server history and verify the returned identifier, sender identity, exact draft, and unchanged group composition before marking the case `sent`. If any check fails, store a bounded failure code, move the case to `uncertain`, surface it to the waiting-work view, and never retry it automatically.

Server history can lag briefly behind a successful write. Use a short, bounded sequence of delayed read-only checks after the original POST while keeping the POST count fixed at one. Every check must revalidate the group composition and require the exact returned identifier, local sender identity, and draft text.

For an older `uncertain` group case, reconciliation must remain a separate read-only operation. It may mark the case `sent` only when exactly one current server message has the local sender identity, exact draft text, a valid message identifier, a timestamp at or after `attempt_started`, and the same group signature. A missing or ambiguous match leaves the case `uncertain` and never causes a send.

## An acknowledgement must not consume an approved action

A mobile approval can disappear from the visible queue while its underlying send remains unresolved if a generic handled receipt hides the approval before the executor consumes its UUID. The workflow then has neither an actionable card nor permission to continue.

Keep an approved receipt actionable until the exact approval UUID is consumed by the authorized resume path. Allow generic acknowledgement only for comments and rejections. If an explicitly approved retry again becomes uncertain, require a read-only preflight before creating a new verification generation: reconcile an exact existing message, stop on changed context or group composition, or publish one new pending authorization with a new immutable context hash. Never create repeated pending cards from polling alone.

## Rotate expiring bridge credentials from proven traffic

An API credential refresh should be a one-shot operation. Arm it explicitly, keep candidate headers in memory, and accept them only from a Tinder-owned host when the request contains the explicit authentication header and the corresponding upstream request succeeds. Modern web clients may authenticate through either a REST response (2xx) or a websocket upgrade (101), so support both without accepting telemetry that lacks the authentication header. Atomically replace only the named credential entries in the private environment file, retain mode `0600`, publish metadata-only completion status, and remove the arm flag immediately.

Never persist candidate values in proxy logs, diagnostics, tests, knowledge-base notes, or version control. Verify the rotated credential with a read-only API call; enable automation only after that succeeds, and disable it on authentication failure.

## A PAC endpoint must survive proxy restarts

Clients can cache a PAC URL and keep using its embedded proxy port after a helper process restarts. Choosing new random PAC and proxy ports on every launch can therefore produce a healthy local process that receives no client traffic.

Reserve stable loopback ports for both endpoints and fail closed if either is occupied. A restart can then reuse the cached PAC URL safely, while the availability check prevents attaching to an unrelated listener.

## Safe one-shot recovery of an expired Tinder API token

Use the scoped local proxy only after the user authorizes credential recovery. Never request, display, copy, or log the token itself.

1. Confirm that the local Tinder bridge is disabled after a `401` or `403`, and leave it disabled during capture. Check that reserved loopback ports `52602` (PAC) and `52603` (proxy) are free.
2. Arm exactly one capture from the repository root with `python3 -c "import credential_refresh; credential_refresh.arm()"`. This creates the private one-shot arm file; it does not read or print credentials.
3. Start the scoped proxy with `python3 run_safari_proxy.py --unlimited`. Wait for its `READY` line. It changes only the Wi-Fi PAC configuration for Tinder-owned domains and restores the previous setting when stopped.
4. Generate one normal authenticated Tinder request in the already signed-in client. A successful Tinder REST response (`2xx`) or authenticated websocket upgrade (`101`) is sufficient. No new login is normally required while the existing browser session still works.
5. The proxy accepts only an explicit `x-auth-token` from `gotinder.com` or its subdomains, keeps the candidate in memory, and commits it only after the upstream success. It atomically updates `TINDER_AUTH_TOKEN` and `TINDER_DEVICE_ID` in `.env`, preserves mode `0600`, writes metadata-only `credential-refresh-status.json`, and removes the arm file.
6. Stop the proxy cleanly and verify `proxy-status.json` reports `active: false` with no cleanup failures. Confirm that the arm file is absent and the completion status is present; inspect metadata only.
7. Validate the credential with a read-only bridge request such as `python3 autopilot/bridge.py status` or `python3 autopilot/bridge.py new-matches`. Re-enable processing only after validation succeeds. On `401`, `403`, or `429`, keep processing disabled and notify once.

If capture does not complete, disarm it by deleting only `credential-refresh-armed.json`, stop the proxy so network settings are restored, and diagnose from sanitized status/events. Never put `.env`, token values, full headers, or private conversation data into logs, tests, chat messages, or the KB.

## Do not infer a group-send contract from route names

A route listed in source code or sanitized proxy allowlists is not evidence that its method and payload match the current service contract. If the only observed group write returns HTTP 400 and no matching message appears in history, classify the attempt as definitively rejected: the server did not accept it, so it is neither `sent` nor an ambiguous `uncertain` delivery.

Fail closed for later group sends until a successful, locally captured and sanitized request proves the exact endpoint and payload shape. Keep the rejected and transport-blocked cases visible in the waiting-work view, but never retry them automatically. After a corrected contract is versioned and verified, require a new explicit approval tied to the current immutable context before any new POST. Do not probe candidate endpoints or payloads with experimental sends.

### Double Date: manuálne odoslanie mimo proxovaného klienta
Ak používateľ odošle skupinovú správu z iPhone alebo iného klienta, ktorý neprechádza aktívnou Mac PAC proxy, potvrdenie odoslania sa môže použiť na označenie konkrétneho prípadu ako `manual_user`, ale nemožno z neho odvodiť API kontrakt. Kontrakt sa smie aktivovať až po úspešnom, sanitizovanom zachytení requestu z klienta, ktorý skutočne používa proxy; rovnaká správa sa kvôli diagnostike nesmie opakovať.

### PAC proxy musí mať živý PAC server aj MITM proces
Samotné `scutil --proxy` s aktívnou PAC URL nepotvrdzuje funkčnú proxy. Pred manuálnym zachytením treba overiť, že PAC URL odpovedá a že PAC aj proxy port počúvajú. Proces spustený ako odpojené dieťa jednorazového shellu môže zaniknúť a zanechať aktívnu PAC konfiguráciu smerujúcu na mŕtvy port; pre aktívne zachytávanie ho držať v riadenej dlhotrvajúcej relácii a overiť oba porty.

### Double Date používa odlišný názov textového poľa
Úspešné manuálne odoslanie z nanovo spusteného proxovaného webového klienta potvrdilo kontrakt `POST /v1/conversations/messages` s JSON poľami `conversation_id` a `text`; server odpovedal `201`. Pole `message`, používané pri individuálnom endpoint-e, na skupinovej trase spôsobovalo HTTP 400.

Kontrakt skupinového odoslania musí byť samostatne verzovaný a regresný test musí overovať presný názov poľa. Po prijatí odpovede zostáva povinné read-only overenie v histórii; samotné HTTP 201 nepotvrdzuje doručenie a neumožňuje automatické opakovanie.

- 2026-10-23: Ak presná operátorská autorizácia prejde, ale čítací preflight pred POST nepotvrdí príjemcu, prípad sa musí vrátiť do `needs_user` s dôvodom `recipient_not_confirmed`. Autorizácia zostáva spotrebovaná a automatické opakovanie je zakázané; prípad nesmie zostať uviaznutý v prechodnom stave `reviewed`.

- 2026-10-23: Handoff označený ako `dispatched` nesmie zostať bez výsledku natrvalo. Ak po 10 minútach stále chýba `response.json`, scan vráti presne ten istý nemenný prípad do `prepared`, zvýši počítadlo obnovy a zaradí ho do spoločnej Rafi fronty. Obnova iba opakuje návrhový handoff; nikdy sama neodosiela Tinder správu.

- 2026-10-23: Počet „zastavených chatov“ v aplikácii musí vychádzať z aktívnych, nevybavených operátorských požiadaviek v outboxe, nie zo všetkých lokálnych prípadov v fail-closed stave `needs_user`. Prípady s už vráteným `approved` alebo `commented` rozhodnutím môžu dočasne zostať `needs_user`, kým sa spracuje návrh, ale nesmú sa zobraziť ako nový dotaz. `blocked`, `awaiting_operator` a needs_user riadky preto filtrujú iba outbox položky s `result: null`.
- 2026-10-23: Zoznam „Stojace a čakajúce chaty“ je akčná schránka. Stavy `uncertain` a `attempt_started` bez konkrétnej otázky patria do technického ukazovateľa `requires_verification`, nie medzi chaty čakajúce na používateľa. Pred publikovaním treba neistý výsledok read-only zosúladiť s históriou pre individuálne aj skupinové chaty; presná správa po čase pokusu sa označí ako odoslaná bez opakovania POST.
- 2026-10-23: Operátorský komentár dodáva fakty na zamýšľané prepísanie `response.json`, preto jeho neskoršie označenie ako vybavené nesmie vyžadovať pôvodný hash odpovede. Samotné schválenie odoslania naďalej musí zostať viazané na presný nezmenený návrh, kontext a históriu.
- 2026-10-23: Samotný odkaz v prijatej správe nie je dôkaz logistiky alebo dostupnosti. Hudobné, článkové a profilové odkazy nesmú falošne vytvoriť `needs_user`; finálna poistka blokuje konkrétny čas, stretnutie a jazyk dostupnosti. Obsah odkazu sa bez overenia nesmie tvrdiť ani použiť ako fakt.

## Bridge capacity: one scheduler and semantic snapshots

Multiple timers that call overlapping bridge functions amplify idle GitHub traffic even when a file lock prevents concurrent writes. Use one 60-second worker as the sole GitHub synchronizer. Heartbeats consume locally synchronized decisions and must not start another bridge sync. Disable specialized high-frequency progress workers instead of relying on lock collisions.

Publish progress and automation documents only when their semantic state changes. Do not include ticking fields such as backend check time or elapsed waiting seconds in the equality-controlled payload; clients derive elapsed time from the stable `waiting_since` value. Keep a local, locked transport counter grouped by actor, method, and normalized endpoint so unexpected consumers and rate-limit pressure are measurable without recording credentials or private content.

The mobile client may read the aggregate snapshot once per minute while visible. Explicit Refresh is the transactional user path: collect every non-empty answer, confirm the batch once, write each immutable request decision with SHA validation, then fetch the current request list and aggregate state. Background polling never submits drafts.

Keep the active request directory bounded. Move terminal requests older than the retention window into monthly archive paths with one atomic Git tree commit, preserving their original blob hashes. Never archive unresolved requests. A non-fast-forward archive commit fails closed and is reconsidered from a fresh directory snapshot.

### Overená navigácia na Tinder chat (2026-10-24)

- Cestu ku konkrétnemu webovému chatu povoľ až po reálnom sanitizovanom proxy záchyte úspešného `GET`; overená šablóna je `https://tinder.com/app/messages/{match_id}`.
- Konkrétny identifikátor patrí iba do autentifikovaného súkromného progress payloadu. Verejný release obsahuje iba validátor šablóny a nikdy konkrétny identifikátor, token ani hlavičky.
- Klient prijme výhradne HTTPS host `tinder.com`, presnú cestu `/app/messages/<bezpečný-identifikátor>`, bez portu, query alebo fragmentu, a otvorí ju s izolovaným `noopener noreferrer`.
- Apple AASA povoľuje natívne universal links iba pod `/deeplink/*`; preto túto cestu označuj ako otvorenie chatu v Tinderi, nie ako garantovaný natívny deep link.
- Karta operátorskej požiadavky môže dostať chat link iba cez autentifikovaný privátny `request-status.json`, keď aktívny request zo zdroja `tinder` alebo `rafi` jednoznačne odkazuje na lokálny `tinder_case`/`tinder_verification` a jeho aktuálny `match_id`. Link nie je súčasťou podpísaného requestu, takže nemení jeho digest ani rozhodovací kontrakt.
- Klient musí mapovanie opäť validovať: UUID requestu, HTTPS, presný host `tinder.com`, cesta `/app/messages/<ID>`, bezpečné ID a žiadny port, query ani fragment. Link sa drží iba v pamäti, zobrazuje sa hneď pod textom „Čo schvaľuješ“ a nikdy sa nezobrazuje pre obyčajný Rafi request alebo iný zdroj.
- Aj kontakt v sekcii `Manuálne` môže dostať tento link, ale iba z autentifikovaného privátneho indexu a iba keď jeho lokálny prípad aj vlastnícky register zhodne potvrdzujú aktuálny stav `manual_user`, vlastníka `user`, režim `manual` a rovnaký bezpečný Tinder identifikátor. Duplicitné zobrazované meno, chýbajúca väzba alebo WhatsApp-only kontakt zlyhá bezpečne bez linku. Klient URL znovu striktne validuje, drží ju iba v pamäti a otvorí ju v izolovanom novom kontexte.
- Tinder web nemá overený bezpečný URL parameter na predvyplnenie správy. Ak je návrh presne viazaný na aktuálny context/history hash alebo na čerstvý manuálny snapshot, iPhone Lab po jednom výslovnom kliknutí najprv otvorí validovaný chat a pokúsi sa návrh vložiť iba do systémovej schránky. Text nikdy nevkladá do URL ani úložiska. Pri odmietnutom clipboard oprávnení chat otvorí a jasne oznámi, že kopírovanie zlyhalo; paste aj send vždy vykonáva používateľ.
- Manuálny snapshot sa pri worker synchronizácii obnovuje iba read-only z aktuálnej serverovej histórie. Lokálne dôveryhodná kópia chráni snapshot pred úpravou cez klienta. Archív sa zmení iba pri rozdiele profilu alebo histórie zo servera; kliknutie, clipboard, HTTP/WS úspech ani používateľovo tvrdenie nie sú dôkaz odoslania. Nová serverová správa zneplatní starý Rafi návrh ako `stale`, kým nevznikne nový návrh pre nový snapshot.
- 2026-10-24 root cause viditeľnosti: vlastnícky register `manual_user` a privátny index manuálnych konverzácií boli dva oddelené zoznamy; jednorazový príkaz vlastníctva nevytvoril záznam v allowliste, preto nový manuálny kontakt klient nemohol zobraziť. Worker teraz materializuje každý presne zhodný `owner=user` + `mode=manual` + `manual_user` Tinder prípad do privátneho indexu idempotentne. Klient skladá sekciu Manuálne aj z privátneho indexu, takže kontakt nepotrebuje duplicitný WhatsApp záznam.
- Všetky plochy používajú rovnaký obyčajný zelený podčiarknutý odkaz `Otvoriť chat v Tinderi`. Otvorenie odkazu nikdy nemení clipboard. Ak existuje čerstvý návrh, samostatné tlačidlo `Skopírovať návrh` vykoná iba používateľom vyžiadané kopírovanie; paste a send ostávajú manuálne.

### Policy pred automatickým Tinder odoslaním (2026-10-24)

- **Používateľská bezpečnostná policy:** pred každým budúcim automatickým odoslaním najprv otvoriť presne overenú trasu cieľového chatu, počkať najmenej 30 sekúnd a až potom vykonať odosielaciu cestu. Tridsať sekúnd je výslovná policy používateľa; nejde o zachytenú požiadavku protokolu Tinder.
- **Overený transportný fakt:** sanitizovaný one-shot záchyt potvrdil poradie úspešný dokumentový `GET https://tinder.com/app/messages/{match_id}` → čakanie dlhšie než 30 sekúnd → outbound protobuf field 7 cez `wss://keepalive.gotinder.com/{session}`. Identita otvoreného chatu a odosielacieho rámca sa porovnala presne iba v pamäti.
- Zachytený outbound websocket rámec potvrdzuje odosielací transportný pokus, nie prijatie ani doručenie správy. Stav `sent` stále vyžaduje samostatné read-only overenie aktuálnej histórie; samotný rámec, HTTP úspech alebo identifikátor odpovede na to nestačí.
- Pred odoslaním musí automatizácia zlyhať bezpečne, ak nevie v tom istom jednorazovom kontexte preukázať posledný úspešný 2xx open presného cieľového chatu, nezmenenú identitu a uplynutie aspoň 30 sekúnd. Nesprávne poradie, kratší interval, cache-only navigácia, iný chat alebo nejednoznačný rámec send zablokujú.
- Identifikátor, text, tokeny, hlavičky a websocket payload sa nesmú zapisovať do diagnostiky. Sanitizovaný výsledok môže obsahovať iba pevné šablóny trás, poradie, interval, typ dôkazu a výslovné `delivery_confirmed: false`.
- Lokálny API executor nemá browserový/WebSocket aktuátor, ktorý by vedel sám vytvoriť tento dôkaz otvorenia. Runtime preto pred každým POST zlyhá bezpečne do `transport_blocked` s `automatic_retry: false`, pokiaľ nie je vložená implementácia pre-send brány s presnou identitou a najmenej 30-sekundovým intervalom. Read-only načítanie histórie nie je náhradou otvorenia webového chatu.
- Pre-send brána uloží pred začiatkom crash-safe stav `open_pending`. Pád v tomto stave nemôže pokračovať POSTom ani automatickým retry. Až validný dôkaz vráti prípad do kontrolovaného stavu; tesne pred POST sa naďalej atomicky uloží `attempt_started`, takže neistý výsledok sa nikdy neposiela znova.
