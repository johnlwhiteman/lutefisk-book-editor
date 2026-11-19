// Change case, Personal Daily Goals and the author presets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeCase } from '../src/shared/textcase.js';
import { GOAL_PRESETS, personalProgress, cleanHabits, cleanPreset } from '../src/shared/goal-presets.js';

test('change case keeps the length, so formatting stays in place', () => {
  const s = 'the OLD man’s boat. it was GREAT! don\'t stop';
  assert.equal(changeCase(s, 'upper'), 'THE OLD MAN’S BOAT. IT WAS GREAT! DON\'T STOP');
  assert.equal(changeCase(s, 'lower'), 'the old man’s boat. it was great! don\'t stop');
  assert.equal(changeCase(s, 'capitalize'), 'The Old Man’s Boat. It Was Great! Don\'t Stop');
  assert.equal(changeCase(s, 'sentence'), 'The old man’s boat. It was great! Don\'t stop');
  for (const m of ['upper', 'lower', 'capitalize', 'sentence']) assert.equal(changeCase('straße ǆ 😀 ok', m).length, 'straße ǆ 😀 ok'.length, m);
});

test('author presets: six to start, notes without colons, semicolons or em dashes', () => {
  assert.equal(GOAL_PRESETS.length, 6);
  for (const p of GOAL_PRESETS) assert.doesNotMatch(p.note, /[:;—]/, p.name);
  assert.deepEqual(cleanPreset({ name: 'A', words: 10, habits: [' Walk  the dog ', ''] }).habits, ['Walk the dog']);
});

test('personal daily goals: tracked goals by progress, your own goals when ticked off', () => {
  const habits = cleanHabits([{ id: 'jog', name: ' Go for a  jog ', when: 'before' }, { id: 'read', name: 'Read' }, { name: '' }]);
  assert.deepEqual(habits.map((x) => [x.id, x.name, x.when]), [['jog', 'Go for a jog', 'before'], ['read', 'Read', '']]);
  const p = personalProgress({ words: 1000, minutes: 0 }, { words: 2000 }, habits, ['jog']);
  assert.equal(p.total, 3);
  assert.equal(p.done, 1);
  assert.equal(p.pct, (0.5 + 1 + 0) / 3);
  assert.equal(p.items[0].name, '2,000 words');
  assert.equal(personalProgress({ words: 0 }, {}, [], []).pct, 0);
  assert.equal(personalProgress({ words: 0, minutes: 90 }, { minutes: 60 }, [], []).done, 1);
});
