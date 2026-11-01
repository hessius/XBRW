export function createRotation({ count, reduced, visible, onSlide, onState }) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Invalid slide count');

  let index = 0;
  let paused = reduced;
  let hovered = false;
  let timer;

  function move(delta, manual) {
    index = (index + delta + count) % count;
    onSlide(index, manual);
  }

  function schedule() {
    clearTimeout(timer);
    onState({ paused, reduced });
    if (count > 1 && !paused && !hovered && visible && !reduced) {
      timer = setTimeout(() => {
        move(1, false);
        schedule();
      }, 8000);
    }
  }

  onSlide(0, false);
  schedule();

  return {
    step(delta) {
      paused = true;
      move(delta, true);
      schedule();
    },
    pause() {
      paused = true;
      schedule();
    },
    toggle() {
      paused = !paused;
      schedule();
    },
    hover(value) {
      hovered = value;
      schedule();
    },
    visibility(value) {
      visible = value;
      schedule();
    },
    reduce(value) {
      reduced = value;
      paused = true;
      schedule();
    },
  };
}
