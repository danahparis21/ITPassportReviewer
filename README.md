# IT Passport Reviewer

Interactive, mobile-first reviewer for the ITPEC / IPA Japan IT Passport exam.
Click an answer, get an instant AI explanation, track your progress.

**Features:** click or press A/B/C/D to answer, AI explanations via Gemini, retry missed questions, view original exam page images, export/import progress JSON.

---

## Deploy to Vercel

### 1. Get a free Gemini API key
Go to https://aistudio.google.com/apikey and click **Create API key**.

### 2. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/itpassport-reviewer.git
git branch -M main
git push -u origin main
```

### 3. Import to Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repo — **leave all build settings blank**
3. Add an **Environment Variable**: `GEMINI_API_KEY` = your key
4. Click **Deploy** — live in ~30 seconds at `your-project.vercel.app`

---

## Local development (with AI explanations)
```bash
npm install -g vercel
vercel dev          # runs at http://localhost:3000
```
Create a `.env.local` file:
```
GEMINI_API_KEY=your_key_here
```
Without `vercel dev`, the `/api/explain` endpoint returns 404 — the app still shows the correct answer text as a fallback.

---

## Add another exam
1. Append an object to `public/questions.json` → `exams[]` array (same shape)
2. Add page images to `public/pages/` as `p-XX.jpg`
3. Push — Vercel redeploys automatically

## Sync between devices
**Export progress** on one device → **Import progress** on another. Data lives in localStorage.

## Optional env vars
| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | required | Google AI Studio key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Any Gemini model name |
