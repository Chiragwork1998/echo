import { SUPPORT_EMAIL, supportUrl } from './support';

describe('support', () => {
  it('opens a blank email to the one constant, with a subject and no body', () => {
    const url = new URL(supportUrl());
    expect(url.protocol).toBe('mailto:');
    expect(decodeURIComponent(url.pathname)).toBe(SUPPORT_EMAIL);
    expect([...url.searchParams.keys()]).toEqual(['subject']);
  });
});
