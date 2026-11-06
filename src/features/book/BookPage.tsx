import { type ComponentProps, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { useLayout } from '@/design/layout';

import { BookStage, type Entrance } from './BookStage';
import { Pages } from './Pages';
import { PaperProvider, usePaperLook, type Surface } from './paper';
import type { Volume } from './volumes';

/** A phone's keyboard takes about this much of the screen: 336 pt of 852. */
const KEYBOARD_SHARE = 0.395;
/** The quiet row sits this high above the keyboard, and the book keeps clear of it. */
const ROW_CLEARANCE = 16 + 44 + 8;
const MIN_HEIGHT = 230;
const TOP_GAP = 10;

export type BookFrame = { left: number; top: number; width: number; height: number };

/**
 * Where the book sits: from under the top of the screen to just above the quiet row, with the
 * keyboard's share of the screen kept free beneath. It is the same place with the keyboard up or
 * away, so the pages never move or change length when the keyboard comes. Without a keyboard that
 * space is mountains, at their fullest.
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
  onOpened?: () => void;
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
  /** Drawn over the page, in its ink: the breathing light, notes about the microphone. */
  children?: (open: boolean) => ReactNode;
};

/** The book in its place on the screen: it arrives, opens, and the open page takes the words. */
export function BookPage(props: Props) {
  const { frame, surface, volume, entrance, start, riseFrom, onOpened, children, ...page } = props;
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
        onOpened={onOpened}
      >
        {(open) => (
          <PaperProvider look={look}>
            <Pages
              {...page}
              width={frame.width}
              height={frame.height}
              look={look}
              volume={volume}
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
