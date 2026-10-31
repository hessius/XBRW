/* global document, window */
import { createRotation } from './rotation.mjs';

const region = document.querySelector('[data-carousel]');

if (region) {
  const slides = Array.from(region.querySelectorAll('[data-slide]'));
  const controls = region.querySelector('[data-controls]');
  const toggle = controls.querySelector('[data-toggle]');
  const position = controls.querySelector('[data-position]');
  const announcement = region.querySelector('[data-announcement]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  for (const slide of slides) {
    const image = slide.querySelector('img');
    const error = slide.querySelector('.image-error');
    image.addEventListener('error', () => { error.hidden = false; });
    if (image.hasAttribute('src') && image.complete && !image.naturalWidth) {
      error.hidden = false;
    }
  }

  const rotation = createRotation({
    count: slides.length,
    reduced: reduced.matches,
    visible: !document.hidden,
    onSlide(index, manual) {
      for (const [slideIndex, slide] of slides.entries()) {
        slide.classList.toggle('is-active', slideIndex === index);
        slide.setAttribute('aria-hidden', String(slideIndex !== index));
      }
      const slide = slides[index];
      const image = slide.querySelector('img');
      if (image.dataset.src) {
        image.src = image.dataset.src;
        delete image.dataset.src;
      }
      position.textContent = `${index + 1} / ${slides.length}`;
      if (manual) {
        announcement.textContent = `${slide.querySelector('h2').textContent} (${index + 1} of ${slides.length})`;
      } else {
        announcement.textContent = '';
      }
    },
    onState({ paused, reduced }) {
      toggle.hidden = reduced;
      toggle.textContent = paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-label', paused
        ? 'Start automatic screenshot rotation'
        : 'Pause automatic screenshot rotation');
    },
  });

  region.setAttribute('aria-roledescription', 'carousel');
  controls.querySelector('[data-previous]').addEventListener('click', () => rotation.step(-1));
  controls.querySelector('[data-next]').addEventListener('click', () => rotation.step(1));
  toggle.addEventListener('click', () => rotation.toggle());
  region.addEventListener('mouseenter', () => rotation.hover(true));
  region.addEventListener('mouseleave', () => rotation.hover(false));
  region.addEventListener('focusin', (event) => {
    // Pointer focus must not turn the first Pause click into Play.
    if (event.target.matches(':focus-visible')) rotation.pause();
  });
  reduced.addEventListener('change', (event) => rotation.reduce(event.matches));
  document.addEventListener('visibilitychange', () => rotation.visibility(!document.hidden));
  controls.hidden = false;
}
