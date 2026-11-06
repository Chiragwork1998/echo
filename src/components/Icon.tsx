import { SvgXml } from 'react-native-svg';

import { iconXml } from '@/design/generated/vectors';

export type IconName = keyof typeof iconXml;

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  return (
    <SvgXml
      xml={iconXml[name].replaceAll('currentColor', color)}
      width={size}
      height={size}
      accessible={false}
    />
  );
}
