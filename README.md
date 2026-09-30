# IT Passport Reviewer

Interactive, mobile-first reviewer for the ITPEC / IPA Japan IT Passport exam.
Click an answer, get an instant AI explanation, track your progress.

**Features:** click or press A/B/C/D to answer, AI explanations via Gemini, retry missed questions, view original exam page images, export/import progress JSON.
https://itpassportreviewer.vercel.app/
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
