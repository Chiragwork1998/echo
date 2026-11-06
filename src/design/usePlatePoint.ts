import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';

const REFERENCE = { width: 393, height: 852 };

/**
 * Plates draw with cover, so scenery moves as the viewport changes. Converts a point measured on the
 * 393 x 852 reference into the matching on-screen point, keeping a control on its rock or river bend
 * on every device.
 */
export function usePlatePoint() {
  const { width, height } = useWindowDimensions();
  const scale = Math.max(width / REFERENCE.width, height / REFERENCE.height);
  const offsetX = (width - REFERENCE.width * scale) / 2;
  const offsetY = (height - REFERENCE.height * scale) / 2;

  return useCallback(
    (x: number, y: number) => ({ x: offsetX + x * scale, y: offsetY + y * scale, scale }),
    [offsetX, offsetY, scale],
  );
}
