// Usage (from your project root):  node add-exam.mjs exam-2026-apr.json
// Adds the exam to public/questions.json (replaces it if the same id already exists). Makes a backup first.
import fs from 'node:fs';
const file = process.argv[2];
if (!file) { console.log('Usage: node add-exam.mjs <exam.json>'); process.exit(1); }
const target = 'public/questions.json';
const exam = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = JSON.parse(fs.readFileSync(target, 'utf8'));
fs.copyFileSync(target, target + '.bak');
const i = data.exams.findIndex(e => e.id === exam.id);
if (i >= 0) data.exams[i] = exam; else data.exams.push(exam);
fs.writeFileSync(target, JSON.stringify(data));
console.log(`${i >= 0 ? 'Updated' : 'Added'} "${exam.title}" (${exam.questions.length} questions). Exams now: ${data.exams.map(e => e.id).join(', ')}`);
