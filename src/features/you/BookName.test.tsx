// The name on the book, in You: what the row says, and writing, changing and removing it. Invented
// names only.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { bookCopy } from '@/features/book/bookCopy';
import { resetBookOwner, useBookOwner } from '@/features/book/owner';
import type { OwnerRecord } from '@/features/book/ownerStore';
import { clearDialogs } from '@/features/tab-pages/Dialog';
import { chooseInDialog, openDialog, renderWithDialogs } from '@/testing/dialogs';

import { BookName } from './BookName';
import { youCopy } from './youCopy';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
let mockRecord: OwnerRecord = { v: 1, name: null, asked: true, namedOpens: 0 };
jest.mock('@/features/book/ownerStore', () => ({
  loadOwner: jest.fn(async () => ({ ok: true, value: mockRecord })),
  saveOwner: jest.fn(async (record: OwnerRecord) => {
    mockRecord = record;
    return { ok: true, value: null };
  }),
}));

const NAME = 'Isolde Penhallow';

beforeEach(() => {
  mockRecord = { v: 1, name: null, asked: true, namedOpens: 0 };
  resetBookOwner();
  clearDialogs();
});
afterEach(() => resetBookOwner());

const row = () => screen.getByRole('button', { name: new RegExp(`^${youCopy.bookName}`) });
const settle = () => act(async () => undefined);

describe('the name on your book', () => {
  it('says when none is written', async () => {
    await renderWithDialogs(<BookName />);
    await settle();
    expect(row().props.accessibilityLabel).toBe(`${youCopy.bookName}. ${youCopy.bookNameNone}`);
  });

  it('says the name when there is one', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 3 };
    await renderWithDialogs(<BookName />);
    await settle();
    expect(row().props.accessibilityLabel).toBe(`${youCopy.bookName}. ${NAME}`);
  });

  it('writes a name from its sheet, cleaned, and keeps it sealed', async () => {
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    expect(screen.getByText(bookCopy.name.line)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('book-name-sheet-field'), `  ${NAME}  `);
    await fireEvent.press(screen.getByRole('button', { name: bookCopy.name.write }));
    await settle();
    expect(mockRecord).toMatchObject({ name: NAME, asked: true });
    await waitFor(() =>
      expect(row().props.accessibilityLabel).toBe(`${youCopy.bookName}. ${NAME}`),
    );
  });

  it('will not write nothing, or the same name again', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 3 };
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    const write = () => screen.getByRole('button', { name: bookCopy.name.write });
    expect(write().props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('book-name-sheet-field'), '   ');
    expect(write().props.accessibilityState?.disabled).toBe(true);
  });

  it('asks once before removing it, and keeps it if the answer is Cancel', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 3 };
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    expect(openDialog()).not.toBeNull();
    await chooseInDialog(youCopy.bookNameCancel);
    expect(useBookOwner.getState().name).toBe(NAME);

    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    await chooseInDialog(youCopy.bookNameRemove);
    await settle();
    expect(mockRecord).toMatchObject({ name: null, asked: true });
    await waitFor(() =>
      expect(row().props.accessibilityLabel).toBe(`${youCopy.bookName}. ${youCopy.bookNameNone}`),
    );
  });

  it('offers no removing when there is nothing to remove', async () => {
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    expect(screen.queryByRole('button', { name: youCopy.bookNameRemove })).toBeNull();
  });
});
