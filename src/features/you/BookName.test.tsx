// The name on the book, in You: what the row says, and writing, changing and removing it. Invented
// names only.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { bookCopy } from '@/features/book/bookCopy';
import { resetBookOwner, useBookOwner } from '@/features/book/owner';
import type { OwnerRecord } from '@/features/book/ownerStore';
import { clearDialogs } from '@/features/tab-pages/Dialog';
import { openDialog, renderWithDialogs } from '@/testing/dialogs';

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

/** How many windows are open: the Modals on the screen, as the native side receives them. */
function windows(): number {
  type Json = { type: string; children?: unknown };
  const count = (node: unknown): number => {
    if (!node || typeof node !== 'object') return 0;
    if (Array.isArray(node)) return node.reduce<number>((sum, child) => sum + count(child), 0);
    const json = node as Json;
    return (json.type === 'Modal' ? 1 : 0) + count(json.children);
  };
  return count(screen.toJSON());
}

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

  it('leaves as it was when "Write it" was pressed: the named sheet is not laid out under its own exit', async () => {
    // The walk (v10): the sheet grew a "Remove my name" row as it faded and jumped up about 120 px.
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    await fireEvent.changeText(screen.getByTestId('book-name-sheet-field'), NAME);
    await fireEvent.press(screen.getByRole('button', { name: bookCopy.name.write }));
    await settle();
    // The name is written, and the sheet, still on its way out, does not know it.
    expect(useBookOwner.getState().name).toBe(NAME);
    expect(
      screen.getByTestId('book-name-sheet-stage', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.queryByText(youCopy.bookNameRemove, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByRole('button', { name: youCopy.bookNameRemove, hidden: true })).toBeNull();
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
    expect(screen.getByText(youCopy.bookNameRemoveTitle)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameCancel }));
    expect(useBookOwner.getState().name).toBe(NAME);

    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    await settle();
    expect(mockRecord).toMatchObject({ name: null, asked: true });
    await waitFor(() =>
      expect(row().props.accessibilityLabel).toBe(`${youCopy.bookName}. ${youCopy.bookNameNone}`),
    );
  });

  // The walk (v11): "Take your name off the book?" rose over the name sheet, which stayed dimmed behind it,
  // its heading and an edge showing above the question. One sheet at a time: the question takes the
  // name's place on the same sheet, and Cancel, Back or a tap outside bring the name's words back.
  it('asks on the name’s own sheet, not on a second one over it', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 3 };
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    expect(openDialog()).toBeNull();
    expect(windows()).toBe(1);
    // The question is all the sheet says: the name's heading, line and field have made way for it.
    expect(screen.getByText(youCopy.bookNameRemoveTitle)).toBeTruthy();
    expect(screen.getByText(youCopy.bookNameRemoveBody)).toBeTruthy();
    expect(screen.queryByText(bookCopy.name.line)).toBeNull();
    expect(screen.queryByTestId('book-name-sheet-field')).toBeNull();
    expect(screen.queryByRole('button', { name: bookCopy.name.write })).toBeNull();
    // The way out is the quieter word, and comes last, as a dialog's Cancel does.
    expect(
      within(screen.getByTestId('book-name-sheet'))
        .getAllByRole('button')
        .map((button) => button.props.accessibilityLabel),
    ).toEqual([youCopy.bookNameRemove, youCopy.bookNameCancel]);
  });

  it('brings the name back on Back or a tap outside while it asks, and closes nothing', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 3 };
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    await fireEvent.changeText(screen.getByTestId('book-name-sheet-field'), 'Wenna Tresidder');
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    await fireEvent(screen.getByTestId('book-name-sheet'), 'requestClose');
    expect(screen.queryByText(youCopy.bookNameRemoveTitle)).toBeNull();
    // What had been typed is still there.
    expect(screen.getByTestId('book-name-sheet-field').props.value).toBe('Wenna Tresidder');
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    await fireEvent.press(
      screen.getByTestId('book-name-sheet-outside', { includeHiddenElements: true }),
    );
    expect(screen.getByTestId('book-name-sheet-field')).toBeTruthy();
    expect(useBookOwner.getState().name).toBe(NAME);
  });

  it('lets the keys go as the question takes the field’s place', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 3 };
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('leaves with the question on it when the name is removed: one sheet, going once', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 3 };
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    await fireEvent.press(screen.getByRole('button', { name: youCopy.bookNameRemove }));
    await settle();
    expect(windows()).toBe(1);
    expect(screen.queryByTestId('book-name-sheet')).toBeNull();
    expect(
      screen.getByText(youCopy.bookNameRemoveTitle, { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('offers no removing when there is nothing to remove', async () => {
    await renderWithDialogs(<BookName />);
    await settle();
    await fireEvent.press(row());
    expect(screen.queryByRole('button', { name: youCopy.bookNameRemove })).toBeNull();
  });
});
