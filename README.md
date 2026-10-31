# VeriFlow — Corporate Email Finder & Verifier

[![Deploy to GitHub Pages](https://github.com/actions/starter-workflows/actions/workflows/pages.yml/badge.svg)](https://github.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-38bdf8.svg)](https://tailwindcss.com/)

A fast, production-ready corporate email finder and deliverability verification platform designed to run 100% client-side. Hosted freely on **GitHub Pages** with zero backend infrastructure costs.

---

## Features

- **🔍 Single Email Finder**: Instant lookups by First Name, Last Name, and Domain/Website. Tests 16 standard business email permutation patterns.
- **📂 Bulk CSV Processing**: Drag and drop contact lists. Auto-detects column headers (`Name`, `First Name`, `Last Name`, `Domain`, `Website`, `Email`).
- **🔑 Apify Multi-Key Rotation**: Add multiple Apify API tokens. The engine automatically rotates keys when rate limits or credit quotas are reached.
- **⚡ Atomic Concurrency Queue**: Run 1 to 10 parallel queue workers with customizable per-request delays.
- **💾 LocalStorage Persistence**: API keys and engine preferences persist in your browser across sessions.
- **📊 Real-Time Progress & Search**: Filter results by status (`FOUND`, `NOT FOUND`, `ERROR`, `PENDING`), search through contacts, and track live estimated remaining completion time.
- **📥 One-Click CSV Export**: Export all processed contacts with original fields intact, or download only verified deliverable emails.
- **🛡️ 100% Client-Side**: No middleman server, no proxy capturing your leads. All requests go directly from your browser to Apify's API.

---

## Quick Start (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- An [Apify Account](https://apify.com/) and API token (free tier includes monthly credits)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

### Run Tests and Build

```bash
# Run unit test suite
npm test

# Type check
npm run lint

# Compile production bundle
npm run build
```

---

## Hosting on GitHub Pages (Step-by-Step)

This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys the app to GitHub Pages on every push to `main`.

### Step 1: Create a GitHub Repository
1. Go to [GitHub New Repository](https://github.com/new).
2. Name your repository (e.g. `email-finder` or `veriflow`).
3. Leave it Public or Private.

### Step 2: Push Code to GitHub

```bash
git add .
git commit -m "feat: initial release of VeriFlow email finder"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY_NAME>.git
git push -u origin main
```

### Step 3: Enable GitHub Pages with GitHub Actions
1. Open your repository on GitHub.
2. Go to **Settings** > **Pages** (in the left sidebar).
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. That's it! GitHub will automatically trigger the deploy workflow. Once completed, your app will be live at:
   `https://<YOUR_USERNAME>.github.io/<YOUR_REPOSITORY_NAME>/`

---

## How It Works

1. **Permutation Generation**: Normalizes the input website (e.g., `https://www.apple.com/iphone` &rarr; `apple.com`), strips honorifics and non-alphanumeric characters, and generates standard permutations:
   - `first@domain`
   - `first.last@domain`
   - `firstlast@domain`
   - `f.last@domain`
   - `flast@domain`
   - `first.l@domain`
   - `last.first@domain`
   - `last@domain`
   - ...and 8 additional variations.
2. **Apify Actor Verification**: Passes candidate permutations to Apify Actor `j4YDbwiXnPFzYeF5w` (`run-sync-get-dataset-items`).
3. **Validation Filter**: Looks for deliverable status. As soon as a valid address is confirmed, it is marked as `FOUND`.

---

## License

MIT License. Open source and free for personal and commercial use.
