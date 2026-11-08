import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextStyle } from 'react-native';

import { tokens } from '@/design/tokens';
import { NAME_MAX, sanitiseName } from '@/features/book/name';
import { loadBookOwner, removeName, useBookOwner, writeName } from '@/features/book/owner';
import { useTone } from '@/features/onboarding/rhythm/tone';
import { showDialog } from '@/features/tab-pages/Dialog';
import { Notice, Row, Section } from '@/features/tab-pages/parts';
import { Sheet, SheetAction, SheetButton, SheetText, SheetTitle } from '@/features/tab-pages/Sheet';
import { bookCopy } from '@/features/book/bookCopy';

import { youCopy } from './youCopy';

/** The browser draws its own ring around a focused field; the field's own line shows it here. */
const NO_RING = (
  Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : {}
) as TextStyle;

/**
 * The name on the book, as a row of You: it says the name, or that none is written, and opens a sheet
 * to write, change or remove it. The name is the person's, sealed on this phone (src/features/book/
 * ownerStore.ts), and this is the one place outside the book that shows it.
 */
export function BookName() {
  const name = useBookOwner((state) => state.name);
  const [open, setOpen] = useState(false);
  // Each opening starts the sheet afresh, from the name as it is.
  const [opens, setOpens] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void loadBookOwner();
  }, []);
  return (
    <View style={styles.group}>
      <Section>
        <Row
          label={youCopy.bookName}
          value={name ?? youCopy.bookNameNone}
          hint={youCopy.bookNameHint}
          onPress={() => {
            setFailed(false);
            setOpens((count) => count + 1);
            setOpen(true);
          }}
          chevron
        />
      </Section>
      {failed && <Notice message={youCopy.bookNameFailed} />}
      <BookNameSheet
        key={opens}
        visible={open}
        name={name}
        onClose={() => setOpen(false)}
        onFailed={() => setFailed(true)}
      />
    </View>
  );
}

function BookNameSheet({
  visible,
  name,
  onClose,
  onFailed,
}: {
  visible: boolean;
  name: string | null;
  onClose: () => void;
  onFailed: () => void;
}) {
  const tone = useTone();
  const [value, setValue] = useState(name ?? '');
  const written = sanitiseName(value);
  const write = () => {
    if (!written) return;
    onClose();
    void writeName(written).then((kept) => {
      if (!kept) onFailed();
    });
  };
  // Taking a name off asks once, as anything that cannot be seen again does.
  const remove = () =>
    showDialog(youCopy.bookNameRemoveTitle, youCopy.bookNameRemoveBody, [
      { text: youCopy.bookNameCancel, style: 'cancel' },
      {
        text: youCopy.bookNameRemove,
        style: 'destructive',
        onPress: () => {
          onClose();
          void removeName().then((kept) => {
            if (!kept) onFailed();
          });
        },
      },
    ]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      testID="book-name-sheet"
      footer={
        <View style={styles.footer}>
          <SheetButton
            label={bookCopy.name.write}
            onPress={write}
            disabled={!written || written === name}
          />
          {name ? <SheetAction label={youCopy.bookNameRemove} onPress={remove} /> : null}
        </View>
      }
    >
      <SheetTitle>{youCopy.bookName}</SheetTitle>
      <SheetText>{bookCopy.name.line}</SheetText>
      <TextInput
        testID="book-name-sheet-field"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={write}
        placeholder={bookCopy.name.placeholder}
        placeholderTextColor={tone.inkSoft}
        accessibilityLabel={bookCopy.name.placeholder}
        // Kept from the phone's suggestion and autofill stores (docs/DATA_CONTRACT.md).
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
        autoCorrect={false}
        spellCheck={false}
        autoCapitalize="words"
        maxLength={NAME_MAX}
        returnKeyType="done"
        underlineColorAndroid="transparent"
        maxFontSizeMultiplier={1.4}
        style={[styles.field, NO_RING, { color: tone.ink, borderBottomColor: tone.inkSoft }]}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: tokens.space[12] },
  field: {
    marginTop: tokens.space[4],
    paddingVertical: tokens.space[8],
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    fontFamily: 'CormorantGaramond_400Regular_Italic',
    fontSize: 26,
    lineHeight: 32,
  },
  footer: { gap: tokens.space[4], alignItems: 'stretch' },
});
