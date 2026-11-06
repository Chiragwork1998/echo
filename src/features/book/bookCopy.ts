// Working text for the book. The copy deck has none of it, so it is NOT locked copy: it needs owner
// approval before moving to src/content. Volume names and subtitles are in ./volumes.ts.
export const bookCopy = {
  hint: 'Swipe to look. Tap a volume to open it.',
  open: 'Opens the book so you can write or speak',
  volume: (title: string, index: number, of: number) => `${title}, volume ${index} of ${of}`,
  coverKicker: (index: number) => `ECHO VOLUMES  /  0${index}`,
  page: {
    previous: 'Previous page',
    next: 'Next page',
    of: (page: number, pages: number) => `Page ${page} of ${pages}`,
  },
  another: 'Another volume',
} as const;
