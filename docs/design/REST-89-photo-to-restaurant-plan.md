# REST-89 — AI onboarding "Photo to Restaurant": implementation plan

Ticket: https://restaurant-dev.atlassian.net/browse/REST-89 · Design canvas: https://claude.ai/artifact/Qw8XwcDPd8tQ6HJgAuWtzx · Prototype: https://claude.ai/artifact/Fb5SHTjMh7hGMEG61aVTjW

Branch: `feature/REST-89-photo-to-restaurant` (one branch, one PR; commits grouped by phase below so the PR can be reviewed commit by commit).

## 0. Decisions (agreed 2026-11-25)

| Topic | Decision |
|---|---|
| AI provider | Gemini direct (`@google/genai`), behind an `AiProvider` port. Flash-Lite for menu + recipes, Flash for invoices. Model IDs from env. A `fake` provider for dev, CI, tests and offline demos. |
| Images | On the API server's disk (Docker volume), deleted when no longer needed (see §3.4). Object storage later. |
| Job runner | Our own `ai_jobs` table + small in-process runner (`FOR UPDATE SKIP LOCKED`, recovers on boot). No pg-boss/Redis: the job table already exists for results, so a queue library adds nothing. |
| Live rows | Gemini streaming → incremental JSON-array parser → each element Zod-validated → saved to `ai_job_items` → pushed on Pusher. Refresh = refetch items, resubscribe. |
| Portions | New optional `menu_item_variants` table. Items keep `price`; variants only for Half/Full. `OrderItem.variantId` optional. |
| Recipes | One recipe per item; each variant has `portionFactor` (Half = 0.5). Cost per variant = item recipe cost × factor. |
| Estimated prices | Seeded global ingredient catalog; Gemini estimates only unknown ingredients, cached in the catalog (`priceSource = AI`). |
| Cost bands | Follow restaurant target: healthy ≤ targetMax, watch ≤ targetMax + 7, poor above. Target stored on `restaurants`. |
| Daily limits | 10 menu scans + 20 invoice scans per restaurant per day (env). Recipe drafting is unmetered by count but token usage is logged. |

**Deterministic, not AI:** blur/quality pre-check, pack-size conversion, GST/total check, plate cost, food-cost %, margins, before→after diff, duplicate detection, ingredient merge suggestions, invoice-line→ingredient matching (AI only for leftovers), price-jump check, duplicate-invoice check.

## 1. Data model (`packages/db/prisma/schema.prisma`) — one migration + one seed migration

### 1.1 Menu
```prisma
enum DietType { VEG NON_VEG EGG }
enum RecipeSource { MANUAL AI_DRAFT }

model MenuItem {
  // + new
  dietType         DietType?     @map("diet_type")
  recipeSource     RecipeSource  @default(MANUAL) @map("recipe_source")
  recipeReviewedAt DateTime?     @map("recipe_reviewed_at") @db.Timestamptz(6)
  variants         MenuItemVariant[]
}

/// Optional portion variants (Half / Full). An item with none is ordered at `MenuItem.price`.
model MenuItemVariant {
  id            String   @id @default(uuid()) @db.Uuid
  restaurantId  String   @map("restaurant_id") @db.Uuid
  menuItemId    String   @map("menu_item_id") @db.Uuid
  name          String   @db.VarChar(50)
  price         Decimal  @db.Decimal(12, 2)
  /// Recipe quantity multiplier (Half = 0.5, Full = 1).
  portionFactor Decimal  @default(1) @map("portion_factor") @db.Decimal(5, 3)
  sortOrder     Int      @default(0) @map("sort_order")
  isActive      Boolean  @default(true) @map("is_active")
  createdAt / updatedAt (Timestamptz)
  @@unique([menuItemId, name])
  @@index([restaurantId])
  @@map("menu_item_variants")
}

model OrderItem {
  // + new
  variantId   String? @map("variant_id") @db.Uuid
  /// Snapshot so KOT/bill text survives a later rename.
  variantName String? @map("variant_name") @db.VarChar(50)
  @@index([variantId])
}
```
"No AI draft reviewed" filter = `recipeSource = AI_DRAFT AND recipeReviewedAt IS NULL`. Editing a recipe in the menu UI sets `recipeReviewedAt`.

### 1.2 Restaurant / inventory
```prisma
model Restaurant {
  targetFoodCostMin Decimal @default(30) @map("target_food_cost_min") @db.Decimal(5, 2)
  targetFoodCostMax Decimal @default(35) @map("target_food_cost_max") @db.Decimal(5, 2)
}
model StockItem {
  /// Used for costing until a real batch cost exists. Per base unit.
  estimatedUnitCost Decimal? @map("estimated_unit_cost") @db.Decimal(18, 8)
}
model InventorySupplier {
  gstin String? @db.VarChar(15)
  @@unique([restaurantId, gstin])          // NULLs are distinct in PG → fine
}
model InventoryReceipt {
  supplierInvoiceNumber String?  @map("supplier_invoice_number") @db.VarChar(50)
  supplierInvoiceDate   DateTime? @map("supplier_invoice_date") @db.Date
  invoiceTotal          Decimal? @map("invoice_total") @db.Decimal(14, 2)
  taxBreakdown          Json?    @map("tax_breakdown")   // {cgst, sgst, igst, roundOff}
  scanJobId             String?  @map("scan_job_id") @db.Uuid
  @@index([restaurantId, supplierId, supplierInvoiceNumber])   // duplicate warning, not a hard block
}
```
Duplicate invoice is a **warning** the owner must acknowledge (`acknowledgeDuplicate: true`), not a unique constraint, because suppliers reuse numbers across years.

### 1.3 AI tables
```prisma
enum AiJobKind   { MENU_SCAN INVOICE_SCAN RECIPE_DRAFT }
enum AiJobStatus { QUEUED RUNNING SUCCEEDED PARTIAL FAILED CANCELLED }
enum AiJobContext { ONBOARDING POST_ONBOARDING }

model AiJob {
  id, restaurantId, createdByUserId
  kind AiJobKind; status AiJobStatus @default(QUEUED); context AiJobContext
  input      Json      // settings: portion style, target, page meta {n, w, h, qualityScore}
  result     Json?     // invoice header, page statuses, summary
  pagesTotal Int @default(0); pagesDone Int @default(0)
  errorCode  String?   @db.VarChar(40)   // UNREADABLE | NOT_A_MENU | NOT_AN_INVOICE | AI_UNAVAILABLE | ...
  attempts   Int @default(0)
  imagesPurgedAt DateTime?
  startedAt, finishedAt, createdAt, updatedAt
  items AiJobItem[]
  @@index([restaurantId, kind, createdAt]); @@index([status])
  @@map("ai_jobs")
}
model AiJobItem {
  id; jobId; seq Int; page Int?
  data Json          // validated row (menu row / invoice line / recipe draft)
  confidence Int     // 0–100
  createdAt
  @@unique([jobId, seq]); @@map("ai_job_items")
}
model AiUsage {
  restaurantId; day DateTime @db.Date; kind AiJobKind
  jobs Int @default(0); inputTokens Int @default(0); outputTokens Int @default(0)
  @@id([restaurantId, day, kind]); @@map("ai_usage")
}
```

### 1.4 Global reference data (no `restaurant_id`, intentionally: holds no tenant data)
```prisma
model IngredientCatalog {
  id; canonicalName String @unique; baseUnit InventoryBaseUnit
  aliases String[]                 // "dahi", "curd", "yogurt"
  estimatedPricePerBase Decimal @db.Decimal(18, 8)   // ₹ per g / ml / unit
  priceSource IngredientPriceSource  // SEED | AI
  updatedAt
  @@map("ingredient_catalog")
}
model RecipeTemplate {
  id; dishKey String; portionStyle PortionStyle   // LIGHT | STANDARD | GENEROUS
  lines Json   // [{ingredient: canonicalName, quantity, unit}]
  note String?; model String; hits Int @default(0); createdAt
  @@unique([dishKey, portionStyle]); @@map("recipe_templates")
}
```
Seed: hand-written migration inserting about 200 common Indian kitchen ingredients with aliases (English/Hindi transliteration) and estimated prices. Data file: `packages/db/prisma/seed-data/ingredient-catalog.ts`, generated to SQL once. Prices are labelled "Estimated market price" everywhere.

### 1.5 Draft step numbers (trap)
`onboarding.service.ts` stores steps as `ONBOARDING_STEPS.indexOf(step) + 1`. Inserting `recipes` between menu and inventory would silently shift every saved draft. Fix: a fixed code map `{details:1, floor:2, menu:3, inventory:4, team:5, review:6, recipes:7}` used by `stepToNumber`/`numberToStep`. Display order comes from `ONBOARDING_STEPS`; stored numbers never change. No data migration. Add a unit test that pins the map.

## 2. Contract (`packages/api-contract`)

New / changed files:

- **`ai-scans.ts`**: `aiJobKindSchema`, `aiJobStatusSchema`, `aiJobErrorCodeSchema`, `aiPageQualitySchema`, `sourceBoxSchema` (`{page, x, y, w, h}` normalised 0–1), `extractedMenuRowSchema` (category, type FOOD/BAR, name, originalName, dietType, variants[{name, price}], price, confidence, fieldConfidence, source box, flags: `likelyDuplicateOf`, `notADish`), `extractedInvoiceHeaderSchema` (supplier name, GSTIN, invoice no, date, CGST/SGST/IGST, round-off, total, HSN per line), `extractedInvoiceLineSchema` (raw text, qty, pack size, unit, rate, amount, HSN, batch, expiry, confidence), `recipeDraftSchema` (menuRowKey, lines[{ingredient, quantity, unit, confidence}], note, noRecipeNeeded, fromCache), job response, item page (`?afterSeq=`), Pusher event schemas (`ai-job.item`, `ai-job.progress`, `ai-job.status`), quota error schema.
- **`ai-model-output.ts`**: the strict schemas the model must return (separate from API shapes; kept small, since Gemini `responseSchema` accepts only an OpenAPI subset). Mapped to the API schemas in the service.
- **`costing.ts`**: pure functions shared by web and API: `toBaseQuantity(q, unit)`, `convertPack(qty, packSize, packUnit) → base qty`, `plateCost(lines, prices)`, `variantCost(itemCost, factor)`, `foodCostPercent`, `costBand(pct, target)`, `marginDiff(before, after)`, `invoiceTotalCheck(header, lines) → {ok, delta}`, `formatInr` (Indian grouping). Money in integer paise; quantities as decimal strings (same convention as `recipeQuantitySchema`).
- **`ingredient-matching.ts`**: `normalizeName`, token/Levenshtein similarity, `suggestMerges(ingredients)`, `matchInvoiceLine(line, ingredients) → [{ingredientKey, score}]`. Pure TS, so the web can re-rank live while the owner types. Lists are at most a few hundred entries, so no pg_trgm is needed.
- **`onboarding.ts`** changes:
  - `ONBOARDING_STEPS` adds `'recipes'` after `'menu'`; `SKIPPABLE_ONBOARDING_STEPS` too; `ONBOARDING_STAGES` adds `'recipes'` after `'inventory'` (variants are written inside the existing `menu` stage).
  - `onboardingMenuDraftSchema.mode` adds `'scan'`; `onboardingMenuRowSchema` adds optional `dietType`, `variants[]`, `originalName`, `ai: {jobId, seq, confidence, source, accepted}`, `excluded` (with reason).
  - New `onboardingRecipesDraftSchema`: `{targetMin, targetMax, portionStyle, jobId?, dishes: [{menuRowKey, status: 'draft'|'approved'|'no-recipe', lines:[{key, ingredientKey, quantity, unit, ai?}]}]}`.
  - `onboardingInventoryRowSchema` adds `origin: 'recipe'|'invoice'|'csv'|'manual'`, `costSource: 'estimated'|'invoice'|'manual'`, `estimatedUnitCost`, `aliases`.
  - New `onboardingInvoicesDraftSchema`: `[{jobId, header, lines:[{matchIngredientKey|null, newIngredient?, baseQty, unitCost}], applied: boolean}]`.
  - Strict finish schema: recipes reference existing menu row keys and inventory row keys; quantities > 0; at most 50 lines per recipe.
  - `findRecipeIssues()` shared issue finder (same pattern as `findMenuRowIssues`).
- **`menu-items.ts`**: `dietTypeSchema`, `menuItemVariantSchema`, variants in create/update/response; `recipeSource`, `recipeReviewedAt`; list query `recipeStatus=ai-unreviewed`; new `bulkImportMenuItemsSchema` (post-onboarding photo import).
- **`orders.ts`**: add-item request gets optional `variantId`; order item response gets `variantId`, `variantName`.
- **`inventory.ts`**: receipt create adds `supplierGstin`, `supplierInvoiceNumber`, `supplierInvoiceDate`, `invoiceTotal`, `taxBreakdown`, `scanJobId`, `acknowledgeDuplicate`; new `receiptChecksResponseSchema` (duplicate match, price jumps per line).
- **`restaurant-settings.ts`**: `targetFoodCostMin/Max`.
- **`reports.ts`**: `marginReportSchema` (dish, variant, cost, price, pct, band, costSource mix).
- `@rms/permissions`: add `MENU_SCAN: 'menu:scan'`, `INVENTORY_SCAN_INVOICE: 'inventory:scan-invoice'` to the catalog; default to Manager in `ROLE_PERMISSIONS`. Owner bypasses. No role names in controllers.

## 3. API (`apps/api`)

### 3.1 New module `src/ai/`
```
ai/
  ai.module.ts
  provider/
    ai-provider.ts            // port: streamStructured(), generateStructured(), usage reporting
    gemini.provider.ts        // @google/genai; streaming; responseSchema; retries w/ backoff; 60s timeout
    fake.provider.ts          // fixture rows with delays (dev/CI/demo; AI_PROVIDER=fake)
  prompts/
    menu-extraction.prompt.ts
    invoice-extraction.prompt.ts
    recipe-draft.prompt.ts
    ingredient-price.prompt.ts
  streaming/json-array-stream.ts   // incremental parser: emits each complete top-level array element
  jobs/
    ai-jobs.controller.ts     // GET /ai/jobs/:id, GET /ai/jobs/:id/items?afterSeq, GET /ai/jobs/:id/pages/:n, POST /ai/jobs/:id/cancel
    ai-jobs.service.ts
    ai-jobs.repository.ts
    ai-job-runner.ts          // claims QUEUED jobs, concurrency semaphore (AI_MAX_CONCURRENT_JOBS), boot recovery, resume from pagesDone
    ai-realtime.publisher.ts  // Pusher private-restaurant-{rid}-user-{uid}-ai channel
  scans/
    menu-scan.controller.ts   // POST /ai/menu-scans (multipart), POST /ai/menu-scans/:id/pages/:n (retake)
    menu-scan.handler.ts      // per page: stream rows → validate → dedupe/not-a-dish flags → save → push
    invoice-scan.controller.ts// POST /ai/invoice-scans (multipart)
    invoice-scan.handler.ts   // extract header + lines → pack conversion → total check → match vs ingredients
    recipe-draft.controller.ts// POST /ai/recipe-drafts {dishes[], portionStyle, target}
    recipe-draft.handler.ts   // cache lookup → batches of 10 uncached dishes → stream → cache write → price unknown ingredients
  storage/
    scan-image.store.ts       // write/read/delete under AI_UPLOAD_DIR/{restaurantId}/{jobId}/{n}.jpg
    scan-image.janitor.ts     // hourly: delete images past TTL or for finished/abandoned jobs
  usage/
    ai-quota.service.ts       // daily limits (transactional upsert on ai_usage), 429 with quota error
  catalog/
    ingredient-catalog.repository.ts
    recipe-template.repository.ts
```
- All AI controllers carry the setup-gating decorator (`allow-during-setup.decorator.ts`) so the owner can use them while onboarding is pending, plus `@RequirePermissions` (`menu:scan`, `inventory:scan-invoice`, `menu:write` for recipe drafts).
- Uploads: `FileInterceptor` from `@nestjs/platform-express` (multer, already a transitive dependency). At most 8 files, 6 MB each, JPEG/PNG/WebP only, checked by magic bytes, not by the client's MIME type. The client sends already-normalised JPEG pages (§4.2), so HEIC/PDF never reach the server.
- Every model response is parsed by the `ai-model-output.ts` schemas; an invalid element is dropped and counted (`result.droppedRows`), never guessed. Confidence < 75 → flagged, never auto-accepted.
- Page-level classification in the same call (`documentType: menu|invoice|other`, `quality: ok|blurry|cropped|unreadable`) drives the failure states without extra calls.
- Source boxes: Gemini `box_2d` (0–1000) normalised to 0–1. If missing, the UI highlights the whole page and does not fake a precise box.
- Recipe drafting: dish key = `normalizeName(name)` (+ diet type). Cache hit → item emitted immediately with `fromCache: true`. Misses go to the model in batches of 10; results are written to `recipe_templates`. Unknown ingredients → one batched `ingredient-price` call → inserted into `ingredient_catalog` with `priceSource = AI`.
- Realtime: generalise `NotificationPublisher.authorize` (or add `AiRealtimePublisher` with its own `/ai/realtime/auth`) so a user can subscribe only to their own AI channel. Payloads stay under Pusher's 10 KB limit (one row per event). Pusher is best effort; the client also polls `items?afterSeq` every 3 s while a job is RUNNING and the socket is disconnected.
- Usage: token counts from Gemini `usageMetadata` → `ai_usage`; structured log per call (model, tokens, latency, jobId) with no image or prompt content.

### 3.2 Onboarding changes (`src/onboarding/`)
- `onboarding.service.ts`: fixed step-number map (§1.5); finish validation includes recipes/invoices; skipped `recipes` step ignores its data.
- `onboarding-completion.writer.ts`:
  - `writeMenu`: create `dietType`, variants (`portionFactor` from variant name: Half 0.5, Full 1, Quarter 0.25, else 1, editable later), `recipeRequired = false` for "No recipe needed".
  - `writeInventory`: also sets `estimatedUnitCost`; invoice-sourced rows create opening batches at the invoice unit cost (existing opening path).
  - New stage `recipes` **after** inventory: map ingredient keys → created stock item ids by name; insert `recipe_items`; set `recipeSource = AI_DRAFT` when AI-drafted and `recipeReviewedAt = now()` for approved dishes.
  - Write `targetFoodCostMin/Max` in the details/final stage.
- Delete the job's scan images after a successful complete.
- `main.ts`: raise the JSON body limit for `PUT /onboarding/draft` (Express default 100 KB; a 60-dish draft with recipes and invoices can be ~300 KB). Use 2 MB on that route only.

### 3.3 Variants across ordering, KOT and billing
- `menu-items.service/repository`: CRUD variants with the item (replace-set semantics, like recipes).
- `orders.repository.ts` (line ~200 selects `price`): also select active variants. `order-items.service.ts`: if the item has active variants, `variantId` is **required** and the unit price snapshot = variant price; `variantName` snapshot stored. The fold-into-identical-line rule includes `variantId`.
- `orders.mapper.ts`, `bills.mapper.ts`, KOT payloads: display name = `name (variantName)` when present.
- Stock consumption (if/when recipes deduct stock): quantity × `portionFactor`.
- Tests: `orders.service.spec.ts` gains variant cases (required, price snapshot, fold rules); `bills.service.spec.ts` line naming.

### 3.4 Image lifecycle (images on server disk)
- Path: `AI_UPLOAD_DIR` (default `/app/data/ai-uploads`), mounted as the `ai-uploads` Docker volume in `docker-compose.yml` (and therefore in the VPS deploy, which runs the same compose file).
- "Done" means the owner no longer needs the photo, **not** "extraction finished": the review screen shows the photo beside the table and inline snippets for low-confidence fields. Images are deleted when any of these happens:
  1. onboarding completes, or the post-onboarding import/receipt is saved,
  2. the owner discards the scan / leaves the mode (`POST /ai/jobs/:id/cancel` with `purge`),
  3. the janitor finds a job older than `AI_IMAGE_TTL_HOURS` (default 72).
- `imagesPurgedAt` is set on the job; afterwards the UI shows rows without snippets.
- This assumes a single API instance (true today). Object storage is the follow-up when that changes.

### 3.5 Post-onboarding endpoints
- `POST /menu/items/bulk-import`: creates categories/items/variants from reviewed rows; duplicate check against the live menu (`normalizeName` + category).
- `POST /inventory/goods-receipts` (extended): supplier resolved by GSTIN → existing or created; invoice no/date/total/tax stored; lines → batches with batch no + expiry; requires `acknowledgeDuplicate` when a duplicate exists.
- `POST /inventory/goods-receipts/checks`: duplicate-invoice match ("Already recorded on 3 Nov") and per-line price jump vs the last receipt cost (threshold 15%, env).
- `GET /reports/margins` and `POST /reports/margins/preview` (cost overrides → before/after diff) for the after-save margin diff.
- `GET /menu/items?recipeStatus=ai-unreviewed`.

### 3.6 Env (`config/env.validation.ts`, `.env.example`, compose)
```
AI_PROVIDER=gemini|fake          (default fake in development/test)
GEMINI_API_KEY=                  (optional; missing → AI endpoints return AI_UNAVAILABLE, UI falls back to CSV/manual)
AI_MODEL_MENU=<flash-lite id>    AI_MODEL_INVOICE=<flash id>    AI_MODEL_RECIPES=<flash-lite id>
AI_UPLOAD_DIR=/app/data/ai-uploads
AI_IMAGE_TTL_HOURS=72
AI_DAILY_MENU_SCANS=10           AI_DAILY_INVOICE_SCANS=20
AI_MAX_CONCURRENT_JOBS=3
AI_PRICE_JUMP_PERCENT=15
```
Pick exact Gemini model IDs and check current pricing at implementation time (§7).

## 4. Web (`apps/web`)

### 4.1 Shared AI components: `src/components/AiScan/`
Mapped to the "Components" boards (shadcn/ui + existing grayscale theme tokens; nothing copied from the canvas CSS):
`CaptureTile`, `PageThumbnailStrip` (drag reorder via keyboard too, delete, retake), `QualityWarning`, `StreamingRow`, `SourceHighlight` (absolutely positioned box over the page image; glow disabled under `prefers-reduced-motion`), `SourceSnippet` (CSS crop of the page image from the box), `ConfidenceBadge` (icon + number: ≥90 / 75–89 / <75 "Check"), `TrustMarker` (AI-suggested / low confidence / edited by you / approved), `PriceSourceMarker` (≈ estimated dashed vs receipt "From invoice" solid), `DietMarker` (circle / triangle / ring + label), `CostMeter` + `CostBand`, `IngredientMatchSelect`, `InvoiceHeaderCard` + `InvoiceTotalCheck`, `MarginDiffPanel` (arrow + text, never colour only), `FloatingAiProgress`, `AiFailureState` (unreadable / not a menu / partial / AI unavailable / limit / offline).

### 4.2 Image preparation: `src/lib/scan-images.ts` (lazy-loaded)
- HEIC → JPEG (`heic2any`, dynamic import), PDF → one JPEG per page (`pdfjs-dist`, dynamic import), resize to a long edge of 2000 px, JPEG quality 0.85.
- Quality score: Laplacian variance on a 512 px grayscale copy (blur), mean brightness (dark), minimum resolution. Warning shown **before** upload, and the owner can override.
- 2–8 pages; offline → keep the prepared blobs in memory and show "Upload paused", retry on `online`.

### 4.3 Hooks: `src/services/api/requests/ai-scans.ts` + `src/hooks/useAiJob.ts`
- `useAiJob(jobId)`: TanStack Query for the job + items; subscribes to the Pusher AI channel (reusing the `useNotificationSubscription` setup); appends items to the query cache by `seq` (idempotent); falls back to polling while disconnected.
- The active job id lives in the onboarding draft, so reopening the tab resumes the stream.

### 4.4 Onboarding (`src/containers/Onboarding/`)
| Board | Change |
|---|---|
| Welcome | `Welcome.tsx`: hero "Have a photo of your menu? Start there." → `advance(null,'menu')` with `menu.mode='scan'`; Details/Floor stay "to do"; step list includes Recipes & costs. |
| Stepper | `steps.ts`, `progress.ts`, `useStepNavigation.ts`: new `recipes` step (Optional). Match the live wizard's stepper if it differs from the canvas. |
| Menu scan | `steps/MenuStep.tsx` → segmented control with `Scan menu photo` (default, AI mark) / CSV / manual / later. New `steps/menu/ScanCapture.tsx`, `ScanStreaming.tsx` (photo left, streaming table right, "Page 2 of 4 · 38 items found", pause, review early, edit while streaming), `ScanReview.tsx` (extends the existing review table: diet, variants, confidence, snippet, problems first, "N ready · M need attention", Accept all high-confidence, duplicates, not dishes, "Import N, leave out M"), original script next to cleaned name. Note text → "Next, we'll draft recipes and food cost for these dishes." |
| Recipes & costs | New `steps/RecipesStep.tsx` with `recipes/RecipesNeedsMenu.tsx`, `RecipesStart.tsx` (target %, portion style), `RecipesDrafting.tsx` (live cards; review early), `RecipesReview.tsx` (split view, filters, inline line editor, live cost/pct/band via `costing.ts`, "No recipe needed", approve one / approve all, keyboard Tab/Enter/A/E scoped to the list, not a global keydown), `RecipesIngredients.tsx` (dedupe "used in 14 dishes", merge suggestions, base unit → writes inventory rows `origin:'recipe'`), `RecipesMargins.tsx` (ranked, 5 lowest, average, invoice prompt). |
| Inventory | `steps/InventoryStep.tsx`: rows pre-filled "From your recipes"; modes Scan supplier invoice / CSV / manual / later (pre-filled rows stay in every mode). New `inventory/InvoiceScan.tsx` (reuses capture + streaming), `InvoiceMatchTable.tsx` (match dropdown with confidence or "Add as new ingredient", pack conversion shown "5 × 1 kg → 5000 g"), header + GST + total check (apply blocked on mismatch), scan another, `InvoiceMarginUpdate.tsx` ("Real costs for 9 ingredients → 23 dishes' margins updated", before → after, labels flip to From invoice). |
| Review & finish | `steps/ReviewStep.tsx`: Recipes section (count, ingredients, average food cost %, lowest-margin dishes, ingredients still estimated). |
| Finishing / Ready | `Finishing.tsx`: Recipes stage after Inventory. `Ready.tsx`: "Your restaurant is ready: 62 dishes, 58 recipes, 84 ingredients, average margin 67%" + floor board / menu / margin report links + still-to-do note. |
| Floating progress | `OnboardingLayout.tsx` renders `FloatingAiProgress` when the draft has a RUNNING job. |

### 4.5 Outside the wizard
- Menu items page (`containers/MenuItems`, `MenuItemFormSidePane`): diet marker, variants editor (name, price, portion factor), "Import from photo" → same capture/stream/review → `bulk-import`; filter "AI draft, not yet reviewed".
- Ordering (`AddOrderItemDialog`, `OrderingMenu`, `OrderingMenuItem`): variant picker (Half / Full chips) when an item has variants; `KitchenDisplay` / `BarDisplay` / `StationDisplay` / bill views show the variant name.
- Inventory page: "Scan invoice" → capture/stream/match → receipt form prefilled → duplicate and price-jump warnings → save → margin diff.
- Restaurant settings: target food-cost min/max.
- Reports: margin report page (simple table + bands).

### 4.6 Responsive / accessibility
Breakpoints 375 / 768 / 1280+. Capture is mobile-first (`<input type="file" accept="image/*" capture="environment" multiple>`), review is desktop-first with a stacked mobile review for small menus. Light and dark via existing theme tokens. Real buttons and inputs, `aria-live` for streaming counts, status never conveyed by colour alone.

## 5. Phases (commit groups on the one branch)

1. **Foundation**: schema + migrations (incl. catalog seed), contract files, permissions keys, env, fixed step-number map, body limit, compose volume. `generate`, typecheck.
2. **AI core**: provider port, Gemini + fake providers, JSON-array stream parser, job runner, image store + janitor, quota, realtime channel, ai-jobs endpoints. Unit tests for the parser, runner recovery and quota.
3. **Menu scan (onboarding)**: menu-scan handler + prompt; web image prep, AiScan components, capture/stream/review; Welcome hero; draft schema changes; completion writes diet + variants.
4. **Variants everywhere**: menu CRUD, ordering, KOT, billing, displays + tests.
5. **Recipes & costs**: costing + matching libs (tests), recipe-draft handler with cache + price fallback, Recipes step UI, ingredient summary → inventory prefill, completion `recipes` stage.
6. **Invoice scan (onboarding)**: invoice handler, pack conversion, total check, matching UI, margin update.
7. **Finish flow**: Review recipes section, Finishing stage, Ready payoff, image purge on complete.
8. **Post-onboarding**: menu bulk import, receipt extensions (GSTIN supplier, duplicate/price-jump checks, batches), margin report + preview, AI-unreviewed filter, settings target.
9. **Hardening**: failure states end to end (driven by the fake provider: `FAKE_SCENARIO=unreadable|partial|unavailable|quota`), a11y pass, dark mode, 375/768 checks, eval script.

`yarn lint && yarn typecheck && yarn test` green at the end of every phase.

## 6. Testing

- **Unit (Jest)**: `json-array-stream` (chunk boundaries, strings containing brackets, truncated tail), `costing.ts` (paise rounding, pack conversion, bands relative to target), `ingredient-matching.ts` (curd/dahi, "AMUL PANEER 1KG" → Paneer), invoice total check, step-number map pinned, quota boundary (10th ok, 11th 429), order variant pricing/fold, completion writer recipes stage (stock ids resolved by name, approved → reviewedAt).
- **Fake provider** makes the whole flow runnable without a key, in CI and for offline sales demos.
- **Model eval** (`yarn workspace @rms/api ai:eval`, manual, not CI): a set of ~10 menus + ~10 invoices (fictional or anonymised; real photos stay out of git) with expected JSON; reports field accuracy, rows found/missed, price errors, tokens and ₹ cost per model. Use it to confirm Flash-Lite is enough for menus and to compare models before switching.

## 7. Risks and open items

- **Model IDs and prices change**: verify current Gemini model names and pricing at the start of phase 2; keep them in env.
- **Box accuracy** from a cheap model may be rough → whole-page highlight fallback; OCR+LLM only if the eval shows boxes are unusable.
- **Gemini rate limits** at demo time → concurrency semaphore + retry with backoff + `AI_UNAVAILABLE` path that keeps all work.
- **PR size** (single branch by decision): mitigated by phase-grouped commits and the fake provider for reviewers.
- **Disk images**: single-instance assumption; volume must exist on the VPS before deploy.
- **Data privacy**: menu/invoice photos go to Google's API. Use the paid tier (no training on data); mention it in the privacy note on the capture screen ("Photos are only used to read your menu").
