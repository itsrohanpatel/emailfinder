## Implementation Plan: VeriFlow Production GitHub Pages Email Finder

### Task Type
- [x] Fullstack (Frontend SPA + Build/CI Infrastructure)

### Technical Solution
1. **Clean Dependencies & Build Pipeline**:
   - Strip unused packages (`@google/genai`, `express`, `@types/express`, `dotenv`, `motion`, `autoprefixer`, `tsx`, `esbuild`) and eliminate duplicate `vite`.
   - Install and configure `vitest` with `@testing-library/react` and `jsdom` for automated unit testing.
   - Configure `vite.config.ts` with `base: './'` so static assets resolve cleanly on `https://<user>.github.io/<repo>/`.
2. **Type Safety & Key Insertion Fix**:
   - Fix TS2322 in `src/components/KeyManager.tsx` by typing `tokens: string[] = Array.from(...)`.
   - Add `localStorage` synchronization for API keys and engine settings, with fallback initialization from `import.meta.env.VITE_APIFY_API_KEY`.
3. **Queue Engine Hardening & Race Condition Elimination**:
   - Refactor `src/Store.tsx` to maintain a dedicated job queue in a ref rather than querying reactive React state.
   - Fix key exhaustion loop: synchronously update the key's status in `processingState.current.apiKeys` when `res.isExhausted` is detected so subsequent loop iterations rotate to the next active key immediately.
   - Add cancellation / run generation tracking to eliminate orphaned background workers on pause/resume/stop.
4. **Network & Timeout Resiliency**:
   - In `src/utils/apify.ts`, add `signal: AbortSignal.timeout(120000)` to all fetch requests.
   - Fix balance calculation and token validation reporting.
5. **Permutation & Normalization Hardening**:
   - In `src/utils/permutation.ts`, sanitize domain to strip email user parts (`@`), and sanitize name strings (strip punctuation, dots, apostrophes, accents).
   - Write comprehensive unit tests for permutation logic.
6. **CSV Processing & Component Fixes**:
   - In `src/components/CsvUpload.tsx`, prioritize exact column matching for names and domains, avoiding false matches on `"Company Name"` or `"LinkedIn URL"`.
   - In `src/components/SingleEmailFinder.tsx`, replace `Math.max(...contacts.map(...))` with a safe reducer to prevent call-stack overflows.
   - In `src/components/ResultsTable.tsx`, clamp active page so table never renders blank when list size changes.
   - In `src/components/Controls.tsx`, call `URL.revokeObjectURL(url)` on CSV export to prevent memory leaks, and memoize status counters.
   - In `src/App.tsx`, calculate real estimated remaining time based on processing speed.
7. **GitHub Deployment & Automation**:
   - Initialize git repo on branch `main`.
   - Create `.github/workflows/deploy.yml` for automated GitHub Actions build and deployment to GitHub Pages.
   - Add `.gitignore` ignoring node_modules, dist, zip files, and `.env.local`.
   - Rewrite `README.md` with clear installation, GitHub Pages hosting instructions, and usage guide.

### Implementation Steps
1. **Step 1: Manifest & Tooling Refactor**
   - Update `package.json` to purge dead dependencies, add `test` script (`vitest run`), and install `vitest`.
   - Update `vite.config.ts` with `base: './'`.
2. **Step 2: Core Algorithm & Test Suite**
   - Harden `src/utils/permutation.ts` with sanitization and domain parsing.
   - Create `src/utils/permutation.test.ts` to test all name and domain permutations.
3. **Step 3: Apify Client Hardening**
   - Update `src/utils/apify.ts` with timeout signal, improved error handling, and optional env fallback.
4. **Step 4: Store & Queue Concurrency Fixes**
   - Update `src/Store.tsx` with atomic queue management, key exhaustion fix, and `localStorage` persistence.
5. **Step 5: Component Hardening**
   - Fix `src/components/KeyManager.tsx` (types & localStorage sync).
   - Fix `src/components/SingleEmailFinder.tsx` (call stack overflow fix).
   - Fix `src/components/CsvUpload.tsx` (header matching fix).
   - Fix `src/components/ResultsTable.tsx` (pagination clamp fix).
   - Fix `src/components/Controls.tsx` (memory leak fix & useMemo optimization).
   - Fix `src/components/Settings.tsx` & `src/App.tsx` (accurate remaining time).
6. **Step 6: Git & CI/CD Setup**
   - Initialize git repository.
   - Create `.github/workflows/deploy.yml`.
   - Update `README.md` and `.gitignore`.
7. **Step 7: Verification & Audit**
   - Run `npm test`, `npm run lint`, and `npm run build`.
   - Verify zero warnings/errors.

### Key Files
| File | Operation | Description |
|------|-----------|-------------|
| `package.json` | Modify | Remove 8 unused deps, deduplicate vite, add vitest |
| `vite.config.ts` | Modify | Add `base: './'` for GitHub Pages compatibility |
| `src/types.ts` | Modify | Clean up unused fields and improve type contracts |
| `src/utils/permutation.ts` | Modify | Fix domain stripping, name punctuation, and sanitization |
| `src/utils/permutation.test.ts` | Create | Unit test suite for permutation and domain normalization |
| `src/utils/apify.ts` | Modify | Add request timeout, token fallback from env, and clean error parsing |
| `src/Store.tsx` | Modify | Atomic queue runner, infinite loop fix, localStorage persistence |
| `src/components/KeyManager.tsx` | Modify | Fix TS2322 type error, handle key rotation and balance refresh |
| `src/components/SingleEmailFinder.tsx` | Modify | Fix stack overflow on large arrays, clean input |
| `src/components/CsvUpload.tsx` | Modify | Fix greedy header matching bug |
| `src/components/ResultsTable.tsx` | Modify | Fix pagination bounds clamping |
| `src/components/Controls.tsx` | Modify | Fix URL memory leak and optimize re-renders |
| `src/App.tsx` | Modify | Calculate real estimated time remaining |
| `.github/workflows/deploy.yml` | Create | GitHub Actions automated deploy to GitHub Pages |
| `.gitignore` | Modify | Ignore zip files, dist, node_modules, environment secrets |
| `README.md` | Modify | Production documentation and GitHub Pages hosting instructions |

### Risks and Mitigation
| Risk | Mitigation |
|------|------------|
| GitHub Pages subpath routing breaking assets | `base: './'` ensures relative path resolution regardless of repo name |
| API tokens lost on page refresh | Synced with browser `localStorage` and clearable via UI button |
| Long running Apify calls blocking queue | `AbortSignal.timeout(120000)` enforces a 2-minute upper bound |

### SESSION_ID
- CODEX_SESSION: veriflow-gh-pages-v1
- ANTIGRAVITY_SESSION: veriflow-gh-pages-v1
