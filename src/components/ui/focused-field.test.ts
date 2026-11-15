import { offsetToReveal } from './focused-field';

describe('offsetToReveal', () => {
  const viewport = { offset: 100, height: 200 };

  it('leaves a field already on screen with its margin', () => {
    expect(offsetToReveal({ top: 120, bottom: 170 }, viewport, 16)).toBeNull();
  });

  it('scrolls down until a field below shows with its margin', () => {
    expect(offsetToReveal({ top: 260, bottom: 310 }, viewport, 16)).toBe(126);
  });

  it('scrolls up until a field above shows with its margin', () => {
    expect(offsetToReveal({ top: 90, bottom: 140 }, viewport, 16)).toBe(74);
  });

  it('shows the top of a field taller than the screen', () => {
    expect(offsetToReveal({ top: 300, bottom: 600 }, viewport, 16)).toBe(284);
  });

  it('scrolls no higher than the top of the content', () => {
    expect(offsetToReveal({ top: 4, bottom: 54 }, { offset: 40, height: 200 }, 16)).toBe(0);
  });
});
