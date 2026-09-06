# Pars Zargar admin documentation

The API, the reference implementation and the documentation are maintained
together in this repository. Three documents, in reading order:

| Document                                                           | What it is                                                                                                                                                                    | Audience                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [`PARSZARGAR-ADMIN-API-PLAN.md`](./PARSZARGAR-ADMIN-API-PLAN.md)   | The API specification: conventions, cross-cutting platform work, a per-page endpoint spec (~180 endpoints), the new data model, a 9-phase delivery plan, and the decision log | backend                   |
| [`ADMIN-PANEL-PARITY-PLAN.md`](./ADMIN-PANEL-PARITY-PLAN.md)       | How `goldex-admin-panel` reaches parity with `ui-parszargar` in styles and features, and how it plus Swagger become the working documentation                                 | frontend, both panels     |
| [`UI-PARSZARGAR-API-CONTRACT.md`](./UI-PARSZARGAR-API-CONTRACT.md) | Per-screen endpoint index and client conventions for the `ui-parszargar` panel                                                                                                | frontend, `ui-parszargar` |

## Where to look up an endpoint

1. **`goldex-admin-panel`** — the reference implementation. Every endpoint is
   consumed there first, so there is a working call site in the real envelope,
   with real errors and RTL Persian, before anyone else writes one.
   `goldex-admin-panel/API_GAP_ANALYSIS.md` maps backend endpoints to the code
   that calls them.
2. **Swagger** — `/swagger`, basic-auth protected. Request schemas are good;
   response schemas are being backfilled during Phase 0
   (`PARSZARGAR-ADMIN-API-PLAN.md` §4.8). Until an endpoint has one, the panel's
   call site is the more reliable source.
3. **`UI-PARSZARGAR-API-CONTRACT.md`** — which endpoint belongs to which screen.

## Settled decisions

Recorded in full in `PARSZARGAR-ADMIN-API-PLAN.md` §9; the load-bearing ones:

- **The backend works in rial, and the admin panel now displays rial too.** No
  balance migration and no unit conversion anywhere in the backend. The panel
  used to render toman at the boundary; `goldex-admin-panel/src/lib/money.ts`
  still owns the unit decision but no longer rescales, so an operator reads and
  types the same rial figure the API carries. §3.1–3.2 describe the earlier
  toman convention.
- **EM is the existing rial P2P settlement desk**, so its screens are a
  projection over `p2p_*` rather than a second money path. §5.17.
- **Ticker instruments are symbols**, not a mapping table. §4.5.
- **Warehouse packages are `PacketEntity`.** §5.20.
- **Fixed roles:** identity frozen, configuration and permissions editable
  except for the root role. §5.7.
- **Monitoring** reads the standalone `monitor` app. §5.4.
- **Reports:** super admin sees all, everyone else sees their own. §5.23.
