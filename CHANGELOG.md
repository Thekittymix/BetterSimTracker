# Changelog

All notable changes to BetterSimTracker are documented here.

## [2.2.4.16-exp210] - 2026-03-30
### Fixed
- Fixed custom array stat editing so changing `Item Max Length` now saves and restores correctly instead of reading the hidden text-stat max-length field from another wizard panel.

## [2.2.4.16-exp211] - 2026-03-30
### Fixed
- Experimental manual user-tracker edits now preserve the explicit user owner alongside resolver-backed scene continuity, so saving a user card no longer makes that card fall into `Inactive`.
- Experimental tracker cards now render long `short_text` custom-stat values as wrapped multiline text, and `Thought` no longer shows a dead `More thought` control when there is no real overflow to expand.
- Experimental extraction prompts now split target-card context from non-target card context and keep legacy included character-card text out of the recent-message block, so user extraction stops copying character-card traits into user state and target character extraction stops mixing in other characters' cards.

## [2.2.4.16-exp212] - 2026-03-30
### Fixed
- Experimental tracker cards now give long `short_text` values a real expand/collapse control instead of leaving them visually cut off with no way to reveal the rest of the text.
- Experimental `Thought` expand controls now start hidden and only appear after real measured overflow, so cards no longer show dead `More thought` buttons for text that already fits.

## [2.2.4.16-exp213] - 2026-03-30
### Fixed
- Experimental tracker cards now resync `short_text` and `Thought` overflow controls after viewport/layout changes, so mobile-width reflow no longer leaves a hidden `More` toggle behind when text starts overflowing only after the resize.

## [2.2.4.16-exp209] - 2026-03-29
### Fixed
- Experimental mixed-group Camp replies now keep scene-only participants in the registry-backed display pool when the chat is rendering the full group scene, so known non-speaking members like Chloe no longer disappear from tracker cards just because they have no fresh stats on that specific reply.

## [2.2.4.16-exp208] - 2026-03-29
### Fixed
- Experimental mixed-group resolver candidate discovery now keeps muted group members in the known identity universe, so manual `speak` replies from muted multi-character cards still reuse known Camp aliases instead of minting fresh `bst_narrative:*` entities for Raleigh, Garret, Blake, or Ashley.

## [2.2.4.16-exp207] - 2026-03-29
### Fixed
- Experimental dynamic-character materialization now reuses known source-backed Camp alias identities before minting new narrative entities, so Camp-authored mixed turns no longer split known members like Raleigh or Garret into fresh `bst_narrative:*` trackers just because the resolver returned the alias/source family in parallel or the model used a near-match spelling.

## [2.2.4.16-exp206] - 2026-03-29
### Fixed
- Experimental tracker cards now drop generic owner duplicates when the same Camp member is already represented by a source-backed multi-character alias, so inactive Camp cards stop rendering twice on the same message.
- Experimental `Dynamic Characters` creation is now restricted to character-like scene actors instead of props or objects, so rekwizyty like maps, lockets, or parchment no longer materialize as their own tracker entities.

## [2.2.4.16-exp205] - 2026-03-29
### Fixed
- Experimental settings now restore the saved fallback mood-symbol width, height, radius, and font-size values when reopening the BST settings modal instead of showing reset defaults.

## [2.2.4.16-exp204] - 2026-03-28
### Fixed
- Experimental fallback mood-symbol display now lets long emoji/kaomoji wrap cleanly instead of clipping in tracker cards, including on narrow mobile layouts.
- Experimental Display settings now actually save fallback mood-symbol size controls when closing the settings modal.

## [2.2.4.16-exp203] - 2026-03-28
### Fixed
- Experimental BST stat macros now follow the scope-specific `trackUser` and `trackCharacters` flags instead of letting the legacy shared `track` flag suppress registration, so user-only or character-only custom stat macros still resolve correctly when extraction tracking is disabled for that stat but the scoped stat itself remains active.

## [2.2.4.16-exp202] - 2026-03-28
### Fixed
- Experimental diagnostics clearing now refreshes the visible latest debug payload immediately in the open settings modal instead of leaving stale dump text on screen until the modal is reopened.
- Experimental persisted tracker snapshots now prune stale owner-keyed compatibility buckets down to the current active owners while preserving declared global stats, so mixed latest payloads stop carrying leftover user or narrative-owner values that no longer belong to the current turn state.
- Experimental custom-stat macros now fall back to configured default values when the current owner-scoped bucket has not been materialized yet, so runtime macro output matches the effective tracker card state instead of collapsing to an empty string.
- Experimental diagnostics reports now include a compact entity-registry lifecycle summary, making archived/reactivated entity state observable from BST diagnostics without changing normal tracker-card visibility rules.

## [2.2.4.16-exp201] - 2026-03-27
### Fixed
- Experimental user-turn extraction now keeps prompt-level `{{char}}` pinned to a non-user speaker when included character-card text contains ST-style `{{char}}` placeholders, so character descriptions no longer collapse onto the current persona/user name just because the tracker request itself is user-scoped.

## [2.2.4.16-exp200] - 2026-03-27
### Fixed
- Experimental explicit `bst_stat_char_*_<target_slug>` macros now register against the current chat-scoped dynamic-character targets instead of source-card wrapper names, so mixed chats resolve owner-targeted custom stat macros for both source-backed aliases and narrative entities.
- Experimental settings macro examples now preview the same chat-scoped dynamic-character targets that runtime macros actually expose, and multi-target chats no longer imply that bare `bst_stat_char_*` macros are available when only explicit target slugs are unambiguous.
- Experimental settings macro previews now keep enough visible target examples to include the full current mixed-scene cast in the common five-target case, so live settings no longer drop the last dynamic character while runtime macros already resolve it.

## [2.2.4.16-exp199] - 2026-03-27
### Fixed
- Experimental mixed-scene user-turn persistence now realigns saved `resolvedEntities` with the merged scene source of truth and backfills omitted scene members before lifecycle sync, so partial resolver output no longer flips the rest of the current scene inactive just because one reactivated narrative entity dominated the user-turn resolution.

## [2.2.4.16-exp198] - 2026-03-27
### Fixed
- Experimental mixed-scene user-turn continuity now merges unresolved prior scene participants back into a partial resolver-scene result unless the current user message explicitly sends them away, so narrative reactivation no longer drops silent existing scene members during the same user turn.

## [2.2.4.16-exp197] - 2026-03-27
### Fixed
- Experimental mixed-scene user-turn fallback now carries the previous resolver-backed scene continuity forward when the current user message narrows focus without explicitly clearing the scene, so inactive narrative entities and source-backed aliases no longer drop out of the next lifecycle update just because a user-only turn did not rematerialize them directly.

## [2.2.4.16-exp196] - 2026-03-27
### Fixed
- Experimental per-message `entityOwnerMap` writes now stay scoped to identities actually materialized by that message payload, so user-only turns no longer leak scene-only source-card aliases or narrative entities into saved owner identity metadata.

## [2.2.4.16-exp195] - 2026-03-27
### Fixed
- Experimental tracker payload writes no longer persist scene-only narrative entities into a user-only message `entityOwnerMap`, so dynamic scene continuity stops leaking unrelated narrative identities into turns that only materialize user-owned state.

## [2.2.4.16-exp194] - 2026-03-27
### Fixed
- Experimental user-turn intercept/replay flow is back to the earlier `main`-style contract for both single and group chats, removing the extra reclaimed-generation retry/grace logic that had drifted on `experimental` and started causing duplicate AI replies during normal user-turn testing.

## [2.2.4.16-exp193] - 2026-03-27
### Fixed
- Experimental single-chat reclaimed-generation flow now gives late AI renders a short grace window before replay, so a stopped in-flight reply no longer races into a duplicate extra AI turn when SillyTavern finishes rendering just after the user-turn tracker completes.
- Experimental AI extraction baselines now overlay the latest saved user-turn continuity before fallback merging, so fresh user `pose` and `lastThought` no longer regress to older values inside the next AI tracker payload and macro state.

## [2.2.4.16-exp192] - 2026-03-27
### Fixed
- Experimental single-chat `USER_MESSAGE_RENDERED` gating now reclaims an already-started AI generation before any AI render lands, so the user-turn tracker can become the real fresh source of truth again instead of letting later AI tracker state inherit stale user-owned values.

## [2.2.4.16-exp191] - 2026-03-27
### Fixed
- Experimental BST local cache now prunes old chat-scoped history snapshots globally and keeps a much tighter debug-storage budget, so SillyTavern keeps more `localStorage` headroom for its own draft save path even on long-lived, debug-heavy chats.

## [2.2.4.16-exp190] - 2026-03-27
### Fixed
- Experimental parser no longer clamps AI `Last Thought` text to the old generic 200-character text limit, so longer thought entries now survive from raw model output into saved tracker payloads and expandable tracker cards.

## [2.2.4.16-exp189] - 2026-03-27
### Fixed
- Experimental user-turn tracker cards now preserve the explicit user owner in the UI render pool even when fallback scene continuity still carries a source-card scene owner, so user messages no longer render as scene-only cards while the actual user stats are already saved.

## [2.2.4.16-exp188] - 2026-03-27
### Fixed
- Experimental BST local snapshot storage now compacts per-scope `localStorage` history copies and prunes the cross-chat `latestByScope` cache, so tracker persistence no longer grows unbounded across chats just to keep runtime fallback snapshots available.

## [2.2.4.16-exp187] - 2026-03-27
### Fixed
- Experimental single-chat user-turn tracking now runs inline on the awaited `USER_MESSAGE_RENDERED` hook before the natural AI reply continues, so BST no longer needs to stop and replay generation just to preserve the `user-turn tracker first` contract.
- Tracker cards now expose the thought expand affordance for wrapped longer `Last Thought` text sooner, so longer thoughts no longer disappear behind the card line clamp without a way to expand them.

## [2.2.4.16-exp186] - 2026-03-26
### Fixed
- BST debug persistence now trims oversized prompt/raw-output traces and evicts old chat-scoped diagnostics, so debug mode no longer fills `localStorage` badly enough to break SillyTavern's normal user-input save path.

## [2.2.4.16-exp185] - 2026-03-26
### Fixed
- Standard mode no longer renders persisted `narrative-entity` cards from mixed/dynamic chat history, so switching off `Dynamic Characters` stops leaked dynamic cards from lingering in the visible tracker UI.

## [2.2.4.16-exp184] - 2026-03-26
### Fixed
- Experimental `Dynamic Characters` mode now stays a read-time normalization only for legacy split mode tokens, instead of silently rewriting stale `experimental` settings on startup.

## [2.2.4.16-exp183] - 2026-03-26
### Fixed
- Experimental startup now normalizes legacy split entity-tracking values back into the single `Dynamic Characters` source-of-truth setting, so old experimental saves no longer keep stale `dynamic_entities` or `multi_character` mode tokens alive behind the new UI.

## [2.2.4.16-exp182] - 2026-03-26
### Changed
- Experimental entity tracking settings now expose one `Dynamic Characters` mode instead of separate `Multi-Character` and `Dynamic Entities` options, while keeping the same dynamic-character resolver and lifecycle flow under the single mode.

## [2.2.4.16-exp181] - 2026-03-26
### Fixed
- Experimental resolver candidate scoping now applies the same scene-first narrowing to AI turns once a prior tracked scene exists, so follow-up replies no longer revive the whole source-card alias roster after a correctly narrowed mixed-scene user turn unless the reply itself explicitly brings another owner back into scope.

## [2.2.4.16-exp180] - 2026-03-26
### Fixed
- Experimental user-turn resolver candidate scoping now starts from the previous tracked scene plus names explicitly mentioned in the current user message, so dynamic and multi-character chats no longer leak the whole source-card roster back into entity resolution while still allowing explicit off-scene mentions to widen the candidate set on purpose.

## [2.2.4.16-exp179] - 2026-03-26
### Fixed
- Experimental dynamic-entity resolver candidate construction now keeps archived narrative entities available for later user/AI reactivation and carries their real registry identity into candidate metadata, so reintroduced story entities no longer disappear from resolver selection just because their visible cards already aged into archived state.

## [2.2.4.16-exp178] - 2026-03-26
### Fixed
- Experimental user-turn snapshots now keep resolver scene entities and scene-scoped lifecycle continuity intact, so active scene cards no longer disappear or get archived just because a user message only writes user-owned stats before the next AI reply lands.

## [2.2.4.16-exp177] - 2026-03-26
### Fixed
- Experimental dynamic-entity resolver reuse now matches article-prefixed creation proposals like `the spirit` back onto the current candidate or archived narrative registry entity before minting a new ID, and exact alias collisions now stay conservative instead of silently reusing the first same-name candidate.

## [2.2.4.16-exp176] - 2026-03-26
### Fixed
- Experimental prompt injection now treats `track: false` as a hard off-switch for custom stats, so disabled stats no longer leak back into injection semantics or scene lines just because stale per-scope flags still say `trackCharacters` or `trackUser`.

## [2.2.4.16-exp175] - 2026-03-26
### Fixed
- Experimental prompt-injection owner stat gating now carries the current entity-backed owner identity into `statEnabled` checks, so same-name ST owner defaults no longer suppress mood/thought/custom injection lines for a different live narrative entity already pinned by `entityOwnerMap`.

## [2.2.4.16-exp174] - 2026-03-26
### Fixed
- Experimental extractor continuity and custom-stat seed selection now keep built-in/custom previous-state reads pinned to the current entity-backed tracker snapshot before any owner-name fallback, so stale same-name buckets no longer hijack live extraction continuity or trick first-run custom stats into reusing another entity's history.

## [2.2.4.16-exp173] - 2026-03-26
### Fixed
- Experimental extraction prompt builders now keep built-in and custom owner-state reads pinned to the current entity-backed tracker snapshot before any registry fallback, so stale same-name registry aliases no longer leak into unified/sequential prompt context when the live tracker payload already points at a different entity.

## [2.2.4.16-exp172] - 2026-03-26
### Fixed
- Experimental prompt-injection and summary read models now keep owner-scoped built-in/custom stat lookups pinned to the current entity-backed owner snapshot before any registry fallback, so stale same-name registry aliases no longer hijack prompt state lines or summary text when the live tracker payload already points at a different entity.

## [2.2.4.16-exp171] - 2026-03-26
### Fixed
- Experimental runtime character stat macros now keep their target identity scoped to the current entity-backed macro target instead of broad same-name registry aliases, so stale owner-to-entity registry mappings no longer hijack `bst_stat_char_*` lookups when the live tracker payload already points at a different entity.

## [2.2.4.16-exp170] - 2026-03-26
### Fixed
- Experimental continuity/presence selection now keeps owner-scoped lookup names narrowed to explicit entity ids when they are already known, so baseline relevance checks and tracked-value presence reads no longer reuse same-name state from a different registry-backed entity through broad owner-name fallback.

## [2.2.4.16-exp169] - 2026-03-26
### Fixed
- Experimental seeded baseline/history owner-stat reads now keep same-name continuity scoped to the explicit active entity id, so seed/default hydration no longer treats a different registry-backed owner label as proof that the current dynamic or multi-character entity already has seeded state.

## [2.2.4.16-exp168] - 2026-03-26
### Fixed
- Experimental graph diagnostics and rendered graph modals now share the same entity-backed snapshot selector, so same-name cards no longer diverge between graph-open traces and the actual timeline data shown in the modal.

## [2.2.4.16-exp167] - 2026-03-26
### Fixed
- Experimental graph targeting now keeps the clicked card's explicit entity identity through the full graph open path, so same-name tracked entities no longer collapse back to owner-name-only history lookups when opening timeline charts from rendered cards.

## [2.2.4.16-exp166] - 2026-03-26
### Fixed
- Experimental entity-registry sync now keeps same-name cards distinct by their entity-backed render targets during UI and continuity lifecycle updates, so registry writes no longer collapse different tracked entities back onto one owner-name path after render.

## [2.2.4.16-exp165] - 2026-03-26
### Fixed
- Experimental tracker rendering now keeps entity-backed cards distinct when different tracked entities share the same visible owner label, so registry-backed multi-character and dynamic-entity cards no longer collapse back into a single render target by owner name alone.

## [2.2.4.16-exp164] - 2026-03-26
### Fixed
- Experimental entity lookup/read paths now resolve owners through the current message `entityOwnerMap` aliases and canonical names before falling back to registry owner-name matches, preventing stale same-name registry entries from hijacking narrative-entity cards during continuity reads, UI registry lookups, and by-entity shadow-state access.

## [2.2.4.16-exp163] - 2026-03-26
### Fixed
- Experimental message-scoped projection now preserves `narrative-entity` identity when a dynamic entity shares the same visible owner label as a multi-character source-card alias, so runtime continuity no longer remaps those cards back onto the source-card alias path by name alone.

## [2.2.4.16-exp162] - 2026-03-26
### Fixed
- Experimental dynamic narrative entities now ignore per-owner BST defaults across the remaining runtime read paths too, so `trackerEnabled`, `statEnabled`, mood-source overrides, and other owner-default reads stay scoped to real ST owners instead of leaking back onto `narrative-entity` cards by matching name alone.

## [2.2.4.16-exp161] - 2026-03-26
### Fixed
- Experimental dynamic-entity bootstrap/default seeding is now entity-aware, so fresh `narrative-entity` IDs seed from the generic narrative path instead of inheriting SillyTavern character defaults just because an owner label or source-card alias happens to overlap.

## [2.2.4.16-exp160] - 2026-03-26
### Added
- Experimental `Entity Tracking Mode` now exposes an opt-in `Dynamic Entities` path, allowing the resolver to promote clearly new story entities into runtime-owned `narrative-entity` IDs instead of forcing everything through known ST-owner aliases.

### Fixed
- Experimental runtime macro scene summaries now ignore stale scene-roster history when the related custom stat exists but is no longer tracked, so `{{bst_image_state}}` falls back to current resolver scene owners instead of reviving old roster payloads.
- Experimental resolver parsing and registry sync now preserve `narrative-entity` kinds end-to-end, reuse archived narrative entities by exact/normalized registry match before minting new IDs, and prevent mistaken `created` proposals from splitting existing tracked entities into duplicates.

## [2.2.4.16-exp159] - 2026-03-26
### Fixed
- Experimental tracker edit clones now resolve multi-character message owners through `entityOwnerMap` before preferring resolver-backed active state, so technical entity IDs stop leaking into edit-modal active owner lists when the resolver payload already went entity-first.
- Experimental persisted multi-character resolver entities now filter against tracked owners via resolved alias identity instead of raw `entity.name`, so entity-first snapshots stop dropping valid scene/message entities or looping back through technical alias labels before registry hydration.
- Experimental storage normalization now remaps resolver entity names through `entityId -> entityOwnerMap` instead of relying on raw resolver labels, so merged snapshots keep canonical owner names even when older payloads stored technical alias IDs.
- Experimental resolver owner resolution now uses a one-way technical-entity fallback only when the resolver label is actually technical, preventing new fallback loops while still recovering alias owners from `bst_mc_alias:*` payloads before registry hydration.
- Experimental message-scoped owner projection, resolver owner-array materialization, and manual active-state edits now recover owners from entity identity before using raw resolver labels, closing the remaining paths where `bst_mc_alias:*` names could survive into projected payloads or edited resolver state.

## [2.2.4.16-exp158] - 2026-03-26
### Fixed
- Experimental user-turn multi-character persistence now forces `__bst_user__` writes into the user entity bucket instead of leaking `byEntityId` mood/thought/custom values onto the active alias entity.

## [2.2.4.16-exp157] - 2026-03-26
### Fixed
- Experimental multi-character resolver now uses a tighter resolver context and a stricter `inMessage` clamp for single-focus AI replies, so silent scene members stop being promoted to active message participants on Blake-only style turns.
- Experimental generated tracker snapshots now persist `statisticsByEntityId` and custom `*ByEntityId` buckets directly during extraction, instead of leaving entity shadow state empty until a later manual edit.

## [2.2.4.16-exp156] - 2026-03-25
### Fixed
- Experimental multi-character resolver now accepts explicit empty-scene model results instead of discarding them and falling back to stale scene-owner heuristics, so end-of-scene turns can resolve to a truly empty tracked scene.
- Experimental multi-character resolver parsing is now more tolerant of minor model output drift, including owner-name-based resolved entries when the model omits `entityRef`.
- Experimental multi-character entity shadow state now synthesizes stable alias entity IDs before the registry is hydrated, so early-turn resolver writes can populate `byEntityId` state more consistently.

## [2.2.4.16-exp155] - 2026-03-25
### Fixed
- Experimental storage/runtime normalization, merged prompt state, edit clones, and diagnostics now prefer resolver-backed active owners over stale non-user `activeCharacters`, so legacy owner arrays stop overriding entity-resolved multi-character state after persistence.

## [2.2.4.16-exp154] - 2026-03-25
### Fixed
- Experimental multi-character user-turn extraction now preserves the non-user scene roster in entity-first resolver state instead of collapsing fallback scene ownership to `__bst_user__`, which lets the following AI turn inherit the correct prior scene when model-side resolution falls back.

## [2.2.4.16-exp153] - 2026-03-25
### Fixed
- Experimental user-turn replay in multi-character group chats now respects resolver-backed end-of-user-message scene owners when choosing a replay target, instead of blindly forcing the last AI speaker or first enabled member.
- Experimental user-turn replay now skips the forced AI replay entirely when the user-turn resolver explicitly ends the scene with no remaining tracked group entities, preventing ghost replays on empty-scene turns.

## [2.2.4.16-exp152] - 2026-03-25
### Fixed
- Experimental extraction placeholder now keeps zero-progress single-step startup states in `preparing` instead of showing misleading fake stage labels like `stage 1/1 (0%)` before real extraction progress begins.

## [2.2.4.16-exp151] - 2026-03-25
### Fixed
- Experimental multi-character `no_active_characters` continuity turns now synchronize entity-registry lifecycle state before render, so inactive aliases can actually reach `Archived` instead of staying stuck as visible `Inactive` cards forever.

## [2.2.4.16-exp150] - 2026-03-25
### Fixed
- Experimental multi-character card rendering no longer creates empty alias shell-cards from registry presence alone; aliases now need current tracked state, continuity state, or active participation before they are backfilled into the visible card pool.

## [2.2.4.16-exp149] - 2026-03-25
### Fixed
- Experimental custom numeric stat defaults now preserve an explicit `0` instead of falling back to `50` when saving/editing stats, rebuilding numeric stat definitions, or generating custom numeric extraction prompts.

## [2.2.4.16-exp148] - 2026-03-25
### Fixed
- Experimental user-turn gate now issues only one stop request per intercepted generation and retries transient replay failures instead of dropping the turn immediately when the backend returns retryable proxy/API errors during replay.

## [2.2.4.16-exp147] - 2026-03-25
### Fixed
- Experimental storage/runtime normalization now preserves explicit empty `entityResolution` state on no-active turns instead of collapsing it away, so later continuity/lifecycle reads can distinguish an intentionally empty end-of-message scene from missing resolver data.

## [2.2.4.16-exp146] - 2026-03-25
### Changed
- Experimental multi-character resolver prompt now states more explicitly that `sceneOwners` is the end-of-message roster, that leavers may still be `messageOwners` without remaining in `sceneOwners`, and that explicit user-turn leave/stay instructions should be treated as authoritative end-state scene guidance.

### Fixed
- Experimental extraction placeholder progress no longer treats single-step preflight/baseline setup as a fake visible `stage 1/1`; resolver/baseline preflight stays in `preparing` until real extraction stage totals exist.

## [2.2.4.16-exp145] - 2026-03-25
### Fixed
- Experimental user-turn extraction now waits for the intercepted generation to fully end before starting the first tracker request, and retryable first-pass user-turn API failures now get two delayed automatic retries instead of dropping straight into a failed tracker box on the opening user turn.

## [2.2.4.16-exp144] - 2026-03-25
### Fixed
- Experimental multi-character `no_active_characters` AI turns now keep prior alias continuity while overlaying the latest scene/global continuity from the immediately preceding message, so empty-participant turns stop reviving stale scene cards and stale global scene state from older snapshots.

## [2.2.4.16-exp143] - 2026-03-25
### Fixed
- Experimental multi-character storage, runtime merges, and diagnostics now preserve explicit message-level `activeCharacters` instead of silently widening them back to broader scene continuity during normalization, history reads, and merged prompt/runtime snapshots.

## [2.2.4.16-exp142] - 2026-03-25
### Fixed
- Experimental multi-character snapshots now persist `activeCharacters` from the actual message/request owners instead of the broader scene continuity set, and registry lifecycle sync now derives `Active/Inactive/Archived` from those explicit active owners instead of treating every in-scene alias as currently active.
- Experimental user-turn extraction now waits for the intercepted generation to settle before running the first tracker request, and it performs one automatic retry on initial retryable API/request failures instead of immediately falling into the old manual-retrack-only path.
- Experimental extraction placeholder no longer shows a fake `stage 1/1 (0%)` during resolver preflight when the UI is still in the alias-resolution phase.

## [2.2.4.16-exp141] - 2026-03-25
### Fixed
- Experimental multi-character AI ambient replies with no resolved message participants now clamp their scene continuity to the latest user-declared scene instead of re-expanding back to the full source-card ensemble.

## [2.2.4.16-exp140] - 2026-03-25
### Changed
- Experimental multi-character tracker snapshots now keep scene presence separate from speaker/message ownership more consistently across persistence, storage normalization, lifecycle reads, and merged runtime state, so silent in-scene aliases can remain part of scene continuity without being mistaken for the current speaker.

## [2.2.4.16-exp139] - 2026-03-25
### Fixed
- Experimental multi-character lifecycle now treats resolver message owners as the active-owner source instead of broad scene owners, so silent scene members stop being revived as active just because they remain present in continuity.
- Experimental extraction placeholder no longer shows a fake `stage 1/1` during the resolver preflight phase before real extraction stage totals exist.

## [2.2.4.16-exp138] - 2026-03-24
### Fixed
- Experimental multi-character storage/runtime normalization now repairs stale legacy `activeCharacters` from resolver `messageOwners` first, so explicit message-owner scope survives storage merges, prompt/runtime reads, and edit clones instead of silently re-expanding to full scene owners.

## [2.2.4.16-exp137] - 2026-03-24
### Fixed
- Experimental multi-character AI extraction and persisted active-owner snapshots now stay scoped to resolver message owners instead of expanding back out to the full scene-owner set, so silent aliases no longer get re-extracted and marked active just because they remain present in the scene.

## [2.2.4.16-exp136] - 2026-03-24
### Fixed
- Experimental multi-character tracker cards now respect an explicit empty `activeCharacters` set during UI lifecycle reads, so `no_active_characters` continuity turns no longer fall back to scene owners and falsely mark all alias cards as active.

## [2.2.4.16-exp135] - 2026-03-24
### Changed
- Experimental multi-character continuity now keeps the scene-owner pool separate from the active-owner set, so `no_active_characters` AI turns preserve prior scene continuity for inactive cards instead of collapsing the message into an empty tracker state.

## [2.2.4.16-exp134] - 2026-03-24
### Changed
- Experimental multi-character AI extraction now requests stat updates for the full resolver-backed scene owner set, while still preserving separate message-owner identity for the character(s) actively driving that reply.

## [2.2.4.16-exp133] - 2026-03-24
### Fixed
- Experimental multi-character user-turn cards now treat message-level user ownership as active lifecycle state, so the current user card no longer renders collapsed/inactive just because the broader scene owners exclude the user.

## [2.2.4.16-exp132] - 2026-03-24
### Changed
- Experimental multi-character AI messages that resolve to `no_active_characters` now persist a continuity snapshot for that message with no active owners, so prior entity cards can still render through normal inactive/archive behavior instead of collapsing into a tracker-skip placeholder.

## [2.2.4.16-exp131] - 2026-03-24
### Changed
- Experimental multi-character manual retracks now clear stale tracker payloads for a message when the resolver confirms there are no remaining active owners, instead of leaving the previous message tracker data in place.

## [2.2.4.16-exp130] - 2026-03-24
### Changed
- Experimental multi-character AI fallback owner resolution now clamps itself to the latest resolver-backed user-turn scene, preventing stale alias owners from being reactivated when the model resolver falls back after an explicit user-side scene transition.

## [2.2.4.16-exp129] - 2026-03-24
### Changed
- Experimental multi-character resolver and storage normalization now keep message-level owner identity separate from broader scene presence instead of silently hydrating `messageOwners` from `sceneOwners` when the resolver leaves message ownership empty.

## [2.2.4.16-exp128] - 2026-03-24
### Changed
- Experimental multi-character user-turn snapshots now keep `activeCharacters` scoped to the actual user tracker target instead of persisting resolver scene owners into the legacy active-owner array, while still preserving resolver-backed scene/message identity separately.

## [2.2.4.16-exp127] - 2026-03-24
### Changed
- Experimental multi-character entity registry now preserves correct history when older messages are retracked later, backfilling earlier lifecycle events without regressing newer entity metadata.
- Experimental multi-character registry continuity sync now includes existing tracked entities from chat registry so user-turn scene changes can mark previously active aliases inactive even when the current tracker payload only names the remaining scene owners.

## [2.2.4.16-exp126] - 2026-03-24
### Changed
- Experimental multi-character resolver-first flow now runs the model entity resolver on user turns too, and persists resolver scene/message owners separately from user-only tracker targets so registry lifecycle can follow character scene identity without polluting it with the user owner.

## [2.2.4.16-exp125] - 2026-03-24
### Changed
- Experimental multi-character entity-registry lifecycle sync no longer depends on UI render visibility (`showInactive` / display target pools), and now updates alias continuity directly from resolver-backed scene/data owners on both AI and user turns.

## [2.2.4.16-exp124] - 2026-03-24
### Changed
- Experimental multi-character manual tracker edits now mirror alias-backed built-in, numeric custom, and non-numeric custom values into persisted yEntityId state instead of updating only raw owner-name buckets.

## [2.2.4.16-exp123] - 2026-03-24
### Changed
- Experimental multi-character edit modal value reads now resolve alias-backed numeric, non-numeric, mood, and last-thought state through persisted entity ids before falling back to raw owner buckets.

## [2.2.4.16-exp122] - 2026-03-24
### Changed
- Experimental multi-character edit/debug snapshot paths now prefer resolver-backed scene/message owners over stale raw `activeCharacters`, preventing manual edit clones and diagnostics from reintroducing owner-name drift when resolver identity is already present.

## [2.2.4.16-exp121] - 2026-03-24
### Changed
- Experimental multi-character message-owner reads now use a shared resolver-backed helper, including `messageEntityIds + entityOwnerMap` fallback materialization, instead of duplicating local owner-array fallback logic in injection/runtime paths.
- Experimental multi-character entity-owner map enrichment now respects message-only resolver entity IDs instead of falling back to stale raw active owner arrays.

## [2.2.4.16-exp119] - 2026-03-24
### Changed
- Experimental multi-character summary owner collection now uses the shared resolver-backed scene-owner helper in both context-aware and contextless paths, preventing summary reads from drifting onto stale raw owner arrays or duplicated local fallback logic.

## [2.2.4.16-exp118] - 2026-03-24
### Changed
- Experimental multi-character UI target collection now resolves scene owners through the shared resolver-backed entity-id path even without live `STContext`, instead of falling back early to stale raw owner arrays.

## [2.2.4.16-exp117] - 2026-03-24
### Changed
- Experimental multi-character UI/runtime reads can now materialize resolver scene owners directly from persisted `sceneEntityIds` plus `entityOwnerMap` even when no live `STContext` registry lookup is available.

## [2.2.4.16-exp116] - 2026-03-24
### Changed
- Experimental multi-character merged prompt/runtime snapshots now normalize preferred `entityResolution.sceneOwners/messageOwners` from resolver-backed entity ids instead of leaving stale owner-name arrays beside corrected `activeCharacters`.

## [2.2.4.16-exp115] - 2026-03-24
### Changed
- Experimental multi-character summary generation now keeps owner selection aligned to resolver-backed scene identity in both context-aware and contextless summary paths, including materializing missing scene owners from persisted `sceneEntityIds` plus `entityOwnerMap`.

## [2.2.4.16-exp113] - 2026-03-24
### Changed
- Experimental multi-character chronological tracker merges now rebuild missing resolver scene/message owners from persisted entity ids plus merged `entityOwnerMap` before falling back to stale raw `activeCharacters`.

## [2.2.4.16-exp112] - 2026-03-24
### Changed
- Experimental multi-character storage normalization now rebuilds missing resolver scene/message owners from persisted entity ids plus `entityOwnerMap` before falling back to stale raw `activeCharacters`.

## [2.2.4.16-exp111] - 2026-03-24
### Changed
- Experimental multi-character entity-owner-map rebuilding now stops scanning raw stat-owner buckets once explicit resolver or entity-owner identity is already present, keeping write-path identity aligned with the resolver/entity layer.

## [2.2.4.16-exp110] - 2026-03-24
### Changed
- Experimental multi-character character-card context now prefers explicit resolver/entity targets over stale raw owner tokens when deciding which source cards to inject into extraction context.

## [2.2.4.16-exp109] - 2026-03-24
### Changed
- Experimental multi-character summary owner collection now stops reintroducing stale raw stat-owner names once explicit resolver/entity identity is already present, keeping summary generation on the same resolver/entity path as render and registry sync.

## [2.2.4.16-exp108] - 2026-03-24
### Changed
- Experimental multi-character UI owner collection now stops reintroducing stale raw stat-owner names once explicit resolver/entity identity is already present, keeping render and registry sync on the resolver/entity path instead of falling back to owner-name soup.

## [2.2.4.16-exp107] - 2026-03-24
### Changed
- Experimental multi-character retracks now prefer persisted resolver scene identity (`sceneOwners` / `sceneEntityIds`) before legacy built-in owner buckets when reusing stored owners for the next extraction pass.
## [2.2.4.16-exp106] - 2026-03-24
### Changed
- Experimental multi-character chronological tracker merges and normalization now preserve explicit `*ByEntityId` state as first-class data instead of only rebuilding entity buckets from owner-name mirrors.
## [2.2.4.16-exp105] - 2026-03-24
### Changed
- Experimental multi-character storage now accepts resolver-backed tracker payloads that carry scene identity through `entityResolution`, instead of requiring legacy raw `activeCharacters` to recognize the payload as valid.
## [2.2.4.16-exp104] - 2026-03-24
### Changed
- Experimental multi-character extraction baselines and seeded history now materialize `*ByEntityId` shadow buckets from the current resolved owners/entity ids instead of only seeding owner-name buckets.
## [2.2.4.16-exp103] - 2026-03-24
### Changed
- Experimental multi-character message-scoped owner projection now remaps resolver owner metadata together with projected owner buckets, and drops stale source-card entity-id payloads so later entity-layer reads rebuild from the projected alias identity instead of mixed source-owner leftovers.
## [2.2.4.16-exp102] - 2026-03-24
### Changed
- Experimental multi-character entity-owner mapping now prefers resolver sceneEntityIds before stale raw owner arrays when rebuilding owner identity from tracker payloads.

## [2.2.4.16-exp101] - 2026-03-24
### Changed
- Experimental multi-character UI owner collection now prefers resolver scene owners and entity-owner mapping before stale raw `activeCharacters`, keeping display and registry sync aligned with entity identity earlier in the read path.

## [2.2.4.16-exp100] - 2026-03-24
### Changed
- Experimental multi-character card lifecycle history now trusts `activeEntityIds` over owner-name fallback whenever entity-aware snapshots are available, keeping archive/inactive decisions aligned with entity identity instead of name collisions.

## [2.2.4.16-exp99] - 2026-03-24
### Changed
- Experimental graph timeline helpers now resolve numeric values through entity-owner mapping and *ByEntityId buckets instead of relying only on raw owner-name buckets.

## [2.2.4.16-exp98] - 2026-03-24
### Changed
- Experimental multi-character manual active-state edits now keep resolver-backed scene identity in sync with the edited snapshot instead of updating only raw `activeCharacters`.

## [2.2.4.16-exp97] - 2026-03-24
### Changed
- Experimental multi-character tracker edit modals now resolve active state from resolver-backed scene owners and scene entity IDs instead of trusting stale raw owner arrays.

## [2.2.4.16-exp96] - 2026-03-24
### Changed
- Experimental multi-character edit-modal working copies now preserve resolver identity data and all `*ByEntityId` state instead of falling back to owner-only clones while editing tracker cards.

## [2.2.4.16-exp95] - 2026-03-24
### Changed
- Experimental multi-character manual tracker edits now preserve resolver identity metadata and entity-owner mapping instead of dropping them when saving edited tracker snapshots.

## [2.2.4.16-exp94] - 2026-03-24
### Changed
- Experimental multi-character chronological tracker merges now retain and rebuild *ByEntityId state from merged entity identity data instead of falling back to owner-name-only merged results.

## [2.2.4.16-exp93] - 2026-03-22
### Changed
- Experimental multi-character baseline/history relevance selection now accepts explicit resolver entity ids alongside owner names, reducing another owner-name-only path when choosing prior tracker continuity entries.

## [2.2.4.16-exp92] - 2026-03-22
### Changed
- Experimental multi-character tracker summaries now prefer resolver-backed scene owners when assembling summary character lists and active-owner summary prompts, reducing another stale owner-name path in summary generation.

## [2.2.4.16-exp91] - 2026-03-22
### Changed
- Experimental multi-character extractor prompt-state seeding now carries the current resolver `entityResolution` into `promptCurrentData`, so prompt builders do not fall back to stale previous owner-name resolution when a fresh resolver result already exists for the current AI message.

## [2.2.4.16-exp90] - 2026-03-22
### Changed
- Experimental multi-character extraction baseline relevance checks now resolve alias-backed built-in and custom owner values through tracker payload `entityOwnerMap` and persisted `byEntityId` state, reducing another owner-name-only continuity path during history selection.

## [2.2.4.16-exp89] - 2026-03-22
### Changed
- Experimental multi-character prompt injection now prefers resolver-backed `messageEntityIds` / `messageOwners` before source-card fallback names when choosing the current target owner, reducing another source-card-name drift path.

## [2.2.4.16-exp88] - 2026-03-22
### Changed
- Experimental multi-character extraction now feeds character-card disambiguation with resolver-backed `sceneEntityIds`, so source-card prompt context can follow stable entity identity instead of relying only on owner-name heuristics.

## [2.2.4.16-exp87] - 2026-03-22
### Changed
- Experimental multi-character merged prompt/runtime state now prefers preferred resolver `sceneEntityIds` over stale preferred scene owner names, reducing another owner-name drift path in merged continuity reads.

## [2.2.4.16-exp86] - 2026-03-22
### Changed
- Experimental multi-character model resolver now works on candidate entity refs and persists resolved `sceneEntityIds` / `messageEntityIds` directly from the resolver result, reducing another owner-name drift path between resolution and tracker write storage.

## [2.2.4.16-exp85] - 2026-03-22
### Changed
- Experimental multi-character extraction prompt builders now read current seeded tracker state through the actual current tracker snapshot/entity mapping instead of borrowing alias lookup context from unrelated history entries, reducing another owner-name drift path in prompt continuity.

## [2.2.4.16-exp84] - 2026-03-22
### Changed
- Experimental multi-character tracker summary and fallback prose reads now resolve alias-backed custom numeric values through tracker payload `entityOwnerMap` and persisted `byEntityId` state, reducing another owner-name drift path in summary continuity.

## [2.2.4.16-exp83] - 2026-03-22
### Changed
- Experimental multi-character relevance/baseline presence checks now resolve alias-backed values through tracker payload `entityOwnerMap` and persisted `byEntityId` state instead of relying only on owner-name lookup lists, reducing more alias drift in extraction-time continuity selection.

## [2.2.4.16-exp82] - 2026-03-22
### Changed
- Experimental multi-character runtime macros and `{{bst_image_state}}` now resolve alias-backed values through tracker payload `entityOwnerMap` and persisted `byEntityId` state before falling back to raw owner-name buckets, reducing more owner-name drift in macro/injection continuity reads.

## [2.2.4.16-exp81] - 2026-03-22
### Changed
- Experimental multi-character injection prompt owner lookups now prefer tracker payload `entityOwnerMap` identity before falling back to registry-only alias resolution, reducing another owner-name drift path in injected continuity state.

## [2.2.4.16-exp80] - 2026-03-22
### Changed
- Experimental multi-character extraction prompt state lookups now use tracker entityOwnerMap data when available, so prompt continuity follows persisted entityId mappings instead of falling back too early to raw owner-name spellings.
## [2.2.4.16-exp79] - 2026-03-22
### Changed
- Experimental multi-character render lifecycle reads now resolve registry state through persisted tracker `entityId` references before falling back to owner-name matches, reducing another alias-owner drift path in inactive/archive state reads.
## [2.2.4.16-exp78] - 2026-03-22
### Changed
- Experimental multi-character render lookups now resolve registry entries through persisted tracker `entityId` references before falling back to owner-name matches, reducing more alias drift in card continuity and lifecycle reads.
## [2.2.4.16-exp77] - 2026-03-22
### Changed
- Experimental multi-character entityOwnerMap collection now ignores stale raw ctiveCharacters whenever explicit resolver sceneOwners or messageOwners are already present, preventing another alias-owner fallback leak back into registry-backed owner maps.
## [2.2.4.16-exp76] - 2026-03-22
### Changed
- Experimental multi-character tracker input normalization now immediately aligns stored ctiveCharacters with resolver sceneOwners whenever explicit entity resolution is already present, removing another stale raw-owner fallback before later storage/runtime processing.
## [2.2.4.16-exp75] - 2026-03-22
### Changed
- Experimental multi-character tracker payload normalization now keeps `activeCharacters` aligned with resolver `sceneOwners` whenever a payload already carries explicit entity resolution, preventing another write-path fallback to stale owner arrays during message storage normalization.
## [2.2.4.16-exp74] - 2026-03-22
### Changed
- Experimental multi-character `entityOwnerMap` enrichment now seeds owner identity from resolver `sceneOwners`/`messageOwners` before falling back to raw `activeCharacters`, preserving alias/entity mapping even when legacy owner arrays lag behind the resolver.
## [2.2.4.16-exp73] - 2026-03-22
### Changed
- Experimental multi-character chronological tracker merges now treat resolver `sceneOwners` as the preferred source for merged active-owner state whenever a snapshot already carries explicit entity resolution, removing another stale fallback to raw `activeCharacters`.
## [2.2.4.16-exp72] - 2026-03-22
### Changed
- Experimental multi-character merged prompt/runtime snapshots now prefer resolver-derived `sceneOwners` from the preferred tracker snapshot before falling back to raw `activeCharacters`, removing another read-path regression back to the old owner-array model.
## [2.2.4.16-exp71] - 2026-03-22
### Changed
- Experimental multi-character merged prompt/runtime snapshots now preserve the latest resolver `entityResolution` payload instead of dropping back to owner-name-only continuity during chronological merge.
## [2.2.4.16-exp70] - 2026-03-22
### Changed
- Experimental multi-character injection prompt state and `{{bst_image_state}}` now prefer entity-aware resolved scene owners over request-only `activeCharacters`, reducing more downstream owner-name drift after resolver-first extraction.
## [2.2.4.16-exp69] - 2026-03-22
### Changed
- Experimental multi-character baseline/relevance history checks now reuse the same owner-plus-`entityId` lookup contract as the newer graph/UI reads, reducing another source of continuity drift from duplicated lookup logic.

## [2.2.4.16-exp68] - 2026-03-22
### Changed
- Experimental multi-character graph/history summaries now resolve alias continuity through persisted `entityId` lookup names as well as owner names, reducing more owner-name drift in registry-backed historical reads.

## [2.2.4.16-exp67] - 2026-03-21
### Changed
- Experimental multi-character UI continuity lookups now prefer persisted `byEntityId` shadow state for current alias-backed values before falling back to owner-name maps, while preserving canonical/alias owner fallback when no entity-scoped state exists.

## [2.2.4.16-exp66] - 2026-03-21
### Changed
- Experimental multi-character read paths now resolve tracker continuity through shadow `byEntityId` state first and only fall back to owner-name maps when no persisted entity-scoped value exists.

## [2.2.4.16-exp65] - 2026-03-21
### Changed
- Experimental multi-character tracker payloads now also materialize shadow `byEntityId` state projections alongside owner-keyed maps, giving the runtime a safer storage bridge toward true entity-keyed continuity.

## [2.2.4.16-exp64] - 2026-03-21
### Changed
- Experimental multi-character model resolver now filters technical source-card owners out of its candidate owner set and feeds only concrete visible alias entities into the first extraction stage.

## [2.2.4.16-exp63] - 2026-03-21
### Changed
- Experimental multi-character registry read paths now expose message-scoped `entityId` entry helpers, and UI tracker lookups prefer those persisted entity references over owner-name fallback when resolving alias continuity data.

## [2.2.4.16-exp62] - 2026-03-21
### Changed
- Experimental multi-character lifecycle continuity now tracks prior activity by persisted entityId as well as owner name, reducing alias drift in inactive/archive/reactivation decisions.

## [2.2.4.16-exp61] - 2026-03-21
### Changed
- Experimental multi-character baseline/history relevance lookups now also resolve through persisted `entityId` owner snapshots, reducing more continuity drift when the same entity appears under different owner spellings across messages.

## [2.2.4.16-exp60] - 2026-03-21
### Changed
- Experimental multi-character render/lifecycle read paths now prefer resolver-derived scene owners (including `sceneEntityIds` when available) over raw `activeCharacters`, reducing more owner-name drift in registry-backed continuity.

## [2.2.4.16-exp59] - 2026-03-21
### Changed
- Experimental multi-character resolver payloads now persist runtime-assigned `sceneEntityIds` / `messageEntityIds`, and registry sync can prefer those durable entity references over raw owner-name arrays.

## [2.2.4.16-exp58] - 2026-03-21
### Changed
- Experimental multi-character tracker payloads now persist explicit resolver output (`sceneOwners` / `messageOwners`) and registry sync prefers that stored resolver state over inferring everything back from `activeCharacters`.

## [2.2.4.16-exp57] - 2026-03-21
### Changed
- Experimental multi-character extraction now runs a dedicated model resolver step before stat extraction and uses its `sceneOwners` / `messageOwners` output as the primary owner-scope input, with the old activity heuristics kept only as fallback.

## [2.2.4.16-exp56] - 2026-03-21
### Fixed
- Experimental multi-character swipe retracks now resolve fresh owners from the newly generated swipe content instead of reusing the previous swipe's saved tracker owners for the same message.

## [2.2.4.16-exp55] - 2026-03-21
### Fixed
- Experimental multi-character scene resolution now honors explicit single-remaining-character cues like `X stays here alone now`, so the next AI reply can persist the speaking alias as the only active scene owner instead of keeping unrelated aliases active.

## [2.2.4.16-exp54] - 2026-03-21
### Fixed
- Experimental auto-bootstrap now prioritizes missing AI greeting tracker messages before later AI turns, so fresh multi-character chats can backfill opening-state continuity instead of leaving later inactive aliases stuck on empty baseline cards.
## [2.2.4.16-exp53] - 2026-03-21
### Fixed
- Experimental multi-character retrack now seeds owners from saved built-in tracker owners before stale ctiveCharacters, and AI-message rendering suppresses legacy visible user-label owner tokens so fake user cards stop leaking under AI replies.
## [2.2.4.16-exp52] - 2026-03-21
### Fixed
- Experimental multi-character retrack now scopes activity detection and recent-message prompt context to the targeted message window, and reuses that message's saved owner set when retracking existing tracker data.
## [2.2.4.16-exp51] - 2026-03-21
### Fixed
- Experimental multi-character no longer derives persisted AI-message owner targets from the extracted scene custom stat roster; saved `activeCharacters` now come from resolver-derived scene owners, which removes fake `User` tracker cards from AI replies.

## [2.2.4.16-exp50] - 2026-03-21
### Fixed
- Experimental multi-character saves now treat the extracted `Characters in Scene` roster as the authoritative persisted active set for that message, instead of re-expanding unrelated source-card aliases back into `activeCharacters`.

## [2.2.4.16-exp49] - 2026-03-21
### Changed
- Experimental multi-character manual tracker edits now sync entity registry lifecycle through the same tracker-data pipeline as extraction, reducing another render-only dependency in alias continuity updates.

## [2.2.4.16-exp48] - 2026-03-21
### Changed
- Experimental multi-character extraction now syncs entity registry lifecycle directly from the saved tracker payload after extraction, so alias continuity no longer depends on a later render pass to keep inactive scene members registered.

## [2.2.4.16-exp47] - 2026-03-21
### Fixed
- Experimental multi-character extraction now lets the extracted scene roster broaden persisted active aliases before saving tracker state, so scene-present aliases do not get archived just because the narrow request target focused on one speaker.

## [2.2.4.16-exp46] - 2026-03-21
### Fixed
- Experimental multi-character scene continuity now respects fresh user departure cues when narrowing the current scene, so aliases explicitly sent away do not stay incorrectly active in the next reply.

## [2.2.4.16-exp45] - 2026-03-21
### Fixed
- Experimental multi-character chat reset now clears chat-scoped entity registry metadata and manual inactive overrides together with stored tracker snapshots, so fresh chat starts do not inherit stale entity lifecycle state.

## [2.2.4.16-exp44] - 2026-03-21
### Changed
- Experimental multi-character activity resolution now keeps the full alias pool of a source-card reply active for scene continuity, instead of shrinking scene activity to only the alias named in one response.

## [2.2.4.16-exp43] - 2026-03-21
### Changed
- Experimental multi-character scene resolution now expands source-card owners into their alias pool for scene continuity, while keeping extraction requests narrowed to the aliases actually participating in the current reply.

## [2.2.4.16-exp42] - 2026-03-21
### Changed
- Experimental multi-character extraction now separates scene-active owners from narrow request targets, so focused AI replies can extract only the speaking alias without dropping other scene entities from that message's tracker lifecycle/render pool.

## [2.2.4.16-exp41] - 2026-03-21
### Changed
- Experimental multi-character custom non-numeric sanitizer now resolves previous alias-owner values through entity lookup names before placeholder cleanup and carry-forward comparisons, removing another raw owner-name continuity path in extractor post-processing.

## [2.2.4.16-exp40] - 2026-03-21
### Changed
- Experimental multi-character graph/history summaries now resolve alias-owner numeric series through per-snapshot entity lookup names, reducing another owner-name-only continuity path in graph state.

## [2.2.4.16-exp39] - 2026-03-21
### Changed
- Experimental multi-character baseline/history filtering now resolves owner-scoped tracked-value checks through tracker entity lookup names, reducing another owner-name-only continuity path in current-state reads.

## [2.2.4.16-exp38] - 2026-03-21
### Changed
- Experimental multi-character history merges now canonicalize alias-owner buckets through message-scoped entity mappings and merge `entityOwnerMap` by `entityId`, reducing another owner-name-only continuity path in merged tracker state.

## [2.2.4.16-exp37] - 2026-03-21
### Changed
- Experimental multi-character entity registry now stores lifecycle changes as a timeline, so archived aliases can reactivate later without corrupting earlier archived message windows.

## [2.2.4.16-exp36] - 2026-03-21
### Changed
- Injection Prompt settings now explain each built-in placeholder more explicitly, including which blocks are static, which block is runtime-dynamic, and that the outer injection wrapper is added automatically.

### Fixed
- Settings checkboxes now keep a visible checked state even when the browser does not support the `color-mix(...)` styling path used by newer browsers.

## [2.2.4.16-exp35] - 2026-03-21
### Added
- Prompt Injection settings now include a live preview for the non-dynamic placeholder blocks, so template editing no longer requires guessing what the static placeholders expand to.

### Fixed
- Injection wrapper markup is now assembled in code instead of being split across the {{header}} placeholder and a hardcoded closing tag, so {{header}} stays a pure guidance block.

## [2.2.4.16-exp34] - 2026-03-21
### Changed
- Experimental multi-character tracker messages now persist message-scoped entity owner metadata and use it in history/UI continuity lookups, reducing dependence on live owner-name-only registry fallback for older messages.

## [2.2.4.16-exp33] - 2026-03-21

### Changed
- Experimental multi-character summary fallback, prose fallback, and seeded tracker baseline reads now resolve alias-owner values through registry-backed lookup names, removing another owner-name-only continuity path from src/index.ts.

## [2.2.4.16-exp32] - 2026-03-21

### Changed
- Experimental multi-character extractor seeding and previous-state reads now resolve alias owners through registry-backed lookup names, reducing another raw owner-name dependency in baseline and carry-forward logic.

## [2.2.4.16-exp31] - 2026-03-21

### Changed
- Experimental multi-character extraction prompts now resolve alias-owner built-in and custom baseline/history values through registry-backed lookup names, keeping extraction context aligned with the same entity-centric lookup layer used by tracker rendering and prompt injection.

## [2.2.4.16-exp30] - 2026-03-21

### Changed
- Experimental multi-character prompt injection now resolves alias-owner custom stats, mood, and last-thought values through registry-backed lookup names, reducing another owner-name-only read path in hidden tracker guidance.
## [2.2.4.16-exp29] - 2026-03-21

### Changed
- Experimental multi-character macro target generation now deduplicates registry-backed owners by entity identity, so BST macro aliases and image-state targets do not fan out from duplicate owner-name spellings for the same tracked entity.
## [2.2.4.16-exp28] - 2026-03-21

### Changed
- Experimental multi-character tracker display pools now merge registry-backed owners by entity identity when possible, reducing remaining owner-name-only dedupe paths during card target assembly.
## [2.2.4.16-exp27] - 2026-03-21

### Changed
- Experimental multi-character registry now exposes a shared message-scoped entity lookup helper, so visible alias/source entity resolution no longer depends on duplicated introduction/archive checks outside the registry layer.
## [2.2.4.16-exp26] - 2026-03-21

### Fixed
- Experimental multi-character alias cards no longer render owner-scoped non-numeric custom stat default values as if they were current tracker state when the alias has no real current/history value.
## [2.2.4.16-exp25] - 2026-03-21

### Changed
- Experimental multi-character tracker cards now resolve current numeric, non-numeric, mood, and last-thought values through entity-registry alias lookup names instead of only the raw owner key for the current message snapshot.

## [2.2.4.16-exp24] - 2026-03-20
### Added
- Experimental multi-character tracker cards now have per-card collapse state keyed by stable message/entity card keys, with inactive cards collapsing by default while still supporting global collapse/expand for the whole message block.

# Changelog

All notable changes to BetterSimTracker are documented here.

## [2.2.4.16-exp23] - 2026-03-20
### Changed
- Experimental multi-character UI continuity lookups now resolve previous owner-scoped stats, mood, and inner-thought values through registry-backed entity names instead of relying on one raw owner-name key.

## [2.2.4.16-exp22] - 2026-03-20
### Changed
- Experimental multi-character tracker rendering now resolves per-message registry entries first and derives visible registry owners from those entity entries, tightening the render path around the chat-scoped registry layer instead of owner-name lists alone.

## [2.2.4.16-exp21] - 2026-03-20
### Changed
- Experimental multi-character render targeting now treats chat-scoped registry owners as the primary visible card pool in Multi-Character, keeping alias-card continuity driven by the registry layer instead of raw owner-name heuristics.

## [2.2.4.16-exp20] - 2026-03-20
### Changed
- Experimental multi-character card UI now keys per-card render state from registry entity IDs when available, so render/collapse/thought state no longer depends only on raw owner-name strings.

## [2.2.4.16-exp19] - 2026-03-20
### Changed
- Experimental multi-character entity registry now resolves owners through normalized owner/canonical/alias identity keys instead of relying only on raw owner-name lookups, strengthening the registry-first identity layer for later `entityId`-centric flow.

## [2.2.4.16-exp18] - 2026-03-20
### Fixed
- Experimental multi-character lifecycle now clamps alias archive/history continuity to the entity introduction point, so newly introduced alias cards no longer inherit pre-introduction active turns and disappear immediately under aggressive archive settings.

## [2.2.4.16-exp17] - 2026-03-20
### Changed
- Experimental multi-character direct-chat rendering now keeps registry-backed alias owners in the message display pool even when only one alias is currently active, so historical alias card continuity is no longer cut off before UI filtering runs.

## [2.2.4.16-exp16] - 2026-03-20
### Changed
- Experimental multi-character tracker rendering now treats message-visible registry owners as renderable card targets even when a given snapshot does not carry per-owner stat payload for all of them, preserving multi-character continuity across older AI messages.

## [2.2.4.16-exp15] - 2026-03-20
### Changed
- Experimental multi-character tracker rendering now backfills visible alias cards from the chat-scoped entity registry for each message, so multi-character continuity no longer depends only on the current/history payload surviving in that specific tracker snapshot.

## [2.2.4.16-exp13] - 2026-03-20
### Added
- Experimental multi-character flow now maintains a chat-scoped entity registry in metadata for resolved alias owners, including deterministic entity IDs and persisted lifecycle timestamps.

## [2.2.4.16-exp14] - 2026-03-20
### Changed
- Experimental multi-character card lifecycle now reads last-active continuity from the chat-scoped entity registry, so alias `active` / `inactive` / `archived` transitions no longer depend only on currently rendered tracker history.

## [2.2.4.16-exp7] - 2026-03-20
### Fixed
- Experimental multi-character tracker rendering now hides a technical source-card owner when one of its resolved alias cards is already being rendered for the same message.

## [2.2.4.16-exp8] - 2026-03-20
### Fixed
- Experimental multi-character AI turn extraction now resolves rendered tracker cards from the actual participants mentioned in the AI message, instead of blindly expanding every represented alias from the source card.

## [2.2.4.16-exp12] - 2026-03-20
### Changed
- Experimental multi-character archive lifecycle now keeps archived entities only in chat lifecycle metadata; archived cards no longer render in the tracker UI and the temporary `Show Archived` control was removed.
- Multi-character archive lifecycle controls were moved out of `Display` and grouped under `Extraction`, where they now appear only when `Entity Tracking Mode` is set to `Multi-Character`.

## [2.2.4.16-exp9] - 2026-03-20
### Fixed
- Experimental multi-character activity resolution now credits aliases mentioned inside source-card replies, so `Active` / manual-inactive recovery follow the represented characters instead of only the technical source-card speaker name.

## [2.2.4.16-exp5] - 2026-03-20
### Fixed
- Fixed experimental multi-character prompt generation so explicit empty owner-scoped non-numeric values stay empty in extraction prompts instead of falling back to custom stat defaults.

## [2.2.4.16-exp6] - 2026-03-20
### Changed
- Extraction placeholders now expose resolver and baseline phases more explicitly, including a dedicated multi-character alias resolution step before stat requests begin.

## [2.2.4.16-exp2] - 2026-03-20
### Fixed
- Fixed experimental multi-character AI extraction so source-card replies can resolve to a specific alias owner for tracker storage when the reply text clearly identifies one represented character.

## [2.2.4.16-exp3] - 2026-03-20
### Fixed
- Fixed experimental multi-character alias owners so owner-scoped non-numeric tracker stats start from unknown instead of inheriting misleading default scene-state values on first appearance.

## [2.2.4.16-exp4] - 2026-03-20
### Fixed
- Fixed experimental multi-character continuity so source-card history no longer projects owner-scoped non-numeric scene-state stats onto alias owners during baseline/history reads.

## [2.2.4.16-exp1] - 2026-03-20
### Added
- Added experimental `Entity Tracking Mode` with a new `Multi-Character` mode for chats that use one source card to represent multiple named characters.

### Changed
- Group and single-character owner resolution can now expand multi-character source card names into alias candidates for activity detection, card-context resolution, and owner defaults lookup.

## [2.2.4.16] - 2026-03-20
### Fixed
- Fixed character cards so disabled built-in text stats no longer leak stale mood or inner-thought values from stored tracker history when character-side mood or last-thought tracking is turned off.

## [2.2.4.15] - 2026-03-20
### Added
- Added compact image-generation macro `{{bst_image_state}}` for scene/user/character state export in image prompt workflows.
- Added a configurable global mood-symbol fallback map so mood displays can use custom emoji, kaomoji, or short symbols instead of fixed built-in emoji when no image or sprite is available.
- Added card-appearance controls for fallback mood-symbol chips, including minimum width, minimum height, corner radius, and symbol font size.

### Changed
- Mood fallback labels and help text now describe configurable symbols rather than fixed emoji fallback behavior.

### Fixed
- Reduced group-chat active-state stickiness so characters who stopped speaking drop out of `Active` sooner instead of lingering for long persistence windows.
- Manual `Active` / inactive edits on character cards now survive normal extraction turns, but automatically clear once that character starts speaking again in the chat.

## [2.2.4.12] - 2026-03-17
### Changed
- Reorganized the settings modal into clearer top-level sections for setup, extraction, context sources, user tracking, prompt injection, tracking schema, display, prompts, and diagnostics.
- Moved custom stat management under the tracking schema flow, grouped display controls under dedicated subdrawers, and renamed owner-card ordering controls and related labels to better match actual behavior.
- Unified the visual language across BST settings, tracker edit, graph, character defaults, and persona defaults so shared surfaces use the same header/footer rhythm, disclosure affordances, and button/checkbox families.
- Refined the settings modal chrome so the header/footer read as full-width modal bands with one clean left accent, and nested subdrawers now reuse the same circular drawer chevron pattern as primary section drawers.

### Fixed
- Disabled dependent user-tracking toggles when user-side extraction is off, so the settings UI no longer implies impossible combinations.
- Fixed nested settings subdrawers so their disclosure chevrons now follow the same closed-right / open-down state as the primary drawers.

## [2.2.4.11] - 2026-03-14
### Changed
- Lorebook extraction now prefers SillyTavern's already-activated lorebook context directly, with an optional internal fallback scan for setups that still need BST-side recovery.

### Fixed
- Fixed manual tracker edits so newer edited values and explicit clears no longer get overwritten later by older snapshot history in either user or character continuity.
- Fixed user-message continuity so follow-up user turns inherit the last tracked user state instead of reviving stale owner state from intervening AI snapshots or older edited messages.
- Fixed user tracker cards so configured stat display order now applies consistently to both user and character cards.
- Improved lorebook diagnostics by exposing the effective lorebook source, prompt size, and whether cached fallback entries were used.
- Reduced BST macro registration warnings on current SillyTavern builds by preferring the modern macro engine and using legacy macro registration only as a fallback for older hosts.

## [2.2.4.10] - 2026-03-12
### Fixed
- Manual user tracker edits now propagate correctly into subsequent prompt state and later user-message continuity, instead of being overwritten by stale older user values carried in later snapshots.
- Fixed the user-message continuity chain so newer manual user tracker edits remain the active baseline until the scene actually changes them.

## [2.2.4.9] - 2026-03-11
### Changed
- Manual retrack now seeds from the previous message snapshot instead of reusing the current message tracker state, so retrying a bad extraction can actually correct the tracker.

### Fixed
- Debug diagnostics now expose the exact extraction baseline source (`baselineBeforeIndex`, previous snapshot indices, and whether the current message was reused), making retrack-state bugs directly visible in `debug.txt`.

## [2.2.4.8] - 2026-03-11
### Added
- Added stable current-chat character stat macros like `{{bst_stat_char_<id>}}`, so prompt presets no longer need a character-specific slug for normal 1:1 usage.

### Changed
- Manual retrack and edited-message retrack now bypass confidence dampening and mood stickiness, so retrying a tracker reflects the fresh model output instead of preserving stale values.

### Fixed
- Fixed BST stat macros so user, scene, and character stat macros resolve reliably in prompt-manager/chat-completion prompts even when prompt injection is disabled.
- Fixed prompt macro freshness so the latest effective tracker state wins over older history instead of reviving stale owner array values.
- Fixed owner-scoped custom stats so tracker UI, prompt/injection helpers, prompt builders, graphs, and BST stat macros no longer fall back to global values for non-global stats.

## [2.2.4.7] - 2026-03-09
### Fixed
- Fixed BST prompt macros so `{{bst_stat_user_<id>}}`, `{{bst_stat_scene_<id>}}`, `{{bst_stat_char_<id>_<character_slug>}}`, and `{{bst_injection}}` resolve reliably in prompt-manager/chat-completion prompts even when `Inject Tracker Into Prompt` is disabled.
- Fixed character stat macros for unique owners by exposing a backward-safe name-slug alias alongside avatar-first runtime slugs, so prompts using `{{bst_stat_char_<id>_<character_name_slug>}}` continue to resolve when the owner has an avatar-based macro identity.
- Fixed macro registration flow to avoid blank BST stat macros when initial sync happened before tracker data existed.
- Fixed array-stat clear regression in manual tracker edit flow so deleting the last array item persists as an explicit empty array (`[]`) instead of reviving stale previous values from fallback history.
- Fixed storage normalization to preserve explicit empty array values for custom non-numeric stats.

## [2.2.4.6] - 2026-03-08
### Fixed
- Fixed array-stat clear regression in manual tracker edit flow: deleting the last array item now persists as an explicit empty array (`[]`) instead of reviving stale previous values from fallback history.
- Fixed storage normalization to preserve explicit empty array values for custom non-numeric stats.
- Fixed owner filtering path to keep empty-array clear sentinels, preventing old array values from reappearing on cards/injection.

## [2.2.4.5] - 2026-03-07
### Changed
- Injection state payload is now standardized under one canonical block: `BST_TRACKER_STATE`.
- Injection diagnostics were expanded with explicit owner/selection metadata to make real injected state easier to verify from debug dumps.

### Fixed
- Fixed 1:1 injection owner targeting so active character stats are not dropped when user aliases are present in candidate order.
- Fixed duplicate/reserved owner leakage in injection (including system owners), ensuring only valid tracked owners are emitted.
- Improved non-numeric injection serialization stability (word-safe truncation) to avoid malformed partial values in prompt state.
- Edit Tracker modal prefill now uses the same effective fallback resolution as card rendering, eliminating card/modal value mismatches.

## [2.2.4.4] - 2026-03-07
### Changed
- Moved `BST_*` wrappers to runtime macro payload assembly in prompt injection, so custom injection templates cannot remove tagged BST sections.
- Applied the same runtime-wrapped `BST_*` block pattern across extraction prompt builders (unified + sequential + custom stats).
- Simplified default injection template to plain placeholders, with tags now provided by wrapped macro values at render time.

### Fixed
- Custom injection templates now keep tagged BST semantics/rules/state blocks instead of losing them when users override the template layout.
- Sequential custom numeric extraction prompts now use the same tagged structure as other extraction modes.
- In 1:1 chats, duplicate-name character card context is now scoped to the current `characterId` avatar, preventing unrelated same-name cards from being injected.

## [2.2.4.3] - 2026-03-07
### Changed
- Character stat macros now use collision-safe slugs (avatar-first with deterministic suffixes) so duplicate character names no longer overwrite each other.
- Custom stat macro examples in Settings now mirror collision-safe character slug generation.

### Fixed
- Fixed BST character macro registration collisions when multiple characters shared the same name.

## [2.2.4.2] - 2026-03-07
### Added
- New extraction toggle: `Auto-Generate Tracker`.
  - When disabled, BST runs in manual-only mode (no automatic extraction on AI/user events).

### Changed
- Extraction settings UI now hides `Regenerate Tracker After Message Edit` and `Generate Tracker on Greetings` when auto-generation is disabled.
- Character-card extraction context now resolves duplicate-name characters by avatar identity to avoid same-name overwrite collisions.
- Settings preview candidate resolution is now avatar-aware, so same-name characters are no longer collapsed into one candidate.

### Fixed
- Auto event hooks now skip extraction scheduling when auto-generation is disabled while keeping manual refresh/retry fully available.
- Fixed character card prompt context generation for chats where more than one character shares the same name.
- When `Auto-Generate Tracker` is disabled and a message has no tracker snapshot yet, BST now renders a visible manual placeholder with `Generate Tracker` so manual mode always has an in-chat entry point.

## [2.2.4] - 2026-03-07
### Added
- Per-owner tracker controls in defaults:
  - `Enable tracker for this character`
  - `Enable tracker for this persona`
- Per-owner per-stat enable toggles in Character/Persona defaults (built-ins + owner-trackable custom stats).
- New global display toggle: `Collapse Cards By Default`.
- Dedicated collapse/expand control for Scene cards.
- Persona defaults now support ST expression image framing overrides (matching character defaults).

### Changed
- Increased custom stat limits for better real-world setups:
  - enum options cap: `12 -> 30`
  - array item cap: `20 -> 30`
  - `Injection Prompt Max Chars` max: `30000 -> 100000`
- Prompt injection now emits global custom stats as dedicated `Scene` lines from global scope.
- Owner-level stat toggles are now enforced consistently in extraction, card rendering, and injection.
- Scene card array-collapse controls/labels now use shared runtime limits across settings and per-stat display options.

### Fixed
- Fixed character baseline selection and history seeding so user-only snapshots do not corrupt character extraction context.
- Fixed global custom stat baseline handling so latest global values are preserved during character extraction.
- Fixed prompt injection regression where global custom stats could be omitted even when enabled for injection.
- Fixed late-load `enabled` toggle hydration edge case that could incorrectly flip BST off.
- Fixed array cap mismatches in edit/default modals and settings parsing (removed stale hardcoded `20` paths).
## [2.2.3.10] - 2026-03-06
### Fixed
- `{{bst_injection}}` and BST stat macros now build from a merged tracker-state baseline instead of a single latest message snapshot, preventing user, scene/global, and cross-turn character stat values from disappearing when the newest snapshot is partial.

## [2.2.3.9] - 2026-03-06
### Added
- Added dedicated built-in `Behavior Instruction` textareas for affection, trust, desire, and connection directly inside the existing built-in prompt sections.

### Changed
- Built-in hidden injection behavior now prefers those per-stat behavior instructions when present, while keeping BST fallback react rules when the fields are empty.
- Continued internal step-2 modularization by extracting settings and mood-preview modal logic into dedicated modules without changing tracker behavior.

### Fixed
- Built-in prompt sections no longer show misleading idle AI status text, and status feedback is now positioned correctly below the behavior field.
- `{{bst_injection}}` now remains available for manual macro use even when `Inject Tracker Into Prompt` is disabled; the toggle now controls only automatic BST injection.
- Thought expand buttons now appear only when the thought is actually likely truncated, preventing no-op `More thought` toggles on fully visible text.

## [2.2.3.7] - 2026-03-06
### Added
- Global injection macro hint added near injection toggle: `{{bst_injection}}`.
- New ST macro support for stat values with explicit scopes:
  - `{{bst_stat_user_<id>}}`
  - `{{bst_stat_scene_<id>}}`
  - `{{bst_stat_char_<id>_<character_slug>}}`

### Changed
- Macro hints in Custom Stats are now dynamic and scope-aware (only valid scopes are shown per stat).
- Character-targeted macro examples are generated from characters that exist in the current chat context.
- Removed ambiguous auto/generic stat macro variants to avoid multi-character ambiguity.
- Extraction progress labels are explicit and mode-aware (Built-in, Custom, Custom Group, Unified Batch), including clearer no-extraction/default seeding steps.

### Fixed
- Manual retrack/manual refresh now uses the currently edited tracker snapshot on that message as baseline, preventing immediate value reversion after edits.
- Hardened `array` custom-stat handling for weaker models:
  - broader array value normalization (JSON array strings, bullet/numbered lines, comma/newline lists),
  - explicit empty markers now parse as an intentional empty array,
  - conservative apply guard prevents low-confidence destructive array drops from wiping prior values.

## [2.2.3] - 2026-03-04
### Added
- New custom stat type: `date_time` with two modes:
  - `timestamp` (canonical datetime value)
  - `structured` (semantic updates normalized to canonical datetime)
- Structured Date/Time display controls:
  - part visibility (`weekday/date/time/phase`)
  - part labels
  - part order
  - date format presets
- New extraction toggle: `Regenerate Tracker After Message Edit`.
  - When enabled (default), editing an already tracked message re-runs extraction for that message.
  - When disabled, edit events no longer auto-regenerate tracker values.
- Custom Stats now include a quick `Enable/Disable` toggle directly in the list for fast on/off control per stat.
- New Display subdrawer: `Character Card Stat Order` (under Scene Card) for manual ordering of character-card stat rows.
- Scene card edit action (pencil) for latest tracked snapshots.
- New toggle: `Generate Tracker on Greetings`.

### Changed
- Character-card rendering now applies configurable stat order for non-user cards across built-in numeric + custom non-global non-numeric stats, with backward-compatible fallback to previous order when no custom order is defined.
- Date/time phase mapping refined to subphases (`Midnight` through `Late Evening`) and part-order UI moved to explicit controls.
- Date/time mode handling improved across wizard/edit paths (`timestamp` and `structured`) with mode-aware prompt/extraction behavior.

### Fixed
- Message-edit regeneration control is now explicit instead of always-on behavior.
- Tracker auto-extraction now skips SillyTavern welcome-page assistant messages.
- Scene card edit modal title/scope fixed to Scene-only global fields.
- Disabled custom stats are now fully authoritative (`track=false`) in extraction/rendering.
- Import conflict flow hardened with modal conflict handling and non-destructive update/skip behavior.

## [2.2.2.1] - 2026-03-03
### Fixed
- Unified first-run custom stat extraction now evaluates model output immediately instead of seed-only defaults, so initial tracker cards no longer stay at `not set` / empty array when the model returned valid custom values.

## [2.2.2] - 2026-03-01
### Added
- Configurable Scene Card system for global custom stats with dedicated settings drawer and `Scene Stat Studio` manager.
- Per-stat Scene display controls: visibility, label/color override, layout override, value style, hide-when-empty behavior, per-stat text clamp, and array collapse limit.
- Manual Scene stat ordering with explicit persisted order and per-stat move controls.
- Custom stats JSON workflows: styled import modal, per-stat export, and format-compatible import support.
- Debug dump metadata now includes extension version and custom stat scope-resolution diagnostics.

### Changed
- Scene Card position now supports two modes only: `Above tracker cards` and `Above message text`.
- Scene Card now exclusively owns rendering of global custom stats when enabled (no duplicate owner-card rendering).
- Scene settings and naming were modernized (`Scene Stat Studio`) and documented across README/docs.
- Extension drawer header now displays dynamic build version with compact visual style.
- Import flow remains merge-based and non-destructive (update/add by stat id), with clearer in-UI status feedback.

### Fixed
- Global custom stat scope handling across extraction, retrack, rendering, and manual edit paths now consistently uses the shared global owner key.
- Sequential non-numeric baseline resolution now respects each stat's global scope, preventing stale per-character carry-over.
- JSON import safety and normalization hardened (kind-aware defaults, safe id handling, bounded values).

## [2.2.1.3] - 2026-02-28
### Changed
- Custom-stat per-stat prompt field is now canonically named `promptOverride` across UI/config semantics.

### Fixed
- Backward compatibility retained: legacy `sequentialPromptTemplate` is still accepted on import/read, but normalized to `promptOverride` to avoid mode-naming confusion when sharing JSON configs.

## [2.2.1.2] - 2026-02-28
### Fixed
- Unified custom `array` parsing now accepts JSON array values returned under `value.<statId>`, so item removals/updates (for example clothing changes) apply correctly instead of being dropped.

## [2.2.1.1] - 2026-02-28
### Changed
- Persona panel section label renamed from `User Defaults (Persona Scoped)` to `Persona Defaults`.

### Fixed
- Persona `Mood Default` now uses a constrained dropdown (allowed mood labels + `Use stat default`) instead of free-text input.

## [2.2.1] - 2026-02-28
### Added
- New custom stat kind: `array` (max 20 items) implemented end-to-end, including extraction, defaults, parser/storage normalization, prompt/protocol coverage, injection support, and tracker editing.
- Owner-scoped privacy controls for stats: `LastThought` and custom stats can be marked `Private (owner-scoped)` to limit cross-character leakage.
- Tracker recovery cards now include exact error reason details and direct `Retry Tracker` / `Generate Tracker` actions.
- Persona Management now includes persona-scoped user defaults (mood, lastThought, and user-trackable custom stat defaults).
- Settable `Last Thought` defaults for Character Defaults and Persona User Defaults.

### Changed
- Array/enum editors were upgraded to structured add/remove row UX with compact icon actions and live counters across wizard/defaults/edit flows.
- Mobile and modal UX polish for tracker editing and default editors (checkbox alignment, spacing, row stability, action-button alignment).
- Persona panel heading/description were renamed to reflect full persona-scoped defaults management (not mood-only).
- Input bounds enforcement was standardized across settings/wizard/edit controls.
- Unified/sequential prompt contracts for arrays now emphasize item-level maintenance (add/remove/edit) instead of full-list rewrites.

### Fixed
- Persona/user defaults isolation was hardened to prevent collisions with character-scoped defaults (including same-name persona/character cases).
- User tracker default seeding/application now resolves persona scope consistently, including custom non-numeric defaults.
- Persona Defaults panel no longer re-renders while text selection is active inside the panel, fixing text-selection interruptions during editing.
- Connection profile alias normalization now avoids stale pseudo-profile IDs when using active/current/default-style selectors.
- Recovery placeholders now persist across reloads and restore correctly from chat metadata.
- Nested provider/API error extraction was improved so UI diagnostics match real backend error messages.

## [2.2.0.7] - 2026-02-27
### Changed
- Unified extraction now submits built-in and custom stats together in a single request.
- Disambiguation guidance is now toggle-aware: character-card and lorebook guidance is only injected when those sources are enabled.

### Fixed
- Unified parse acceptance now validates requested built-in and custom stat coverage before accepting output, reducing partial responses.
- Unified `text_short` custom stats now reject obvious placeholder echoes when a concrete prior value exists.
- Custom Stats list rows now wrap long description text within the content column so action buttons remain unobstructed.

## [2.2.0.5] - 2026-02-27
### Added
- Persona Management integration for BetterSimTracker user mood images, including per-persona mood-source override and per-mood upload/clear controls.
- Character tracker edit modal now includes an `Active In This Snapshot` toggle for manual active/inactive correction per message snapshot.

### Changed
- New-chat greeting bootstrap now seeds tracker values from configured defaults when no user message exists yet, instead of deriving first values from greeting text.
- User tracker identity resolution now follows current persona/avatar mapping, so user defaults and persona mood assets apply consistently.

### Fixed
- Mobile/late-render extraction race handling now retries safely after generation and on manual-refresh empty responses, reducing missing first tracker cards.
- Latest-card edit availability is now independent for latest AI and latest User tracker entries.
- Edit modal layering and mobile layout were hardened so the dialog stays above SillyTavern UI and remains usable in portrait mode.
- Persona Management mood panel mount reliability was improved so the BST persona block renders consistently.
- Cross-chat scope fallback and user ST-expression name/avatar resolution were stabilized to reduce stale carry-over and missing user expressions.

## [2.2.0] - 2026-02-26
### Added
- User-side tracker extraction and display support, including user-focused custom stat tracking and injection scoping.
- Lorebook support for extraction, including pre-scan fallback handling for user-side runs.

### Changed
- Extraction/injection configuration flow and prompt protocol controls were expanded and reorganized for clearer advanced setup.
- Advanced protocol prompt templates can now be unlocked and edited directly in settings (with reset support).
- Prompt user labeling now uses a display alias in extraction prompts while preserving internal key mapping in parser application.

### Fixed
- New-chat and retrack baseline seeding now consistently uses prior relevant snapshots, preventing false resets to defaults.
- Group replay/user-turn handling was hardened to prevent ghost blank user turns and invalid forced-target paths.
- Activity/inactive-card rendering and delta baselines now remain stable across user-only turns, swipes, reloads, and mixed-character histories.

## [2.1.0.3] - 2026-02-26
### Changed
- Custom stat Description limit increased from `200` to `300` characters.
- Custom stat wizard now shows a live Description counter (`x/300`), including near-limit and limit states.
- Enum custom stats now preserve user-entered option strings/defaults (no forced token conversion).

### Fixed
- Enum default validation now resolves values consistently against allowed options (including symbols/emoji labels).
- Enum option/default handling now blocks script-like payloads (e.g. `<script>`, `javascript:`) across wizard validation, settings sanitization, parsing, and runtime seeding.

## [2.1.0.2] - 2026-02-25
### Fixed
- Non-numeric custom stat chips (including `text_short`) no longer truncate long values on mobile; values now wrap cleanly instead of clipping with ellipsis.

## [2.1.0.1] - 2026-02-25
### Changed
- Renamed custom prompt UI labels for clarity:
  - `Sequential Prompt Override` -> `Per-Stat Prompt Override`
  - `Seq: Custom Numeric` -> `Custom Numeric Default`
  - `Seq: Custom Non-Numeric` -> `Custom Non-Numeric Default`
- Prompt captions, placeholders, and tooltips now explicitly state that custom per-stat prompt templates are used in all extraction modes.

### Fixed
- Removed confusion where users could assume custom prompt overrides only apply in sequential mode.

## [2.1.0] - 2026-02-25
### Added
- Non-numeric custom stat support with new kinds: `enum_single`, `boolean`, and `text_short`.
- Kind-aware custom stat wizard fields and validation for enum options, boolean labels, and short-text limits.
- Kind-aware character defaults support for non-numeric custom stats.
- Kind-aware latest-tracker manual edit controls for non-numeric custom stat values.
- New sequential prompt template fallback for non-numeric custom stats (`Seq: Custom Non-Numeric`).

### Changed
- Tracker cards now render non-numeric custom stats as compact value chips.
- Custom stat settings UI now treats custom stats as mixed-type definitions instead of numeric-only.
- Prompt generation and extraction contracts now include non-numeric schema guidance and macros.
- AI guidance generation now separates intent by field: `Sequential Prompt Override` is extraction-focused, while `Behavior Instruction` is reaction-focused for prompt injection.

### Fixed
- Prompt injection now still renders when only non-numeric custom stats are enabled.
- Non-numeric seeded defaults are now normalized by stat kind to prevent invalid enum/boolean/text carry-over values.
- `Generate with AI` for behavior guidance no longer produces extraction-style update cues.

## [2.0.7.3] - 2026-02-25
### Changed
- Auto card color assignment no longer rebalances previously assigned characters when new characters appear in chat.
- Auto color now assigns distinct colors incrementally for new characters while keeping already assigned auto colors stable.

## [2.0.7.2] - 2026-02-24
### Fixed
- Auto card colors now resolve to stable hex values for broad browser compatibility, so different characters no longer collapse to the same fallback card color.

## [2.0.7.1] - 2026-02-24
### Fixed
- Extraction now falls back to the active SillyTavern runtime API when no valid Connection Manager profile ID can be resolved, preventing `Profile not found (ID: default)` failures.
- Profile-less setups (fresh install, no Connection Manager profiles, or "Use active connection" mode) now continue extracting stats instead of stalling at "Requesting stats".

## [2.0.7] - 2026-02-24
### Changed
- Tracker card action buttons now use dynamic colors tuned for contrast against each card, with more transparency.

### Fixed
- Extraction now falls back safely when no active connection profile is selected, instead of hard-failing tracker updates.
- Active connection profile detection now covers more SillyTavern/runtime fields and local connection-manager state, improving fresh-install and single-profile reliability.
- Diagnostics now report the same resolved connection profile id used by runtime extraction.

## [2.0.6] - 2026-02-24
### Added
- Per-character card color override in Advanced Character Defaults.
- Edit the latest tracker stats inline (pencil icon; numeric clamp, mood picker, last thought editor).

## [2.0.5] - 2026-02-23
### Added
- New AI-powered `Summarize` action that generates prose summary notes from the current tracked state.
- New summary controls: `Summarization Note Visible for AI` and `Inject Summarization Note`.
- Custom stat wizard now includes an optional `Behavior Instruction` step with `Generate with AI`.

### Changed
- Summary generation is now prose-first and more robust: normalization pass, longer target output (`4-6` sentences), and tracked-dimension-aware prompting.
- Custom stat AI helpers were improved for clearer, stat-specific generation (description + sequential/behavior guidance).
- Injection templates now support `{{summarizationNote}}` for optional summary context.

### Fixed
- Swipe/edit stability improvements: prevented unwanted retracks, fixed stale `Generating AI response` UI state, and made tracker lookup swipe-specific.
- Summary note safety hardening: safe message payload handling, exclusion from tracker extraction targets, non-swipeable note metadata, and no retroactive chat mutation.
- Custom stat color picker persistence now works reliably on first create across browsers.
And more...

## [2.0.1] - 2026-02-23
### Added
- AI-assisted prompt authoring for custom stats:
  - `Improve description by AI` in wizard step 1
  - `Generate with AI` for stat-specific `Sequential Prompt Override`
- AI generation for built-in sequential prompt instructions:
  - `Seq: Affection`, `Seq: Trust`, `Seq: Desire`, `Seq: Connection`, `Seq: Mood`, `Seq: LastThought`

### Changed
- Custom sequential override generation is now stricter, stat-focused, and tailored to literal stat identity (`ID`/`Label`) instead of universal placeholder-style output.
- Built-in sequential prompt generation now uses stat-specific generation prompts and applies output sanitization before filling prompt fields.
- Dev-run versioning is aligned to semver-safe `2.0.0-dev.x`.

### Fixed
- Generated override text now strips hidden reasoning blocks (`<think>...</think>`) and keeps clean instruction output.
- Custom stat override UX clarity improved by removing macro-hint noise in per-stat context and correcting the placeholder.
- Custom wizard AI button spacing/hover behavior is stabilized (no jump on hover).
And more...

## [2.0.0] - 2026-02-22
### Added
- Full custom numeric stats support: definition schema, add/edit/clone/remove wizards, extraction/runtime processing, persistence (`customStatistics`), tracker cards, graphs, and prompt injection.
- Built-in stats manager wizard with per-stat controls and unified `Enabled` behavior (`Track + Card + Graph`) plus injection control for numeric built-ins.
- Global sequential custom-numeric prompt template fallback (`Seq: Custom Numeric`) with per-stat override support.

### Changed
- Settings UX was refined for custom stats and built-ins, including centered built-in management entry point and wizard polish.
- Baseline/default seeding and historical fallback now include custom stats (global + per-character defaults) for consistent first-run behavior.
- Prompt injection now respects built-in toggles and safely trims custom-stat lines first when the injected block grows too large.

### Fixed
- First-run custom stat flows now avoid unnecessary extraction requests and misleading delta spikes when prior values are missing.
- Custom stat template fallback behavior is now consistent when fields are cleared and settings are reopened.
- Cross-browser UI reliability improvements for settings/wizard controls and debug visibility for custom stat data paths.
And more...

## [1.2.3] - 2026-02-22
### Added
- Configurable `Injection Depth` setting for prompt injection in extension settings.

### Changed
- `Injection Depth` now uses a constrained selector with practical values (`0..8`) and matching runtime clamping.

### Fixed
- Extraction now falls back to SillyTavern's active connection profile when BetterSimTracker `Connection Profile` is empty.
- Diagnostics `resolvedProfileId` now reflects the active-profile fallback when no explicit BetterSimTracker profile is selected.

## [1.2.2] - 2026-02-22
### Added
- Full-size mood image preview modal from tracker cards with caption metadata and close controls.
- Expandable last-thought text in tracker cards and mood bubbles.

### Changed
- ST expression framing and mood-source workflows were expanded in global settings and character defaults, including interactive framing preview updates.
- Extension settings UI was refreshed with collapsible sections, sticky header/footer actions, global expand/collapse, modernized controls, and round accent-matched checkboxes.
- Tracker cards were polished with active-first ordering, colored stat bars, and tighter mobile density.

### Fixed
- Mood preview modal now reliably appears above mobile ST UI layers (top-layer dialog path with safe-area/touch/reduced-motion handling).
- ST expression framing now applies consistently in tracker cards with immediate save behavior and full-range positioning.
- Character defaults now resolve consistently across group/single Advanced Definitions and correctly seed first-time active characters.
- Extraction stop now cancels reliably in one click, and tracker rendering skips unchanged payloads to reduce churn.
And more...

## [1.2.0] - 2026-02-21
### Added
- ST expressions mood workflow with global/per-character mood-to-expression mapping and character-level mood-source controls.
- Interactive ST expression framing tools in both global settings and character defaults, including preview modal support.
### Changed
- ST expression framing and preview flow were rebuilt for live, immediate updates while adjusting controls.
- Settings modal section drawers now default to collapsed for faster navigation in large settings screens.
- Mood image handling now supports partial sets with emoji fallback when a mood image is unavailable.
### Fixed
- Tracker cards now apply framer zoom/position changes reliably, including existing rendered cards.
- ST expression mood-source selection is blocked for characters with no expression sprites.
- Mood mapping resolution is now case-insensitive for legacy/custom keys.
- Post-generation extraction stability improved (delayed kickoff, safer first-run request behavior, and transport-failure handling).
And more...

## [1.1.1] - 2026-02-21
### Fixed
- Mood labels now fall back to Neutral when the model returns a label outside the allowed list.
- Swipes now wait for the new message render before extraction starts.
- Swipe now shows the waiting state immediately.
and more...

## [1.1.0.1] - 2026-02-20
### Fixed
- Custom prompt templates now persist when edited.

## [1.1.0] - 2026-02-20
### Added
- Per-character defaults panel in Advanced Character Definitions, including mood image sets with full upload/delete support.
- Granular debug toggles (Extraction, Prompts, UI, Mood Images, Storage) to reduce console noise.
### Changed
- Mood display now supports image + thought bubble presentation when a full mood image set is present.
- Tracker UI and settings modal styling refined for consistency and mobile responsiveness.
### Fixed
- Mood image upload pipeline (field names, sprite matching, path resolution) and deletion reliability.
- Character defaults panel no longer re-renders while editing/selecting.
- Debug/diagnostics toggles visibility, spacing, and persistence.
and more...

## [1.0.9.11] - 2026-02-20
### Changed
- Clearing mood images now deletes the sprite files on disk via ST's delete endpoint.
and more...

## [1.0.9.10] - 2026-02-20
### Fixed
- Mood image uploads now detect the newly added sprite even when labels differ.
and more...

## [1.0.9.9] - 2026-02-20
### Fixed
- Character defaults panel no longer re-renders while selecting text inside the panel.
and more...

## [1.0.9.8] - 2026-02-20
### Fixed
- Character defaults panel no longer re-renders while editing, preventing text selection loss.
and more...

## [1.0.9.7] - 2026-02-20
### Fixed
- Sprite uploads now resolve the uploaded path via the sprites list endpoint.
- Upload button now opens the file picker reliably on first click.
and more...

## [1.0.9.6] - 2026-02-20
### Fixed
- Sprite uploads now use the correct ST multer field name.
- Upload buttons no longer require double click in some browsers.
and more...

## [1.0.9.5] - 2026-02-20
### Fixed
- Hard-block mood image uploads that exceed size/dimension limits or unsupported formats.
and more...

## [1.0.9.4] - 2026-02-20
### Fixed
- Mood image upload retries multiple file field names to match ST upload expectations.
and more...

## [1.0.9.3] - 2026-02-20
### Fixed
- Character defaults panel now resolves character name from context when input is missing.
and more...

## [1.0.9.2] - 2026-02-20
### Fixed
- Guarded settings UI localStorage writes to avoid quota crashes.
and more...

## [1.0.9.1] - 2026-02-20
### Added
- Per-character defaults panel in character advanced definition, including mood image uploads.
### Changed
- Mood display uses custom images when a full set of 15 moods is provided for a character.
and more...

## [1.0.9] - 2026-02-20
### Added
- Slash commands for status, extract, clear, toggles, injection, and debug.

## [1.0.8] - 2026-02-20
### Added
- Injection prompt template is now editable and shown under Extraction when injection is enabled.
- Stop button shown in tracker progress card to cancel extraction.
### Changed
- Prompt protocols now define confidence as self-assessed certainty in the extracted update.
- Tracked stat toggles now affect only future extractions; historical cards and graphs keep recorded data.
### Fixed
- Tracked stats toggles now affect cards, graph, and injected prompt content.
- Disabled stats no longer appear in summaries or graph tooltips.
And more...

## [1.0.7] - 2026-02-19
### Added
- Graph hover tooltip and latest-point emphasis.
- Accent color picker in settings.
- Extraction progress step labels in loading UI.
### Changed
- Settings UI polish (drawers, icons, prompt grouping, dividers, help collapse).
- Tracker card polish (spacing, inactive badge, last thought clamp, delta arrows).
### Fixed
- Graph tooltip positioning and accent picker sync on reopen.
And more...

## [1.0.6.20] - 2026-02-19
### Changed
- Graph tooltip now follows cursor within canvas.

## [1.0.6.19] - 2026-02-19
### Changed
- Added extraction step labels to loading UI and styled it to match cards.
- Graph: hover tooltip, latest point emphasis, lighter grid, active window highlight.
- Cards: tighter spacing, delta arrows, softened inactive overlay.

## [1.0.6.18] - 2026-02-19
### Changed
- Removed hover translate on tracker cards to prevent layout jump.

## [1.0.6.17] - 2026-02-19
### Changed
- Polished tracker cards (spacing, hover, inactive badge, ellipsis, last thought clamp).

## [1.0.6.16] - 2026-02-19
### Changed
- Replaced accent color hex input with a color picker only.
- Simplified accent color sync logic.

## [1.0.6.15] - 2026-02-19
### Changed
- Added ghost icon to inactive label in tracker cards.

## [1.0.6.14] - 2026-02-19
### Changed
- Fixed accent color picker to reflect saved non-hex colors on reopen.

## [1.0.6.13] - 2026-02-19
### Changed
- Added accent color picker synced with hex input.
- Styled Quick Help and renamed Open Settings button with icon.

## [1.0.6.12] - 2026-02-19
### Changed
- Styled section dividers as full-width separators with line accents.

## [1.0.6.11] - 2026-02-19
### Changed
- Removed duplicate Generation section and extra dividers.
- Enforced input/checkbox grouping in Extraction.

## [1.0.6.10] - 2026-02-19
### Changed
- Unified prompt subdrawer toggles and reset icons to Font Awesome.
- Collapsed prompt help into a details block.
- Added Connection divider to match Generation divider.
- Aligned prompt toggle and reset sizing.

## [1.0.6.9] - 2026-02-19
### Changed
- Added Font Awesome icons to settings section headers, prompt groups, and debug actions.

## [1.0.6.8] - 2026-02-19
### Changed
- Default open drawers: Extraction and Display.
- Lighter header styling and label focus highlight.
- Renamed section to Connection & Generation.
- Prompt groups collapsible and default collapsed.
- Clamp notice shows on blur only.

## [1.0.6.7] - 2026-02-19
### Changed
- Added blue accent bar on drawer headers.

## [1.0.6.6] - 2026-02-19
### Changed
- Replaced drawer angle with centered SVG chevron and larger icon container.

## [1.0.6.5] - 2026-02-19
### Changed
- Centered and enlarged drawer angle icon.

## [1.0.6.4] - 2026-02-19
### Changed
- Refined drawer header styling and icons; added spacing below headers.
- Clamp notices persist briefly to be readable.

## [1.0.6.3] - 2026-02-19
### Changed
- Clamp numeric inputs to min/max and show inline notice when adjusted.
- Show min/max hints on numeric settings.

## [1.0.6.2] - 2026-02-19
### Changed
- Merged Connection + Generation into a single drawer.
- Drawer header bar now toggles; icon is a circular angle indicator.

## [1.0.6.1] - 2026-02-19
### Changed
- Settings sections (except Quick Help) are collapsible and default to collapsed.

## [1.0.6] - 2026-02-19
### Added
- Fixed main prompt prefix applied to all extraction requests (hidden from settings).
- Stat meaning definitions included in the main prompt.
### Changed
- Prompt editing now only affects instruction sections; protocol blocks are fixed and read-only.
- Legacy full-template prompt settings are normalized to instruction-only on load.
- Non-romantic desire rules enforced in the main prompt (no romance inference from affection/playfulness).

## [1.0.5.8] - 2026-02-19
### Changed
- Main prompt now forbids inferring romance from affection or playfulness.

## [1.0.5.7] - 2026-02-19
### Changed
- Main prompt now enforces non-romantic desire deltas to be 0 or negative.

## [1.0.5.6] - 2026-02-19
### Changed
- Main prompt prefix wording updated to "relationship-state extraction engine."

## [1.0.5.5] - 2026-02-19
### Changed
- Main prompt prefix now includes stat meaning definitions.

## [1.0.5.4] - 2026-02-19
### Changed
- Added a hidden, fixed main prompt prefix applied to all extraction prompts.

## [1.0.5.3] - 2026-02-19
### Changed
- Prompt editing now only affects the instruction section; protocol blocks are fixed and read-only.
- Legacy full-template prompt settings are normalized to instruction-only on load.

## [1.0.5.2] - 2026-02-19
### Changed
- Diagnostics request metadata now includes truncation length when available.

## [1.0.5.1] - 2026-02-19
### Added
- Optional inclusion of character card details in extraction prompts for disambiguation.

## [1.0.5] - 2026-02-19
### Added
- Editable per-stat prompt templates with per-prompt reset buttons.
- Prompt placeholder documentation in settings and README.
- Settings to override max tokens and context truncation length for extraction requests.
### Changed
- Sequential prompt defaults are stat-specific; strict/repair prompts are fixed.
- Extraction now respects profile/preset token limits and truncation length.
- Settings layout reorganized (quick help on top, connection/generation/extraction grouped).

## [1.0.4.13] - 2026-02-19
### Changed
- Moved Quick Help to the top of settings.

## [1.0.4.12] - 2026-02-19
### Changed
- Reorganized settings layout: connection section first, then generation and extraction.

## [1.0.4.11] - 2026-02-19
### Added
- Settings to override max tokens and context truncation length for extraction requests.

## [1.0.4.10] - 2026-02-19
### Changed
- Extraction now respects profile token limits and truncation length when available.

## [1.0.4.9] - 2026-02-19
### Changed
- Prompt reset buttons no longer clear prompt textareas.
- Debug section moved to the bottom of settings.

## [1.0.4.8] - 2026-02-19
### Changed
- Documented prompt templates and placeholders in README.

## [1.0.4.7] - 2026-02-19
### Changed
- Prompts section is now single-column with per-prompt reset buttons.
- Added prompt-stack spacing for cleaner layout.

## [1.0.4.4] - 2026-02-19
### Changed
- Repair/strict prompts are now fixed and no longer editable in settings.
- Sequential prompt defaults are stat-specific and no longer rely on stat placeholders.
- Prompt editor help text updated to reflect current placeholders.

## [1.0.4.3] - 2026-02-18
### Added
- Prompt placeholder reference list in settings to explain available macros.
### Changed
- Expanded prompt editor help text for clarity.

## [1.0.4.2] - 2026-02-18
### Added
- Per-stat sequential prompt templates in settings, with a reset-to-defaults button.
### Changed
- Sequential extraction now uses per-stat templates instead of the unified prompt template.

## [1.0.4.1] - 2026-02-18
### Added
- Prompt template editor in settings for unified and repair prompts, plus a reset-to-defaults button.
### Changed
- Extraction now renders prompts through user-configurable templates with placeholder support.

## [1.0.4] - 2026-02-18
### Changed
- Route extraction through Generator with the selected profile, and build as ES module for utils-lib compatibility.
- Graph history now dedupes by message index, ignores legacy entries without messageIndex, skips deleted messages, and keeps up to 120 snapshots.
- Diagnostics dumps now include settings provenance, graph preferences, profile resolution, request metadata, history sample, and request numbering starts at 1.

## [1.0.3.12] - 2026-02-18
### Changed
- Diagnostics request numbering now starts at 1 for each run.

## [1.0.3.11] - 2026-02-18
### Changed
- Diagnostics dump now includes settings provenance, graph preferences, profile resolution, request metadata, and a history sample for faster debugging.

## [1.0.3.10] - 2026-02-18
### Changed
- Graph history now ignores legacy snapshots without a message index and skips deleted messages to prevent retrack stacking.

## [1.0.3.9] - 2026-02-18
### Changed
- Store up to 120 tracker snapshots so the graph window setting (30/60/120/all) has visible effect.

## [1.0.3.8] - 2026-02-18
### Changed
- De-duplicate graph history by message index so retracks do not add extra points.

## [1.0.3.7] - 2026-02-18
### Changed
- Route generation through `sillytavern-utils-lib` Generator with the selected profileId so the extension profile is always used.
- Switch build output to ES module and externalize SillyTavern runtime imports for Generator compatibility.

## [1.0.3.6] - 2026-02-18
### Changed
- Force the selected connection profile during quiet generation and restore it afterward.

## [1.0.3.5] - 2026-02-18
### Changed
- Always use SillyTavern's internal quiet generation pipeline so the selected connection profile is honored for tc/cc backends.

## [1.0.3.4] - 2026-02-18

- When a connection profile is selected in the extension, the generator now skips STâ€™s quiet pipeline so the chosen profile is always used.

## [1.0.3.3] - 2026-02-18

- Route extraction requests based on the selected connection profile mode (`tc` uses text-completions; `cc` uses chat-completions).
- Keep profile override fields for compatibility with older ST backends.

## [1.0.3.2] - 2026-02-18

- Attempt to honor extension connection profiles via ST quiet pipeline (if supported) and include compatibility profile fields for direct fetch requests.

## [1.0.3.1] - 2026-02-18

- Added compatibility `profile_id` field to extraction requests to avoid 400s on older ST backends while still honoring extension connection profiles.

## [1.0.3] - 2026-02-18

- Connection profiles now always come from the extension settings by skipping the quiet-generation path when a profile is configured.
- Retrack now loads the previous AI messageâ€™s tracker state before applying new deltas so values donâ€™t stack on themselves.
- Parser delta clamping obeys `maxDeltaPerTurn`, and the README/workflow notes were refreshed to describe the exact behavior.

## [1.0.2] - 2026-02-18

- Removed hidden `settings.characterDefaults` baseline path from runtime.
- Removed character-defaults popup integration and related settings fields.
- Baseline defaults now use only:
  - character advanced definitions (`extensions.bettersimtracker.defaults`),
  - contextual inference fallback.
- Updated README to match this behavior.

## [1.0.1] - 2026-02-18

- Made `Max Delta Per Turn` effective end-to-end:
  - parser delta clamp now follows configured max delta,
  - extraction parse/retry pipeline passes configured max delta,
  - unified prompt requests deltas in configured range.
- Expanded README with exact confidence/delta application math.
- Corrected README character-default priority to match runtime behavior.

## [1.0.0] - 2026-02-18

- First stable public release.





































