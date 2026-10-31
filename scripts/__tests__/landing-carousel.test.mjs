import assert from 'node:assert/strict';
import test from 'node:test';
import { createRotation } from '../../public/landing/rotation.mjs';

function fixture(t, reduced = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changes = [];
  const rotation = createRotation({
    count: 6,
    reduced,
    visible: true,
    onSlide: (index, manual) => changes.push([index, manual]),
    onState: () => {},
  });
  return { rotation, changes, tick: (milliseconds) => t.mock.timers.tick(milliseconds) };
}

test('rotates every eight seconds and wraps all six slides', (t) => {
  const { changes, tick } = fixture(t);
  assert.deepEqual(changes, [[0, false]]);
  tick(7999);
  assert.deepEqual(changes, [[0, false]]);
  tick(1);
  assert.deepEqual(changes.at(-1), [1, false]);
  for (let i = 0; i < 5; i++) tick(8000);
  assert.deepEqual(changes, [
    [0, false], [1, false], [2, false], [3, false],
    [4, false], [5, false], [0, false],
  ]);
});

test('manual navigation wraps backwards and pauses until deliberate play', (t) => {
  const { rotation, changes, tick } = fixture(t);
  rotation.step(-1);
  assert.deepEqual(changes.at(-1), [5, true]);
  tick(16000);
  assert.equal(changes.length, 2);
  rotation.toggle();
  tick(8000);
  assert.deepEqual(changes.at(-1), [0, false]);
});

test('hover pauses temporarily without clearing an explicit pause', (t) => {
  const { rotation, changes, tick } = fixture(t);
  rotation.hover(true);
  tick(16000);
  assert.equal(changes.length, 1);
  rotation.hover(false);
  tick(8000);
  assert.deepEqual(changes.at(-1), [1, false]);
  rotation.pause();
  rotation.hover(true);
  rotation.hover(false);
  tick(16000);
  assert.equal(changes.length, 2);
});

test('reduced motion disables rotation but keeps manual navigation', (t) => {
  const { rotation, changes, tick } = fixture(t, true);
  rotation.toggle();
  tick(16000);
  assert.equal(changes.length, 1);
  rotation.step(1);
  assert.deepEqual(changes.at(-1), [1, true]);
  rotation.reduce(false);
  tick(8000);
  assert.equal(changes.length, 2);
  rotation.toggle();
  tick(8000);
  assert.deepEqual(changes.at(-1), [2, false]);
  rotation.reduce(true);
  tick(8000);
  assert.equal(changes.length, 3);
});

test('hidden tabs suspend without catch-up or resetting explicit pause', (t) => {
  const { rotation, changes, tick } = fixture(t);
  rotation.visibility(false);
  tick(16000);
  assert.equal(changes.length, 1);
  rotation.visibility(true);
  tick(8000);
  assert.deepEqual(changes.at(-1), [1, false]);
  rotation.pause();
  rotation.visibility(false);
  rotation.visibility(true);
  tick(16000);
  assert.equal(changes.length, 2);
});

test('DOM adapter clears a manual announcement when autoplay advances', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const element = (children = {}) => Object.assign(new EventTarget(), {
    querySelector: (selector) => children[selector],
    setAttribute: () => {},
  });
  const slides = ['First caption', 'Second caption', 'Third caption'].map((caption) => {
    const image = Object.assign(element(), {
      dataset: {},
      hasAttribute: () => false,
    });
    return Object.assign(element({
      img: image,
      h2: { textContent: caption },
      '.image-error': { hidden: true },
    }), { classList: { toggle: () => {} } });
  });
  const next = element();
  const toggle = element();
  const position = {};
  const announcement = { textContent: '' };
  const controls = element({
    '[data-previous]': element(),
    '[data-next]': next,
    '[data-toggle]': toggle,
    '[data-position]': position,
  });
  const region = Object.assign(element({
    '[data-controls]': controls,
    '[data-announcement]': announcement,
  }), { querySelectorAll: () => slides });
  const media = Object.assign(new EventTarget(), { matches: false });
  for (const [key, value] of Object.entries({
    document: Object.assign(element({ '[data-carousel]': region }), { hidden: false }),
    window: { matchMedia: () => media },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
    globalThis[key] = value;
  }

  await import('../../public/landing/carousel.mjs');
  next.dispatchEvent(new Event('click'));
  assert.equal(position.textContent, '2 / 3');
  assert.equal(announcement.textContent, 'Second caption (2 of 3)');
  toggle.dispatchEvent(new Event('click'));
  t.mock.timers.tick(8000);
  assert.equal(position.textContent, '3 / 3');
  assert.equal(announcement.textContent, '');
});
