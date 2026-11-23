// Позы тренера для виджета Telegram в Lev Pro Max: значения window.__trainer.keys(), снятые scene-shoot, → voice-bot/trainer_keys.json.
// Съёмка и запуск: README, раздел «Тренер». node tools/trainer-keys.mjs [frames.json] [куда]
import { readFileSync, writeFileSync } from 'node:fs';

const [src = 'test-out/trainer-keys/raw/keys/frames.json', out = '../voice-bot/trainer_keys.json'] = process.argv.slice(2);
const list = JSON.parse(readFileSync(src, 'utf8')).rows.map((r) => JSON.parse(r.read ?? 'null'));
const bad = list.findIndex((e) => !e?.frames?.length || e.frames.some((f) => f.length !== e.frames[0].length));
if (bad >= 0) throw new Error(`поз нет или они разной длины у страницы ${bad + 1}: открывалась ли она с ?debug`);
writeFileSync(out, JSON.stringify(list));
console.log(list.map((e) => `${e.id}: ${e.frames.length} поз, ${e.frames[0].length} точек`).join('\n'));
