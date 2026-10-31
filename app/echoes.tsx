import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { EchoIcon } from '@/components/EchoIcon';
import { ContentBackdrop } from '@/components/ContentBackdrop';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { TabScreen } from '@/components/TabScreen';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import { useJournal, type JournalEntry } from '@/state/journal';
import { entryDate, wordCount } from '@/features/journal/prompts';
import { filterLibrary, groupLibrary, libraryTitle, type LibraryFilter } from '@/features/journal/library';

const FILTERS: LibraryFilter[] = ['All', 'Favorites', 'Voice'];

export default function EchoesScreen() {
  const router = useRouter();
  const { theme } = useEchoTheme();
  const entries = useJournal();
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [limit, setLimit] = useState(24);
  const [filter, setFilter] = useState<LibraryFilter>('All');
  const visible = useMemo(() => filterLibrary(entries, filter, query), [entries, filter, query]);
  const groups = useMemo(() => groupLibrary(visible.slice(0, limit)), [visible, limit]);
  const primary = { color: theme.color.textPrimary };
  const secondary = { color: theme.color.textSecondary };
  const searching = query.trim().length > 0;

  return (
    <TabScreen tab="echoes" title="A life, in your words.">
      <View style={styles.intro}>
        <Text style={[styles.subtitle, secondary]}>
          {entries.length ? `${entries.length} ${entries.length === 1 ? 'moment' : 'moments'} kept. Every one belongs.` : 'Small moments. Honest pages. All yours.'}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Write a new echo" onPress={() => router.replace('/home')} style={[styles.newButton, { borderColor: theme.color.hairlineSoft }]}>
          <EchoIcon name="pen" size={18} color={theme.color.accentWarm} />
        </Pressable>
      </View>

      {entries.length ? (
        <>
          <View style={[styles.search, searchFocused && { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
            <ContentBackdrop />
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke={theme.color.textContentSecondary} strokeWidth="1.5" />
              <Path d="m16 16 5 5" stroke={theme.color.textContentSecondary} strokeWidth="1.5" strokeLinecap="round" />
            </Svg>
            <TextInput accessibilityLabel="Search your echoes" placeholder="Find a word, a feeling, a moment…" placeholderTextColor={theme.color.textContentSecondary} value={query} onChangeText={text => { setQuery(text); setLimit(24); }} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} underlineColorAndroid="transparent" returnKeyType="search" style={[styles.searchInput, { color: theme.color.textContent }]} />
            {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}><Text style={[styles.clearText, { color: theme.color.textContent }]}>×</Text></Pressable> : null}
          </View>
          <View accessibilityRole="tablist" style={[styles.filters, { borderBottomColor: theme.color.hairlineSoft }]}>
            {FILTERS.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityLabel={`${item} echoes`} accessibilityState={{ selected: filter === item }} onPress={() => { setFilter(item); setLimit(24); }} style={[styles.filter, filter === item && { backgroundColor: theme.color.surfaceSelected }]}>
              <Text style={[styles.filterText, { color: filter === item ? theme.color.accentWarm : theme.color.textSecondary }]}>{item}</Text>
              {item === 'Favorites' && entries.some(entry => entry.favorite) ? <View style={[styles.countDot, { backgroundColor: theme.color.accentWarm }]} /> : null}
            </Pressable>)}
          </View>
          {searching ? <Text accessibilityLiveRegion="polite" style={[styles.resultCount, secondary]}>{visible.length} {visible.length === 1 ? 'echo' : 'echoes'} found</Text> : null}
        </>
      ) : null}

      {groups.map(group => <View key={group.key} style={styles.group}>
        <View style={styles.monthRow}>
          <Text accessibilityRole="header" style={[styles.month, primary]}>{group.label}</Text>
          <View style={[styles.monthRule, { backgroundColor: theme.color.hairlineSoft }]} />
        </View>
        {group.entries.map((entry, index) => <EntryPreview key={entry.id} entry={entry} last={index === group.entries.length - 1} onPress={() => router.push(`/entry/${entry.id}` as Href)} />)}
      </View>)}

      {visible.length > limit ? <Pressable accessibilityRole="button" onPress={() => setLimit(current => current + 24)} style={styles.emptyAction}><Text style={[styles.filterText, { color: theme.color.accentWarm, textAlign: 'center' }]}>Show earlier echoes ({visible.length - limit}) ↓</Text></Pressable> : null}

      {!visible.length ? <View style={styles.empty}>
        <View style={[styles.emptyBook, { backgroundColor: theme.color.surfacePrimary, borderColor: theme.color.accentWarm }]} accessibilityElementsHidden>
          <View style={[styles.bookSpine, { borderColor: theme.color.accentWarm }]} />
          <EchoIcon name="book" size={32} color={theme.color.textInk} />
          <Text style={[styles.bookWord, { color: theme.color.textInk }]}>ECHO</Text>
          <View style={[styles.bookLine, { backgroundColor: theme.color.accentWarm }]} />
        </View>
        <Text style={[styles.emptyTitle, primary]}>{!entries.length ? 'Your story starts small.' : searching ? 'That moment is still to come.' : filter === 'Favorites' ? 'Keep a few moments close.' : 'Your voice belongs here, too.'}</Text>
        <Text style={[styles.emptyBody, secondary]}>{!entries.length ? 'One sentence about today is enough. Your pages will gather here, quietly becoming a story only you could tell.' : searching ? 'Try a different word, or clear your search to return to all your pages.' : filter === 'Favorites' ? 'Tap the bookmark while reading an echo. It will be waiting for you here.' : 'Choose Speak when you begin an echo. The recording will join your written pages here.'}</Text>
        {!entries.length ? <PrimaryCTA label="Write your first page" onPress={() => router.replace('/home')} showArrow /> : searching || filter !== 'All' ? <Pressable accessibilityRole="button" onPress={() => { setQuery(''); setFilter('All'); }} style={[styles.emptyAction, styles.forwardAction]}><Text style={[styles.filterText, { color: theme.color.accentWarm }]}>Return to all echoes</Text><EchoIcon name="arrow-right" size={16} color={theme.color.accentWarm} /></Pressable> : null}
      </View> : <Text style={[styles.ending, secondary]}>A little of you, held here.</Text>}
    </TabScreen>
  );
}

function EntryPreview({ entry, last, onPress }: { entry: JournalEntry; last: boolean; onPress: () => void }) {
  const { theme } = useEchoTheme();
  const date = new Date(entry.createdAt);
  const words = wordCount(entry.body);
  return <View style={styles.timelineRow}>
    <View style={styles.dateColumn}>
      <Text style={[styles.dateDay, { color: theme.color.textPrimary }]}>{date.getDate().toString().padStart(2, '0')}</Text>
      <Text style={[styles.dateWeekday, { color: theme.color.textSecondary }]}>{date.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
      {!last ? <View style={[styles.timelineLine, { backgroundColor: theme.color.hairlineSoft }]} /> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Read echo from ${entryDate(entry.createdAt)}: ${libraryTitle(entry)}`} onPress={onPress} style={({ pressed }) => [styles.pagePreview, { borderColor: theme.color.borderGlass, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      <ContentBackdrop />
      <View style={styles.previewTop}>
        <Text style={[styles.previewMeta, { color: theme.color.textContentSecondary }]}>{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{entry.moodBefore ? ` · ${entry.moodBefore}` : ''}</Text>
        {entry.favorite ? <Bookmark color={theme.color.textContent} filled /> : <EchoIcon name={entry.audioPath ? 'mic' : 'pen'} size={15} color={theme.color.textContentSecondary} />}
      </View>
      <Text numberOfLines={2} style={[styles.previewTitle, { color: theme.color.textContent }]}>{libraryTitle(entry)}</Text>
      <Text numberOfLines={3} style={[styles.previewBody, { color: theme.color.textContentSecondary }]}>{entry.contentState === 'unavailable' ? 'This page could not be unlocked on this device.' : entry.body || 'Some things are easier to say. A moment, kept in your own voice.'}</Text>
      <View style={[styles.previewFooter, { borderTopColor: theme.color.textContentSecondary }]}>
        <Text style={[styles.previewMeta, { color: theme.color.textContentSecondary }]}>{entry.audioPath ? 'Voice echo' : `${words} ${words === 1 ? 'word' : 'words'}`}</Text>
        <View style={styles.forwardAction}><Text style={[styles.previewRead, { color: theme.color.textContent }]}>Open page</Text><EchoIcon name="arrow-right" size={14} color={theme.color.textContent} /></View>
      </View>
    </Pressable>
  </View>;
}

function Bookmark({ color, filled }: { color: string; filled?: boolean }) {
  return <Svg height={18} width={16} viewBox="0 0 16 20"><Path d="M3 2h10v16l-5-3-5 3V2Z" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.2} strokeLinejoin="round" /></Svg>;
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  subtitle: { ...tokens.type.ui, fontSize: 13, lineHeight: 20, flex: 1 },
  newButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  search: { zIndex: 0, flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 18, paddingLeft: 16, minHeight: 52, overflow: 'hidden' },
  searchInput: { ...tokens.type.ui, flex: 1, fontSize: 13, paddingVertical: 16, paddingRight: 12, minWidth: 0, borderWidth: 0, outlineWidth: 0, outlineStyle: 'solid' },
  clear: { width: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 24 },
  filters: { flexDirection: 'row', marginTop: 12, gap: 12 },
  filter: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 24 },
  filterText: { ...tokens.type.uiMedium, fontSize: 13, lineHeight: 20 },
  countDot: { width: 4, height: 4, borderRadius: 2 },
  resultCount: { ...tokens.type.ui, fontSize: 12, marginTop: 16 },
  group: { marginTop: 28 },
  monthRow: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 20 },
  month: { ...tokens.type.display, fontSize: 24, lineHeight: 28 },
  monthRule: { height: StyleSheet.hairlineWidth, flex: 1, opacity: 0 },
  timelineRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch', paddingBottom: 20 },
  dateColumn: { width: 36, alignItems: 'center', paddingTop: 12 },
  dateDay: { ...tokens.type.display, fontSize: 29, lineHeight: 32 },
  dateWeekday: { ...tokens.type.ui, fontSize: 10, lineHeight: 16 },
  timelineLine: { width: StyleSheet.hairlineWidth, flex: 1, marginTop: 16, marginBottom: -20, opacity: 0 },
  pagePreview: { zIndex: 0, flex: 1, minWidth: 0, padding: 20, borderRadius: 3, borderTopRightRadius: 18, borderBottomRightRadius: 18, overflow: 'hidden' },
  previewTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 12 },
  previewMeta: { ...tokens.type.ui, fontSize: 10, lineHeight: 16 },
  previewTitle: { ...tokens.type.displayMedium, fontSize: 25, lineHeight: 28, marginBottom: 12 },
  previewBody: { ...tokens.type.ui, fontSize: 12, lineHeight: 21 },
  previewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 12, gap: 8 },
  previewRead: { ...tokens.type.uiMedium, fontSize: 10, lineHeight: 16 },
  forwardAction: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center', paddingTop: 32, paddingBottom: 32 },
  emptyBook: { width: 112, height: 144, borderRadius: 4, borderTopRightRadius: 12, borderBottomRightRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 12, transform: [{ rotate: '-6deg' }], marginBottom: 32 },
  bookSpine: { position: 'absolute', top: 0, bottom: 0, left: 10 },
  bookWord: { ...tokens.type.ui, fontSize: 9, letterSpacing: 4, paddingLeft: 4 },
  bookLine: { width: 28, height: 1 },
  emptyTitle: { ...tokens.type.display, fontSize: 30, lineHeight: 34, textAlign: 'center', marginBottom: 12 },
  emptyBody: { ...tokens.type.ui, fontSize: 13, lineHeight: 22, textAlign: 'center', marginBottom: 24, maxWidth: 290 },
  emptyAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  ending: { ...tokens.type.displayItalic, fontSize: 20, lineHeight: 28, textAlign: 'center', marginTop: 8, opacity: 0.7 },
});
