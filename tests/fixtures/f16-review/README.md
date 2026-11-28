# f16-clean-preview recorded source inputs

Offline, verbatim source pack for Scripto’s Flight 16 preview regression fixtures (review-rules-v1.md section D).

Nothing in the tracker repo or live app was changed. No posts were published.

## Files

| Path | What it is |
|---|---|
| `/workspace/tusk/fixture-inputs/sources.json` | Array of recorded inputs (95 X posts + 10 articles) |
| `/workspace/tusk/fixture-inputs/README.md` | This coverage note |
| `/workspace/tusk/fixture-inputs/articles/*.md` | Article text as stored in `sources.json` (title, author/date where stated, verbatim relevant paragraphs) |
| `/workspace/tusk/fixture-inputs/raw/extracted_x_posts.json` | Raw X payload fields used to build the posts (handle, `created_at`, full `note_post` body when present) |

`retrieved_at` on every record is `2026-11-28T12:36:20Z` (28 Nov 2026, 12:36 GMT, Europe/London).

## Record schema

Each object has: `id`, `vehicle`, `kind` (`x_post` or `article`), `handle_or_outlet`, `url`, `published_utc`, `published_uk`, `text`, `tier` (`1` or `2`), `retrieved_at`.

Extra fields for the fixtures (safe to ignore if unused):

- `fixtures`: section D fixture numbers this record supports (1–6)
- `expected_exclude: true` on the stale 27 Oct @Kisalay_ post only
- `page_note` on Next Spaceflight hardware pages (no article dateline; `published_utc` / `published_uk` are null)

`text` is never paraphrased. For X posts it is the full post body (`note_post` when the API returned a longer note). For articles it is the title, author and date (when the page stated them) plus the verbatim relevant paragraphs from a WebFetch conversion of the live page. Typography in article records may differ slightly from the site HTML (curly quotes, heading markers); wording is not rewritten.

`published_uk` is `created_at` converted with `Europe/London`. British Summer Time (UTC+1) ended at 01:00 UTC on 25 Oct 2026, so posts before that instant are `+01:00` and later ones are `+00:00`. Article datelines are dates only; exact clock times were not stated on the pages.

## Tier

- **Tier 1:** `NASASpaceFlight.com` articles and `@NASASpaceflight` X posts, matching sources.js / Scripto’s proposal.
- **Tier 2:** all other accounts and outlets, including NSF-credited photographers (@ENNEPS, @colleenadastra, @CeaserG33) and Next Spaceflight / SpaceBytes. Scripto may promote NSF-credited photographer posts to Tier 1 if that is how `sources.js` already treats them; this pack does not.

## Coverage by fixture

### 1. B23 cryo proof dated 15 Oct (not 16). One test, completed, “most likely” pass

**Covered.** Event date 15 Oct is explicit in @StarshipGazer (`today. 10/15/26`, posted 16 Oct 01:24 UK). @ENNEPS (16 Oct 12:44 UK) is the 12-hour duration source: “extended cryo test over the course of 12 hours yesterday”. Completion: @Blobifie 2111042672509252049 (“succesfully completed its 1st cryo test”, 16 Oct 11:32 UK) and @_Testflight_ 2111074773816217616. NSF 25 Oct: “Booster 23 completed cryo-proof testing on Oct. 15”. NSF 18 Oct quotes the ENNEPS 12-hour post and says testing “concluded over the weekend”. Next Spaceflight B23 lists only Cryogenic Proof Test #1 on Thu Oct 15. @WillWarden147: “SpaceX hasn't confirmed a result” — this is the hook for “most likely” pass rather than a confirmed pass. No SpaceX statement of pass/fail is in the pack.

### 2. No B23 “static fire / all 33 Raptors” inferred line

**No dedicated source required (negative fixture).** None of the recorded B23 sources in this pack assert a B23 static fire or that B23 has all 33 Raptors installed. Mentions of a 33-engine static fire in the pack refer to **Booster 22** (Flight 15), e.g. the NSF 30 Oct article and the @Kisalay_ 27 Oct post (which is a stale S42 input, expected_exclude). The pipeline must not copy those onto B23.

### 3. B23 18 Oct return → raptor_install, cryo context kept

**Covered.** @RoughRidersShow 2111682826219233549: leaving Massey’s “after completing Cryogenic Proof testing”. @TrackingTheSB 2111681468724601021: “headed back to the production site” (18 Oct 05:51 UK). @ARealRocketMan 2111857397866340626: “rolled back from Massey's to Mega Bay 1 following its cryo testing campaign”. NSF 18 Oct (Tier 1): “The testing concluded over the weekend with a Sunday morning trip back to Mega Bay 1 for engine installation.” @TrackingTheSB weekly 18 Oct notes B23 completed only one cryogenic proof test before rolling back.

### 4. B23 28–30 Oct = cryo round 2: no visible testing, purpose unconfirmed; 30 Oct return exists; 12 Oct stand names are the same stand

**Covered.**

- 12 Oct same stand, two names: @Blobifie 2109745968048668966 “lifted onto the cryo stand”; @LabPadre 2109774440041259378 “placed onto the thrust sim stand prior to moving to the Massey outpost tonight.”
- Second visit: @RGVaerialphotos 2115312218590126505 “headed to Massey's once again” (28 Oct 05:18 UTC); @TrackingTheSB arrival / stand / Highway 4 posts 27–30 Oct.
- No visible testing + unconfirmed purpose: NSF 30 Oct (Tier 1): “after spending over two full days at the cryo station, the booster did no visible testing. It could’ve done an ambient pressure test, but there were no noticeable vents to show either way. Booster 23 then rolled back to Mega Bay 1 early on Oct. 30.” @Blobifie 2116057236825166183: “returned to the build site after having done seemingly nothing at Masseys.” @ENNEPS: “some unknown testing.”
- 30 Oct return to MB1: @LabPadre 2116093506200453375, @ENNEPS 2116083266931270039, @TrackingTheSB 2116033100098752617, @YouTubeify 2116198873345544505.

### 5. S43: both proof tests 23 Oct (one round, 22–26 Oct), return overnight 25–26 Oct

**Covered.** 22 Oct rollout posts from @Blobifie, @LabPadre, @ENNEPS, @RGVaerialphotos, @TrackingTheSB, @Flight2Starship. Tests on 23 Oct: @Blobifie 2113741703119253806 (started; note the typo “ihas”), @Flight2Starship / @TrackingTheSB underway, @ENNEPS 2113884113765646669 “multiple rounds of cryo testing over 10 hours during the afternoon and into the night,” @_Testflight_ first test completed, @Blobifie 2114022592189493492 (24 Oct 16:53 UK) “completed 2 cryo proof tests yesterday.” NSF 25 Oct: “Ship 43 recently completed cryo-proof testing on Oct 23.” NSF 30 Oct: “rolled out to Massey’s on Oct. 22 and completed both cryo-proof tests on Oct. 23. The ship then rolled back to Mega Bay 2 on Oct. 26.” Return posts overnight 25–26 Oct (early 26 Oct UTC) from @NASASpaceflight, @RGVaerialphotos, @ENNEPS, @_Testflight_, @Blobifie, @LabPadre, @colleenadastra, @Flight2Starship, @TrackingTheSB. @TrackingTheSB weekly 25 Oct also records two cryo tests on Oct. 23 and a rollback scheduled for Oct. 25.

**Date discrepancy (do not silently rewrite):** Next Spaceflight S43 lists Cryogenic Proof Test #1 on Fri Oct 23 and #2 on Sat Oct 24, each saying “a pair of cryogenic proof tests within the same window.” NSF and @Blobifie date **both** tests to 23 Oct. Fixture 5 follows NSF / Blobifie (both on 23 Oct). The Next Spaceflight page is included verbatim so the pipeline can be tested against the conflict.

### 6. S42: two cryo tests 3–4 Sep; 27 Oct “more cryo” excluded as stale; 9 Oct = moved for more testing + test

**Covered.**

- 2 Sep rollout (start of the first Massey’s visit): @StarshipGazer 9/2/26, @Blobifie, @TrackingTheSB, @RGVaerialphotos.
- 3–4 Sep tests: @LabPadre / @Flight2Starship first test underway on 3 Sep; @CeaserG33 and @colleenadastra flyover (“undergoing cryogenic testing yesterday” on a 4 Sep post); @ENNEPS 2095913555379782038: “cryo testing that went through the night and into a new morning, with at least two tanking tests spotted”; @Blobifie “completed 2 back-to-back cryo tests”; @_Testflight_ “completed two separate cryogenic proof tests.”
- 6 Sep return: @_Testflight_ 2096542625264459778 “returned … following its two separate cryo proofs”; @LabPadre, @Blobifie, @ENNEPS, @RGVaerialphotos, @TrackingTheSB, @VickiCocks15, and the 6 Sep weekly (“hard to tell how many tests … likely that S42 completed 2 tests”).
- NSF 9 Sep (Tier 1) says S42 “completed two cryogenic campaigns at Massey’s on the ship cryo stand a few days before B22 rolled” — it does **not** name 3–4 Sep. Dates come from the X posts, SpaceBytes, and Next Spaceflight.
- SpaceBytes 6 Sep: “completed two cryo-proof tests on September 3” (both dated 3 Sep, not 3–4). SpaceBytes 10 Sep: “previously completed two cryo campaigns” (second trip underway).
- Next Spaceflight S42 lists Test #1 Thu Sep 3 and Test #2 Fri Sep 4, each saying “a pair of cryogenic proof tests within the same window,” plus Test #3 Fri Oct 9.
- 9–10 Oct move + test: lift onto the cryo stand, rollout, frost on both tanks, @_Testflight_ “conducted another cryogenic proof test,” @Blobifie “completed its 3rd cryo test yesterday,” return to the production site, NSF 9 Oct article (third trip for more cryo-proof testing), @NASASpaceflight card for that article, @TrackingTheSB weekly 11 Oct.
- **Stale negative input:** @Kisalay_ 2115133927534854275, 27 Oct 17:30 UK, `expected_exclude: true`. Full note body is included. It describes engines-off “more cryogenic proof testing” during the week S42 actually static-fired (NSF 30 Oct: single-engine static fire 26 Oct, six-engine static fire 27 Oct). Must not create a new S42 cryo beat.

**Date discrepancy:** SpaceBytes dates both early-September tests to 3 Sep; ENNEPS / Next Spaceflight / the fixture wording use a 3–4 Sep window (overnight). Include all three verbatim.

### 7. LOX landing tank test article (26 Nov) never appears on B23

**Not in this pack.** The requested input list did not include the 26 Nov LOX landing tank article. @RGVaerialphotos 2109105542031639001 (11 Oct, S42 group photo mentioning “the LOX landing tank test article”) was not curated here because it is not the 26 Nov article. Scripto will need that article as a separate recorded input if fixture 7 is to run offline.

## Requested sources — retrieval status

All named X IDs and the named NSF 18 Oct / 25 Oct URLs were retrieved verbatim.

| Requested item | Status |
|---|---|
| @Blobifie 2111042672509252049 | Retrieved |
| @_Testflight_ 2111074773816217616 | Retrieved |
| @StarshipGazer 2110889490336350574 | Retrieved |
| @Flight2Starship 2110845332728807523 | Retrieved |
| @colleenadastra 2110844779269689598 | Retrieved |
| @ENNEPS 16 Oct 12-hour NSF post | Retrieved as 2111060820662571440 (16 Oct 11:44 UTC / 12:44 UK) |
| @WillWarden147 2111075360096113040 | Retrieved |
| @RoughRidersShow 2111682826219233549 | Retrieved |
| @ARealRocketMan 2111857397866340626 | Retrieved |
| NSF 18 Oct flight-15-16-milestones article | Retrieved |
| NSF 25 Oct roberts-road-expansion-flight-16 | Retrieved |
| RGVaerialphotos + TrackingTheSB 27–28 Oct B23 | Retrieved |
| NSF 30 Oct article (no visible testing / return to MB1 + S43 tests) | Retrieved as https://www.nasaspaceflight.com/2026/10/spacex-static-fires-flight-15/ |
| 30 Oct X posts of B23 returning to MB1 | Retrieved (@LabPadre, @ENNEPS, @Blobifie, @TrackingTheSB, @YouTubeify) |
| B23 12 Oct stand lift (@Blobifie, @LabPadre) | Retrieved |
| S43 22 Oct rollout, 23 Oct tests, 25–26 Oct return | Retrieved (X + NSF 30 Oct + Next Spaceflight S43) |
| NSF 9 Sep S42 article | Retrieved; does not itself state 3–4 Sep |
| Next Spaceflight S42 / S43 / B23 hardware pages | Retrieved |
| SpaceBytes 6 Sep (two tests on 3 Sep) | Retrieved |
| S42 6 Sep return posts | Retrieved |
| S42 9 Oct move / test posts + NSF 9 Oct article | Retrieved |
| Stale 27 Oct @Kisalay_ “more cryo” | Retrieved, `expected_exclude: true` |

## Missing / not retrieved verbatim

- **Fixture 7 (26 Nov LOX landing tank article):** not requested in the input list; not fetched.
- **NSF 9 Sep** does not contain the strings “3 September” or “4 September”; those dates are in the X posts, SpaceBytes, and Next Spaceflight only.
- **Next Spaceflight pages** have no article dateline and were captured as live hardware timelines on 28 Nov 2026; they may have been edited since the original events.
- Article bodies are WebFetch markdown conversions, not saved HTML. If a character-perfect HTML fixture is required, re-download the pages.
- A few lower-signal commentary posts (e.g. @outerspacetoday 7 Sep, @monste_67) were seen in search and omitted from the curated pack; the primary tracker and NSF/SpaceBytes/Next Spaceflight records are included.
- No public mid-install tight shot of B23 or S43 was collected (out of scope for this source pack).

## Suggested fixture assertions (for Scripto)

1. Display date for the B23 first cryo pill/beat is **15 Oct**, not 16 Oct; one completed test; wording may use “most likely” pass; must not invent a SpaceX confirmation.
2. No B23 static-fire or “all 33 Raptors” line.
3. 18 Oct return files under **raptor_install**, with cryo-test context and Mega Bay 1 / engine installation kept in the text.
4. 28–30 Oct is a **second cryo round**; no visible testing; purpose unconfirmed; 30 Oct return beat exists; 12 Oct “cryo stand” and “thrust sim stand” merge to one beat.
5. S43: two proof tests dated **23 Oct**, one round 22–26 Oct, return overnight 25–26 Oct.
6. S42: two cryo tests **3–4 Sep** (or a 3–4 Sep window); 9 Oct move + test merged into that later round; @Kisalay_ 27 Oct excluded as stale.
7. Still needs the 26 Nov LOX landing tank article as a recorded input.
