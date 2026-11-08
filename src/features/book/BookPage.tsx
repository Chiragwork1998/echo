import { type ComponentProps, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { useLayout } from '@/design/layout';

import { BookStage, type Entrance } from './BookStage';
import type { Inscribing } from './CoverArt';
import { ROW_CLEARANCE } from './bookPlace';
import { Pages } from './Pages';
import type { Ritual } from './ritual';
import type { ClosingState } from './useBookClosing';
import { PaperProvider, usePaperLook, type Surface } from './paper';
import type { Volume } from './volumes';

/** A phone's keyboard takes about this much of the screen: 336 pt of 852. */
const KEYBOARD_SHARE = 0.395;
const MIN_HEIGHT = 230;
const TOP_GAP = 10;

export type BookFrame = { left: number; top: number; width: number; height: number };

/**
 * The book's place clear of the keyboard: from under the top of the screen to just above the quiet
 * row, with the keyboard's share of the screen kept free beneath. The pages keep this size with the
 * keyboard up or away. The daily book rests lower, in the middle of the screen, and rises to this
 * place when the keyboard comes (D-010, bookPlace.ts).
 */
export function useBookFrame(insetTop: number, headerHeight = 0): BookFrame {
  const { width: screen, height } = useWindowDimensions();
  const { width, gutter } = useLayout();
  const top = insetTop + headerHeight + TOP_GAP;
  const bottom = height - height * KEYBOARD_SHARE - ROW_CLEARANCE;
  const bookWidth = width - gutter * 2;
  return {
    left: (screen - bookWidth) / 2,
    top,
    width: bookWidth,
    height: Math.max(MIN_HEIGHT, bottom - top),
  };
}

type PagesProps = ComponentProps<typeof Pages>;

type Props = {
  frame: BookFrame;
  surface: Surface;
  volume: Volume;
  entrance: Entrance;
  start: boolean;
  riseFrom: number;
  ritual: Ritual;
  /** A tap said enough: the opening finishes at once. */
  hurry: boolean;
  /** How many echoes the book holds: a count, so that a book with more in it riffles a few leaves. */
  echoes?: number;
  /** The entry is being kept: the cover is made ready, unseen, for the closing. */
  preparing?: boolean;
  /** The book is shutting (./useBookClosing). */
  closing?: ClosingState | null;
  /**
   * Whose book it is, on the cover and in the page's head. `arrives` says how the head's name comes as
   * the book opens: wiped in for the first few openings after it was written, then simply faded in.
   */
  owner?: { name: string; arrives: 'wipe' | 'fade' } | null;
  /** The closed book being asked whose it is, and answering. */
  inscribing?: Inscribing | null;
  onStamped?: () => void;
  onOpened?: () => void;
  /** The closing: the cover has landed, and the book has sunk far enough for the next screen. */
  onLanded?: () => void;
  onGone?: () => void;
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  value: string;
  onChangeText: (text: string) => void;
  /** The field accepts words (once the cover is open). */
  editable: boolean;
  /** Touches reach the words: Write. Otherwise a tap on the page goes to `onTap`: Speak. */
  interactive: boolean;
  label: string;
  placeholder?: string;
  onFocus: () => void;
  onBlur: () => void;
  onTap: () => void;
  lead?: PagesProps['lead'];
  /** The words are kept but not shown (D-008). */
  concealed?: boolean;
  /** A note is drawn over the page: the words are a faint trace until it goes. */
  dimmed?: boolean;
  /** Counts the times spoken words have landed. */
  arrival?: number;
  /** Drawn over the page, in its ink: the breathing light, notes about the microphone. */
  children?: (open: boolean) => ReactNode;
};

/** The book in its place on the screen: it arrives, opens, and the open page takes the words. */
export function BookPage(props: Props) {
  const {
    frame,
    surface,
    volume,
    entrance,
    start,
    riseFrom,
    ritual,
    hurry,
    echoes,
    preparing,
    closing = null,
    owner = null,
    inscribing = null,
    onStamped,
    onOpened,
    onLanded,
    onGone,
    children,
    ...page
  } = props;
  const look = usePaperLook(surface);
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.place,
        { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
      ]}
    >
      <BookStage
        volume={volume}
        surface={surface}
        width={frame.width}
        height={frame.height}
        entrance={entrance}
        start={start}
        riseFrom={riseFrom}
        ritual={ritual}
        hurry={hurry}
        echoes={echoes}
        preparing={preparing}
        closing={closing}
        name={owner?.name ?? null}
        inscribing={inscribing}
        onStamped={onStamped}
        onOpened={onOpened}
        onLanded={onLanded}
        onGone={onGone}
      >
        {(open, headed) => (
          <PaperProvider look={look}>
            <Pages
              {...page}
              width={frame.width}
              height={frame.height}
              look={look}
              volume={volume}
              closing={closing}
              owner={owner ? { ...owner, headed } : null}
              stack={{ echoes: echoes ?? 0, room: frame.left, keeping: preparing }}
              hidden={!open}
              editable={page.editable && open}
              interactive={page.interactive && open}
            >
              {children?.(open)}
            </Pages>
          </PaperProvider>
        )}
      </BookStage>
    </View>
  );
}

const styles = StyleSheet.create({
  place: { position: 'absolute' },
});
