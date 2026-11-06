import { useCallback, useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { SafeAreaFrameContext } from 'react-native-safe-area-context';

const REFERENCE = { width: 393, height: 852 };

/** The full-screen size a plate fills. Use it to size anything drawn over the scenery. */
export function usePlateFrame() {
  const window = useWindowDimensions();
  return useContext(SafeAreaFrameContext) ?? window;
}

/**
 * Plates draw with cover, so scenery moves as the viewport changes. Converts a point measured on the
 * 393 x 852 reference into the matching on-screen point, keeping a control on its rock or river bend
 * on every device. Uses the full-screen frame the plate actually fills: on Android the window size
 * leaves out the system bars, which would pin everything too high.
 */
export function usePlatePoint() {
  const { width, height } = usePlateFrame();
  const scale = Math.max(width / REFERENCE.width, height / REFERENCE.height);
  const offsetX = (width - REFERENCE.width * scale) / 2;
  const offsetY = (height - REFERENCE.height * scale) / 2;

  return useCallback(
    (x: number, y: number) => ({ x: offsetX + x * scale, y: offsetY + y * scale, scale }),
    [offsetX, offsetY, scale],
  );
}
