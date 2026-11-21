# Type Racer QA

## Test plan

| Priority | Scope | Method |
|---|---|---|
| P0 | Start a run, difficulty word rules, typing, lane movement, edge crash, API fallback | Automated on every change |
| P1 | Coins and scoring, speed progression, replay, pointer selection, rendering without exceptions | Automated on every change |
| P2 | Pixel appearance, animation timing, scaling, browser and zoom differences | Manual before release |

Release exit criteria: all automated checks pass, every manual browser-matrix cell passes, the mockup comparison has no material layout difference, and there are no open P0 or P1 defects.

## Automated checks

Run from the project directory:

```sh
node --test tests/type-racer.test.mjs
```

The suite covers the self-contained deployment contract, JavaScript syntax, API success and failure, offline word fixtures, all difficulty length rules, distinct initials, recent-word history, typing success and failure, lane movement, edge crashes, scoring, coin trails, speed progression, keyboard and pointer selection, and rendering safety.

## Manual browser matrix

Test the latest stable desktop versions before release:

| Browser | Start/replay | Typing/lane change | API and offline fallback | Canvas scaling | Crash animation |
|---|---|---|---|---|---|
| Chrome | Pending | Pending | Pending | Pending | Pending |
| Edge | Pending | Pending | Pending | Pending | Pending |
| Firefox | Pending | Pending | Pending | Pending | Pending |
| Safari | Pending | Pending | Pending | Pending | Pending |

Also verify at 720p and 1080p window heights, browser zoom at 80%, 100%, and 125%, a disconnected network, and keyboard layouts that still emit Latin A-Z keys.

## Release-readiness audit

Status: **Amber — functionally testable, browser evidence incomplete.**

### Passed

- Core gameplay and boundary rules have automated coverage.
- API failures fall back to built-in word pools and do not block play.
- No runtime libraries, build step, external images, storage, or backend are required.
- The canvas keeps its 280×540 logical size and 2× backing resolution.

### Release blockers

- Complete and record the manual browser matrix.
- Compare the rendered game with the supplied SVG at common desktop heights.
- Confirm the deployed host permits requests to `api.datamuse.com` under its Content Security Policy.

### Accepted risks

- Automated tests use a canvas stub, so they validate behavior and drawing calls but not final pixels.
- External dictionary content can change independently of the game.
- Older browsers without `AbortSignal.timeout` fall back to built-in words instead of using the API.
