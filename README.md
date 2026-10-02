# STAX QR

[![Namespace](https://img.shields.io/badge/namespace-STAX--Systems-1B4F72)](https://alanwoodyard.com)
[![Stack](https://img.shields.io/badge/stack-Zero--dependency_SVG_QR-1A5276)](https://alanwoodyard.com)
[![IP](https://img.shields.io/badge/IP-proprietary_%7C_paid_SVG_export-7B241C)](https://alanwoodyard.com)

[Alan Woodyard](https://alanwoodyard.com)

## System Role

STAX QR is an air-gapped, zero-telemetry bulk SVG QR code generator. It encodes a batch of payloads into SVG files on the operator's machine. Nothing in the harvested tree phones home.

The checkout directory is still `stax-product-bulk-qr-code-generator`. The GitHub repository under `STAX-Systems` is `stax-qr` (renamed from `stax-product-bulk-qr-code-generator`, and no longer only the personal `woodyardae` remote). Fleet entity id: `stax-qr`.

Registered tagline: standalone zero-dependency batch QR generator consumed by the Sweatshop storefront. Harvest maturity: working core (326 implementation LOC, 278 markup LOC, no test files harvested).

## Audited Architecture & Runtime

The audit recorded no third-party imports and no `package.json` dependency list in this checkout. Runtime dependencies: none.

Files:

- `build_fastlane.py` — fastlane compilation entry (`python __main__`)
- `index.html`, `app.js`, `style.css` — interactive row grid, validation, QR generation, branding, and export interface
- `jszip.min.js` / `jszip.LICENSE.markdown` — locally bundled ZIP generation library and license
- `assets/` — generator assets
- `README.md` — this document

Catalog execution stack: browser utility using Web Crypto and HTML5 Canvas. Browser libraries are vendored and do not require network access at runtime. JSZip 3.10.1 is bundled for client-side PNG/SVG ZIP exports; its MIT license is included in `jszip.LICENSE.markdown`. The Sweatshop storefront consumes this utility as a decoupled browser tool (`consumes_utility`, client-side). Generation for the fastlane package is the Python build script, still with no harvested third-party imports.

License posture in the fleet catalog: proprietary. The web tool is free to run. Paid SVG export is the commercial edge.

## CLI / API Surface

```text
python build_fastlane.py
```

No HTTP routes, no clap CLI, and no JSON-RPC methods were harvested. The operator surface is the browser utility plus this build script. There is no account, no analytics beacon, and no telemetry method in the harvested interface list.

## Operational Boundaries

Air gap: payloads and SVG output stay in the browser profile or the local build directory. Zero telemetry means this package does not declare a collector, a webhook, or a phone-home URL.

Proprietary boundary: the generator may be used as the free web tool. Bulk SVG export is the paid path named in the fleet license string. The Sweatshop may embed the utility. It does not absorb this repository's license. Do not add a runtime dependency that would force a network fetch at encode time.
