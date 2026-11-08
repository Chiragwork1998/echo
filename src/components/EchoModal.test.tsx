import { render } from '@testing-library/react-native';
import { useLayoutEffect } from 'react';

import { openOwnWindow, ownWindowOpen } from '@/state/ownWindows';

import { EchoModal } from './EchoModal';

/** Reads the count in the commit's layout phase, the last moment before native code takes over. */
function Probe({ seen }: { seen: boolean[] }) {
  useLayoutEffect(() => {
    seen.push(ownWindowOpen());
  });
  return null;
}

describe('EchoModal', () => {
  it('counts as one of ECHO’s own windows only while it is visible', async () => {
    const view = await render(<EchoModal transparent visible={false} />);
    expect(ownWindowOpen()).toBe(false);
    await view.rerender(<EchoModal transparent visible />);
    expect(ownWindowOpen()).toBe(true);
    await view.rerender(<EchoModal transparent visible={false} />);
    expect(ownWindowOpen()).toBe(false);
  });

  it('is counted within the commit, before Android can report the focus it takes', async () => {
    const seen: boolean[] = [];
    await render(
      <>
        <EchoModal transparent visible />
        <Probe seen={seen} />
      </>,
    );
    expect(seen).toEqual([true]);
  });

  it('is visible unless told otherwise, as a Modal is', async () => {
    await render(<EchoModal transparent />);
    expect(ownWindowOpen()).toBe(true);
  });

  it('lets go when it unmounts', async () => {
    const view = await render(<EchoModal transparent visible />);
    await view.unmount();
    expect(ownWindowOpen()).toBe(false);
  });
});

describe('ownWindows', () => {
  it('stays open until every window has closed, and counts each close once', () => {
    const sheet = openOwnWindow();
    const dialog = openOwnWindow();
    sheet();
    sheet();
    expect(ownWindowOpen()).toBe(true);
    dialog();
    expect(ownWindowOpen()).toBe(false);
  });
});
