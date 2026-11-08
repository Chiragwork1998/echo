import { SESSION_ROUTE } from './sessionRoute';

describe('the daily session route', () => {
  it('leaves by the stack’s own fade, not a hard cut: it asks for no animation of its own', () => {
    expect(SESSION_ROUTE).not.toHaveProperty('animation');
    expect(SESSION_ROUTE).not.toHaveProperty('animationDuration');
  });

  it('still cannot be swiped away, and stays transparent over the photograph', () => {
    expect(SESSION_ROUTE.gestureEnabled).toBe(false);
    expect(SESSION_ROUTE.contentStyle.backgroundColor).toBe('transparent');
  });
});
