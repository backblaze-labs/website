# Backblaze B2 packages across registries

Snapshot taken **2026-05-05**. Sources:

- **npm** — `registry.npmjs.org/-/v1/search?text=backblaze+b2` (full JSON API)
- **PyPI** — Warehouse JSON API, probed for known names (search HTML is bot-walled)
- **crates.io** — `crates.io/api/v1/crates?q=backblaze` (full JSON API)
- **Go** — `pkg.go.dev/search?q=backblaze+b2` (HTML scrape)

Tag legend:

- 🏛 **official** — published by Backblaze
- 🧪 **labs** — under `backblaze-labs/*`
- ⭐ **established** — community standard / canonical 3rd-party SDK
- 🔌 **plugin** — adapter for a larger system (Strapi, Ghost, Drone, Vault, Airflow, etc.)
- 🪣 **abstraction** — multi-cloud storage layer; B2 is one of N backends

Numbers (downloads/stars) are approximate at snapshot time.

---

## npm (Node.js / TypeScript)

`registry.npmjs.org` reported **2,472 results** for "backblaze b2"; the meaningful entries follow.

### Core SDKs

| Package | Version | Notes |
| --- | --- | --- |
| [`backblaze-b2`](https://www.npmjs.com/package/backblaze-b2) | 1.7.1 | ⭐ De-facto Node.js client. By yakovkhalinsky. Most other packages depend on or fork it. |
| [`@types/backblaze-b2`](https://www.npmjs.com/package/@types/backblaze-b2) | 1.5.6 | TypeScript types (DefinitelyTyped) for the above. |
| [`b2-cloud-storage`](https://www.npmjs.com/package/b2-cloud-storage) | 1.1.2 | Alternate client by `nodecraft`. |
| [`b2-js`](https://www.npmjs.com/package/b2-js) | 1.2.4 | Promise-based client by benaubin. |
| [`ezb2`](https://www.npmjs.com/package/ezb2) | 3.0.0 | Typed, promise-based wrapper. |
| [`backblaze`](https://www.npmjs.com/package/backblaze) | 2.3.0 | Unofficial wrapper by franciscop. |
| [`backblaze-mcp`](https://www.npmjs.com/package/backblaze-mcp) | 0.3.0 | **MCP server** for Backblaze B2 storage operations. |

### Forks / republishes (mostly noise)

`shinobi-backblaze-b2`, `@nichoth/backblaze-b2`, `@stz184/backblaze-b2`, `@phil-r/backblaze-b2`, `@simonbergmark/backblaze-b2`, `backblaze-b2-extended`, `backblaze-b2-updated`, `backblaze-b2-promises` — all forks of `backblaze-b2`.

### Framework / CMS plugins

| Package | Version | Notes |
| --- | --- | --- |
| [`n8n-nodes-backblaze-b2`](https://www.npmjs.com/package/n8n-nodes-backblaze-b2) | 1.0.1 | 🔌 n8n nodes for B2 |
| [`strapi-provider-upload-backblaze-b2`](https://www.npmjs.com/package/strapi-provider-upload-backblaze-b2) | 0.0.4 | 🔌 Strapi v4 upload provider |
| [`strapi-provider-upload-b2`](https://www.npmjs.com/package/strapi-provider-upload-b2) | 1.0.3 | 🔌 Strapi v3 upload provider |
| [`strapi-provider-upload-backblaze-b2-custom-domain`](https://www.npmjs.com/package/strapi-provider-upload-backblaze-b2-custom-domain) | 0.0.6 | 🔌 Strapi w/ custom domain |
| [`nodebb-plugin-backblaze-b2-s3-uploads`](https://www.npmjs.com/package/nodebb-plugin-backblaze-b2-s3-uploads) | 0.2.2 | 🔌 NodeBB via B2 S3 API |
| [`nodebb-plugin-b2-uploads`](https://www.npmjs.com/package/nodebb-plugin-b2-uploads) | 1.0.4 | 🔌 NodeBB native B2 |
| [`@zaxbux/ghost-storage-b2`](https://www.npmjs.com/package/@zaxbux/ghost-storage-b2) | 0.0.3 | 🔌 Ghost storage adapter |
| [`ghost-storage-b2`](https://www.npmjs.com/package/ghost-storage-b2) | 0.0.7 | 🔌 Ghost storage adapter (alt) |
| [`ghost-storage-adapter-b2`](https://www.npmjs.com/package/ghost-storage-adapter-b2) | 1.0.0 | 🔌 Ghost (martiendt) |
| [`b2-ghost-storage`](https://www.npmjs.com/package/b2-ghost-storage) | 0.2.0 | 🔌 Ghost (Marky-Gee) |
| [`ghost-b2-cloud-storage`](https://www.npmjs.com/package/ghost-b2-cloud-storage) | 0.1.1 | 🔌 Ghost (wsmlby) |
| [`picgo-plugin-backblaze`](https://www.npmjs.com/package/picgo-plugin-backblaze) | 0.0.1 | 🔌 PicGo image-uploader plugin |
| [`@elog/plugin-img-b2`](https://www.npmjs.com/package/@elog/plugin-img-b2) | 0.1.1 | 🔌 Elog image plugin |
| [`@pikku/backblaze`](https://www.npmjs.com/package/@pikku/backblaze) | 0.12.5 | 🔌 Pikku content service |
| [`node-red-contrib-backblaze-b2`](https://www.npmjs.com/package/node-red-contrib-backblaze-b2) | 1.0.11 | 🔌 Node-RED |
| [`kap-b2`](https://www.npmjs.com/package/kap-b2) | 1.0.0 | 🔌 Kap (screen capture) share target |

### Storage abstractions / multi-backend

| Package | Version | Notes |
| --- | --- | --- |
| [`mobiletto`](https://www.npmjs.com/package/mobiletto) | 2.0.8 | 🪣 Unified S3 / B2 / local |
| [`mobiletto-base`](https://www.npmjs.com/package/mobiletto-base) | 2.1.1 | 🪣 |
| [`mobiletto-driver-b2`](https://www.npmjs.com/package/mobiletto-driver-b2) | 2.0.14 | 🪣 |
| [`mobiletto-lite`](https://www.npmjs.com/package/mobiletto-lite) | 2.0.8 | 🪣 |
| [`@tweedegolf/sab-adapter-backblaze-b2`](https://www.npmjs.com/package/@tweedegolf/sab-adapter-backblaze-b2) | 3.0.1 | 🪣 Storage Abstraction adapter |
| [`@smcloudstore/backblaze-b2`](https://www.npmjs.com/package/@smcloudstore/backblaze-b2) | 0.2.1 | 🪣 SMCloudStore plugin |
| [`solid-bucket`](https://www.npmjs.com/package/solid-bucket) | 2.1.1 | 🪣 Universal cloud bucket API |
| [`manage-storage`](https://www.npmjs.com/package/manage-storage) | 0.0.6 | 🪣 S3/B2/R2 |
| [`@glorychain/s3`](https://www.npmjs.com/package/@glorychain/s3) | 0.1.2 | 🪣 |
| [`s3mini`](https://www.npmjs.com/package/s3mini) | 0.9.4 | 🪣 Tiny S3 client (B2 via S3 API) |

### Cloudflare-edge / serverless proxies

| Package | Notes |
| --- | --- |
| [`cloud-blaze`](https://www.npmjs.com/package/cloud-blaze) | Cloudflare Workers proxy in front of B2 |
| [`@adaptive-ds/cfb2`](https://www.npmjs.com/package/@adaptive-ds/cfb2) | "Eliminate B2 outbound bandwidth costs through Bandwidth Alliance" |

### Backup / sync utilities

| Package | Notes |
| --- | --- |
| [`b2ens`](https://www.npmjs.com/package/b2ens) | "Encrypt-n-Sync" CLI for B2 |
| [`pg-backup`](https://www.npmjs.com/package/pg-backup) | Database backup to B2 |
| [`backlab`](https://www.npmjs.com/package/backlab) | GitLab → B2 backups |
| [`gcs-transfer-to-backblaze`](https://www.npmjs.com/package/gcs-transfer-to-backblaze) | GCS → B2 transfer |
| [`openclaw-b2-backup`](https://www.npmjs.com/package/openclaw-b2-backup) | 🧪 Lives under `backblaze-b2-samples` |

### Special

| Package | Notes |
| --- | --- |
| [`@cdktf-providers/backblaze-b2`](https://www.npmjs.com/package/@cdktf-providers/backblaze-b2) | Prebuilt CDKTF (Terraform CDK) bindings for the B2 provider |
| [`@gideo-llc/backblaze-b2-upload-any`](https://www.npmjs.com/package/@gideo-llc/backblaze-b2-upload-any) | Smart-upload helper on top of `backblaze-b2` |
| [`@transferx/adapter-b2`](https://www.npmjs.com/package/@transferx/adapter-b2) | TransferX large-file uploads |
| [`b2-webdav`](https://www.npmjs.com/package/b2-webdav) | Mount B2 over WebDAV |

---

## PyPI (Python)

PyPI's HTML search is bot-walled; this list is built from the Warehouse JSON API for known names.

### Core SDK / CLI

| Package | Version | Notes |
| --- | --- | --- |
| [`b2sdk`](https://pypi.org/project/b2sdk/) | 2.12.0 | 🏛 **Official** Backblaze B2 SDK |
| [`b2`](https://pypi.org/project/b2/) | 4.7.0 | 🏛 **Official** Backblaze B2 command-line tool |
| [`backblaze-b2`](https://pypi.org/project/backblaze-b2/) | 0.0.1 | Unofficial third-party (miki725) |
| [`backblaze`](https://pypi.org/project/backblaze/) | 0.1.1 | Wrapper, [docs](https://backblaze.readthedocs.io) |
| [`b2-storage`](https://pypi.org/project/b2-storage/) | 0.0.1 | Tiny wrapper |

### Backblaze Labs

| Package | Version | Notes |
| --- | --- | --- |
| [`jupyter-b2`](https://pypi.org/project/jupyter-b2/) | 0.0.1 | 🧪 `%b2` magic + fsspec backend for Jupyter/IPython |
| [`jupyterlab-b2`](https://pypi.org/project/jupyterlab-b2/) | 0.0.1 | 🧪 JupyterLab sidebar file browser for B2 |

### Frameworks / data tools

| Package | Version | Notes |
| --- | --- | --- |
| [`django-storages`](https://pypi.org/project/django-storages/) | 1.14.6 | 🔌 Django storage backends — **B2 supported via S3 backend**. The `b2-samples` org has [`django-storages-backblaze-b2`](https://github.com/backblaze-b2-samples/django-storages-backblaze-b2) showing this. |
| [`dlt`](https://pypi.org/project/dlt/) | 1.26.0 | 🔌 Data loading library — has a [B2 destination](https://dlthub.com/docs/dlt-ecosystem/destinations/filesystem) via filesystem destination |
| [`apache-airflow-providers-amazon`](https://pypi.org/project/apache-airflow-providers-amazon/) | 9.27.0 | 🔌 Airflow can target B2 through this provider via S3-compatible endpoints |
| [`fs-s3fs`](https://pypi.org/project/fs-s3fs/) | 1.1.1 | 🪣 PyFilesystem2 S3 driver — works with B2 via S3 API |
| [`snakemake-storage-plugin-s3`](https://pypi.org/project/snakemake-storage-plugin-s3/) | 0.3.6 | 🔌 Snakemake S3 plugin — works with B2 |

### Backup tools that support B2

| Package | Version | Notes |
| --- | --- | --- |
| [`duplicity`](https://pypi.org/project/duplicity/) | 3.0.7 | 🪣 Encrypted backup with B2 backend (`b2://...`) |
| [`borgbackup`](https://pypi.org/project/borgbackup/) | 1.4.4 | 🪣 Deduplicated/encrypted backups (works with B2 via rclone or S3 API) |
| [`bup`](https://pypi.org/project/bup/) | 0.11.9 | 🪣 (note: this PyPI name is a different `bup` CLI for cloud buckets, not the original git-bup) |

### Notable absent

The well-known **`b2blaze`** (older client) and **`b2-sdk-python`** (alternate name) are not found on PyPI under those exact names — `b2sdk` is the canonical name.

---

## crates.io (Rust)

Reported **55 total results** for "backblaze". Filtered to genuinely B2-specific entries (skipping unrelated S3-only / Reed-Solomon / unrelated `somatize-*` crates).

### Core SDKs

| Crate | Version | Downloads | Notes |
| --- | --- | --- | --- |
| [`backblaze-b2`](https://crates.io/crates/backblaze-b2) | 0.1.9-2 | 32,251 | ⭐ Most-downloaded B2 client (Darksonn) |
| [`b2_backblaze`](https://crates.io/crates/b2_backblaze) | 0.1.10 | 14,165 | Async upload client (gzbakku) |
| [`backblaze-b2-client`](https://crates.io/crates/backblaze-b2-client) | 0.1.7 | 4,709 | (SalahaldinBilal) |
| [`b2-client`](https://crates.io/crates/b2-client) | 0.1.3 | 8,455 | HTTP-client-agnostic (rjframe) |
| [`raze`](https://crates.io/crates/raze) | 0.4.1 | 15,326 | Rust-friendly API + helpers (KongouDesu) |
| [`btwo`](https://crates.io/crates/btwo) | 0.1.0 | 1,923 | Library for the B2 API |
| [`yab2`](https://crates.io/crates/yab2) | 0.1.0-alpha.3 | 4,167 | "Yet Another B2 Client" (Lantern-chat) |

### CLIs / utilities

| Crate | Version | Downloads | Notes |
| --- | --- | --- | --- |
| [`b2get`](https://crates.io/crates/b2get) | 0.2.0 | 2,848 | CLI download utility (stadiamaps) |
| [`b2creds`](https://crates.io/crates/b2creds) | 0.2.0 | 11,019 | Library for accessing B2 credentials (schultetwin1) |

### Backup / hosting / utilities that target B2

| Crate | Notes |
| --- | --- |
| [`backpak-b2`](https://crates.io/crates/backpak-b2) | B2 backend for the `backpak` backup tool |
| [`pict-rs`](https://crates.io/crates/pict-rs) | Self-hosted image hosting service (B2-capable) |
| [`crabguard`](https://crates.io/crates/crabguard) | E2E-encrypted S3 (and compatible) CLI |
| [`vivo`](https://crates.io/crates/vivo) | Restic orchestrator with B2 remote |
| [`zesty-backup`](https://crates.io/crates/zesty-backup) | Multi-provider cloud backup CLI |

### Terraform / cdktf

| Crate | Notes |
| --- | --- |
| [`terrars-backblaze-b2`](https://crates.io/crates/terrars-backblaze-b2) | Pre-generated Terrars B2 bindings (mirror of the Terraform provider) |

---

## pkg.go.dev (Go)

**~79 module hits** for "backblaze b2". Filtered to canonical, non-fork entries.

### Core SDKs (in order of community adoption)

| Module | Notes |
| --- | --- |
| [`github.com/Backblaze/blazer/b2`](https://pkg.go.dev/github.com/Backblaze/blazer/b2) | 🏛 **Official** Backblaze fork of the canonical Go client |
| [`github.com/kurin/blazer/b2`](https://pkg.go.dev/github.com/kurin/blazer/b2) | ⭐ Original author of `blazer` (used by rclone, kopia, perkeep, etc.) |
| [`gopkg.in/kothar/go-backblaze.v0`](https://pkg.go.dev/gopkg.in/kothar/go-backblaze.v0) | ⭐ Older, widely-used client |
| [`github.com/FiloSottile/b2`](https://pkg.go.dev/github.com/FiloSottile/b2) | High-quality client by Filippo Valsorda |
| [`github.com/perkeep/b2`](https://pkg.go.dev/github.com/perkeep/b2) | The Perkeep CMS client |

### Official tooling

| Module | Notes |
| --- | --- |
| [`github.com/Backblaze/terraform-provider-b2`](https://pkg.go.dev/github.com/Backblaze/terraform-provider-b2) | 🏛 **Official Terraform provider** for Backblaze B2 |

### Tools whose B2 backend lives at this path

| Module | Notes |
| --- | --- |
| [`github.com/rclone/rclone/backend/b2`](https://pkg.go.dev/github.com/rclone/rclone/backend/b2) | ⭐ rclone's first-class B2 backend |
| [`github.com/kopia/kopia/repo/blob/b2`](https://pkg.go.dev/github.com/kopia/kopia/repo/blob/b2) | ⭐ Kopia backup tool |
| [`github.com/Boostport/vault-plugin-secrets-backblazeb2`](https://pkg.go.dev/github.com/Boostport/vault-plugin-secrets-backblazeb2) | 🔌 HashiCorp Vault plugin for B2 application keys |
| [`github.com/techknowlogick/drone-b2`](https://pkg.go.dev/github.com/techknowlogick/drone-b2) | 🔌 Drone CI plugin |
| [`github.com/raniellyferreira/rotate-files`](https://pkg.go.dev/github.com/raniellyferreira/rotate-files) | File-rotation utility w/ B2 backend |
| [`github.com/jamesfcarter/b2httpfilesystem`](https://pkg.go.dev/github.com/jamesfcarter/b2httpfilesystem) | `http.FileSystem` over B2 |
| [`github.com/silocitylabs/b2backup`](https://pkg.go.dev/github.com/silocitylabs/b2backup) | Backup utility |

### Smaller / niche

`benbusby/b2`, `hbeijeman/b2`, `clgillis/b2`, `kardianos/b2`, `euantorano/b2`, `ifo/b2`, `romantomjak/b2`, `hryyan/b2` — small/personal B2 client libraries.

### Crowded `b2` namespace under abstractions

`upspin.io/cloud/storage/b2cs`, `mtgban/simplecloud`, `personalcore/storagecore/backend/b2`, `gulp79/bclone/backend/b2` etc. are abstractions where B2 is one of many backends.

---

## Cross-registry observations

1. **The Backblaze-published presence is small but well-targeted**: `b2sdk` + `b2` (Python), `Backblaze/blazer` + `Backblaze/terraform-provider-b2` (Go). No first-party npm or crate yet — both spaces are entirely community-led.
2. **`backblaze-b2` (npm) and `b2sdk` (PyPI)** are clearly the canonical clients in each ecosystem.
3. **`Backblaze/blazer` (Go)** is essentially the SDK other tools depend on — rclone, kopia, perkeep all route through it.
4. **rclone forks dominate Go search results** (~30 of 79). They're not really separate packages — they're personal forks of the rclone repo with the B2 backend module path indexed.
5. **CMS / framework adapter market is large on npm** (Strapi, Ghost, NodeBB, n8n, Node-RED, PicGo, Elog, Pikku) — most are tiny single-author shims.
6. **No crate equivalent to rclone's B2 backend** — Rust's storage tooling is much less mature for B2 specifically.
7. **Storage-abstraction packages** (`mobiletto`, SMCloudStore, mtgban/simplecloud, etc.) are the pattern most likely to add B2 support over time.

## Suggested follow-ups for the catalog

Strong candidates to seed into `labs.json` (or invite to the tier-1 tracker if upstream-only):

| Candidate | Reason |
| --- | --- |
| `Backblaze/terraform-provider-b2` | 🏛 official, big audience |
| `kurin/blazer` (or `Backblaze/blazer`) | ⭐ canonical Go SDK, depended on by rclone/kopia/perkeep |
| `b2sdk` (PyPI) | 🏛 official Python SDK, missing from current catalog |
| `b2` (PyPI / CLI) | 🏛 official CLI |
| `backblaze-b2` (npm — yakovkhalinsky) | ⭐ canonical Node.js client |
| `backblaze-b2` crate (Darksonn) | ⭐ canonical Rust client |
| `rclone` | ⭐ huge audience, deserves a card under "Backup / Sync tools" |
| `kopia` | ⭐ same, modern competitor to restic |
| `restic` | ⭐ already widely associated with B2 |
| `duplicity` (PyPI) | ⭐ classic backup tool with native B2 backend |

Most of these slot in naturally as **tier-1 tracker sub-issues** with `B2 Documentation` or `B2 Integration` labels, since the projects themselves are upstream-owned.
