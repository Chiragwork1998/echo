import {
  createContext,
  useContext,
  useRef,
  type ComponentRef,
  type PropsWithChildren,
} from 'react';
import { View } from 'react-native';

/** Scrolls the page, if it must, so that a view is on the screen. TabPage gives it. */
export type BringIntoView = (node: ComponentRef<typeof View> | null) => void;

export const BringIntoViewContext = createContext<BringIntoView | null>(null);

/**
 * What arrives in a page because of something the person just did (a reading's answer) is put where
 * it can be read. The page keeps its scroll position while its content changes, and content that
 * changes above that position (a tall skeleton gone, a short notice in its place) leaves the answer
 * half above the top of the screen, or past it (the walk, v10). It is scrolled into view once, when it
 * is first laid out: key it by what it says, so that a different answer is brought again.
 */
export function ScrollIntoView({ children }: PropsWithChildren) {
  const bring = useContext(BringIntoViewContext);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const brought = useRef(false);
  return (
    // Measured, so the native view must exist: a view that only lays out its children is not drawn.
    <View
      ref={ref}
      collapsable={false}
      testID="bring-into-view"
      onLayout={() => {
        if (brought.current) return;
        brought.current = true;
        bring?.(ref.current);
      }}
    >
      {children}
    </View>
  );
}
