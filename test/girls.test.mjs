// node --test test/: тексты девушек — у каждой реплики 1–3 ответа, предлоги не висят (неразрывный пробел).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Girls, GIRLS, typo } from '../src/girls.js';

test('typo: неразрывный пробел после предлогов и перед тире', () => {
  assert.equal(typo('Я на корте и в клубе — до вечера'), 'Я на корте и в клубе — до вечера');
  assert.equal(typo('Ладно же'), 'Ладно же');
});

test('у каждой реплики 1–3 ответа, тексты без висящих предлогов', () => { // обычный пробел, не \s: \s в JS ловит и неразрывный
  const G = Object.create(Girls.prototype);
  G.mem = {};
  G.girls = GIRLS.map((c, i) => ({ c, i, mem: { met: false, talks: 0, mood: 0, coffee: 0, stood: false, played: 0, won: 0, lost: 0, last: null } }));
  for (const g of G.girls) for (const met of [false, true]) for (const name of ['hello', 'meet', 'praise', 'joke', 'hub', 'play', 'coffee', 'later', 'cafe', 'cafe2', 'cafe3', 'cafe4']) {
    g.mem.met = met;
    const n = G.node(g, name, { asked: {} });
    assert.ok(n.say.length > 3, `${g.c.id}/${name}: реплика`);
    assert.ok(n.opts.length >= 1 && n.opts.length <= 3, `${g.c.id}/${name}: ${n.opts.length} ответов`);
    for (const t of [n.say, ...n.opts.map((o) => o[0])]) assert.doesNotMatch(typo(t), /(^| )(в|и|на|не|с|к|у|а|о|по|за|до|из|от) /i, `${g.c.id}/${name}: висит предлог в «${t}»`);
  }
});
