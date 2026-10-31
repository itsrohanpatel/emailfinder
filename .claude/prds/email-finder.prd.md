# VeriFlow — Production GitHub Pages Email Finder & Verifier

## Problem
Sales reps, recruiters, and outreach professionals need to find and verify corporate email addresses quickly without paying for expensive enterprise subscriptions. Existing open-source tools either require complex backend setups, lack reliable permutation algorithms, or break under bulk CSV loads with multi-key rate limits.

## Evidence
- Codebase audit revealed critical failure modes: infinite loops on exhausted keys, TypeScript compilation errors, call-stack overflow on large CSV uploads (>65k contacts), and race conditions in concurrent workers.
- Users want a zero-configuration, 100% client-side web application hosted freely on GitHub Pages with their own Apify API keys.

## Users
- **Primary**: Growth hackers, lead generation specialists, recruiters, and developers running single searches or bulk contact lists from CSV files.
- **Not for**: Large-scale distributed scraping operations requiring multi-node proxies and backend server fleets.

## Hypothesis
We believe a hardened, client-side React single-page application hosted on GitHub Pages with client-side Apify multi-key rotation and robust queue concurrency will allow users to verify thousands of contact emails accurately with zero server infrastructure costs.
We'll know we're right when the application builds cleanly, passes all unit tests, deploys automatically via GitHub Actions, and successfully verifies emails without crashing, leaking memory, or duplicating API requests.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Build & Typecheck | 0 errors | `npm run lint` and `npm run build` exit with code 0 |
| Automated Test Coverage | 100% pass rate on core utils | `npm test` runs vitest test suite |
| Worker Concurrency Reliability | 0 duplicate requests | Queue workers process distinct contacts atomically |
| GitHub Pages Readiness | Automated deployment | GitHub Actions CI/CD workflow `.github/workflows/deploy.yml` |
| Token / Key Safety | No leaks, persistent in browser | Stored in `localStorage` with optional `VITE_APIFY_API_KEY` fallback |

## Scope
**MVP**
- Full bug fixes for all 16 audit findings (TypeScript types, infinite retry loop, worker race conditions, stack overflow, CSV header parsing, permutation sanitization, memory leaks, timeouts).
- GitHub Pages support: `base: './'` in `vite.config.ts`, `.github/workflows/deploy.yml` CI/CD workflow.
- Key and settings persistence in browser `localStorage` + optional build-time `VITE_APIFY_API_KEY`.
- Clean dependencies in `package.json` (remove dead packages, add `vitest`).
- Unit tests for permutation engine, domain normalization, and CSV mapping.
- Comprehensive `README.md` with GitHub Pages setup instructions.
- Initialized clean git repository ready for pushing to GitHub.

**Out of scope**
- Custom backend server (Node.js/Express) — deferred to keep hosting 100% free and static on GitHub Pages.
- Hunter.io / Snov.io third-party integrations — deferred to focus on Apify reliability.

## Delivery Milestones
| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Dependencies & Types Cleanup | Remove 8 dead dependencies, add vitest, fix TS2322 type error | in-progress | `.claude/plan/email-finder-github-pages.md` |
| 2 | Permutation Engine & Sanitization | Fix name punctuation, domain `@` bugs, add unit tests | pending | `.claude/plan/email-finder-github-pages.md` |
| 3 | Queue Engine & Concurrency Hardening | Atomic queue ref, key rotation, timeout, pause/resume fixes | pending | `.claude/plan/email-finder-github-pages.md` |
| 4 | UI & Component Bug Fixes | Fix CSV header matching, stack overflow, memory leak, pagination | pending | `.claude/plan/email-finder-github-pages.md` |
| 5 | GitHub Pages Hosting & Git Setup | Git repo init, Vite base config, GitHub Actions workflow, README | pending | `.claude/plan/email-finder-github-pages.md` |

## Open Questions
- None remaining. Key architectural decisions confirmed during design interview: GitHub Pages static SPA, browser localStorage + build-time env fallback, hardened Apify engine.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Apify API rate limits | Medium | Medium | Exponential backoff retry logic already present; hardened key rotation |
| Long-running Apify synchronous calls hanging | Medium | High | Add `AbortSignal.timeout(120000)` to all fetch requests |
| Browser tab memory exhaustion on giant CSVs | Low | Medium | Streamlined state updates, revoked ObjectURLs, paginated rendering |

---
*Status: APPROVED — Ready for multi-plan implementation.*

