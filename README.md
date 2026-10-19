# fulfillment-reviews

Public, static review pages for Boostly in-store fulfillment orders (Tap Cards, table and bathroom stickers, POP signage, to-go labels).

Each location gets one page: the branding evidence that was gathered, the logo candidates, the variant sheet with the recommended and picked cells, and the signage previews. The index lists every included location newest-first with its pipeline status, the recommended and picked variant letters, and links to the Figma production sheets and the print hand-off folder when they exist.

Audience: Boostly fulfillment staff and the print vendor. **Every page on this site is public.** There is no login, no analytics, and nothing on the site should contain ship-to names, street addresses, session data, or Boostly admin links. The build strips the admin links and run-internal artifacts from the review canvases before publishing.

## Rebuild

The pages are generated from the brand-design run directories (one directory per location with a `run.json` and a `review/review-canvas.html`). The run root is never modified.

Links-only runs (no review canvas, e.g. sister locations that inherit another run's branding) get a standalone page once `run.json` `signage.direct.status` is `built`: location name, the existing/inherited branding note with the source run, the links written/already set/held summary from `links.execution`, the signage sheets, and Print files. No canvas sections are invented (`scripts/print-files.mjs`).

Every page whose run has a `print-handoff/` directory gets a **Print files** section (after Signage sheets, which is also added to canvases that predate it): one link to the location's Google Drive print folder, read from `print-handoff/handoff.json` `drive.folder_link` (written by boostly-print-handoff). Without a Drive folder it reads "Print files: not uploaded yet". The PDFs are never uploaded to Blob or served by this site.

```
npm run build -- --run-root /Users/travisse/Programming/projects/brand-design-spike-2026-07-06/runs-prod-2026-09-18 --limit 20
```

Flags:

- `--run-root <dir>`: run root to read (defaults to the path above).
- `--limit <n>`: newest N runs by `request.created_at` that have a review canvas or built signage (default 20).
- `--slug <dir-name>`: include a specific run in addition to the newest N. Repeatable.
- `--max-px <n>`: long-edge cap for bundled images (default 1600; evidence photos are capped at 1200).

- `--no-upload`: fail instead of uploading if any asset is missing from the blob index.
- `--prune`: wipe `public/` and the manifest and regenerate them from this run root only. This is how a page is removed.

The build merges: it loads the committed `data/sites.json`, rebuilds only the selected runs (the newest `--limit` N in the run root plus every `--slug`), replaces their manifest entries and `public/<slug>/`, and keeps every other entry and page untouched. Pages built on another machine therefore survive a build here; `--limit` counts the newly selected local runs, not the kept entries. A kept entry whose `public/<slug>/index.html` is missing is dropped with a warning. Images are downsized with Pillow (`python3` with `PIL` must be available; no npm dependencies): 1600 px long edge, progressive JPEG q82, PNG only when the image has transparency, SVGs untouched.

### Where the images live

Images are not in git and not in the Vercel deployment. The build stages every asset under `.staging/` (git-ignored), hashes it, and uploads it once to the Vercel Blob store `fulfillment-reviews-assets` (boostly team, public read) under `assets/<slug>/<sha256 prefix>-<name>`. `data/blob-index.json` records every uploaded key with its URL and size and is committed, so a rebuild only uploads assets whose content changed. Page references are rewritten to the blob URLs. Small `.svg/.css/.js/.json` files (under 200 KB) stay next to the page.

The upload token is `BLOB_READ_WRITE_TOKEN`, pulled into the git-ignored `.env.local` with:

```
vercel env pull .env.local --scope boostly
```

Never commit `.env.local` or print the token.

Output:

- `public/index.html`: the index, rendered from `data/sites.json`, with inline search, sort and status filter.
- `public/<slug>/index.html`: one review page per location, images served from Blob.
- `data/sites.json`: the manifest (also served at `/data/sites.json`).
- `data/blob-index.json`: the upload cache.

Status in the manifest comes from `run.json` `state.cursor`: before `write` is "Awaiting pick" (or "Pick recorded" when a pick letter exists), `write` through `figma` is "Branding applied" only when `write.status` is `applied` or `applied+inherited` (otherwise a run with `write.branding_source_run` reads "Branding: inherits <source> (pending pick)", else "Awaiting pick" or "Pick recorded"), `slack` or `notion` is "Closed out". The recommended letter is `variants.fable_default_letter`; the picked letter is `variants.selection.letter`, falling back to `variants.applied_letter` and `write.inherited_branding.letter`. Request date is `request.created_at`; last updated is the newest `state.stages.*.written_at`.

## Deploy

The generated `public/` directory (HTML only) is committed. Vercel serves it as a prebuilt static site (`vercel.json`: no build command, output directory `public`). Pushes to the connected branch deploy automatically; `vercel --prod --scope boostly` deploys from the CLI.
