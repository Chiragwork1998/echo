import { useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TabScreen } from "@/components/TabScreen";
import { EchoIcon } from "@/components/EchoIcon";
import { ContentBackdrop } from "@/components/ContentBackdrop";
import { PrimaryCTA } from "@/components/PrimaryCTA";
import { useEchoTheme } from "@/design/ThemeProvider";
import { tokens } from "@/design/tokens";
import { useJournal } from "@/state/journal";
import {
  setPatternsEnabled,
  useOnboardingState,
} from "@/state/onboardingSelections";
import { MOODS } from "@/features/journal/prompts";

export default function PatternsScreen() {
  const router = useRouter();
  const { theme } = useEchoTheme();
  const entries = useJournal();
  const enabled = useOnboardingState((state) => state.patternsEnabled);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = useMemo(
    () => new Date(year, month + monthOffset, 1),
    [year, month, monthOffset],
  );
  const monthEntries = entries.filter((entry) => {
    const date = new Date(entry.createdAt);
    return (
      date.getFullYear() === monthStart.getFullYear() &&
      date.getMonth() === monthStart.getMonth()
    );
  });
  const byDay = new Map<number, typeof monthEntries>();
  monthEntries.forEach((entry) => {
    const day = new Date(entry.createdAt).getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  });
  const count = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from(
    { length: Math.ceil((monthStart.getDay() + count) / 7) * 7 },
    (_, index) => {
      const day = index - monthStart.getDay() + 1;
      return day > 0 && day <= count ? day : null;
    },
  );
  const moods = monthEntries.filter((entry) => entry.moodBefore);
  const primary = { color: theme.color.textPrimary };
  const secondary = { color: theme.color.textSecondary };
  const content = { color: theme.color.textContent };
  const contentSecondary = { color: theme.color.textContentSecondary };
  const ink = theme.color.textInk;
  return (
    <TabScreen tab="patterns" title="The shape of your days.">
      <Text style={[styles.intro, secondary]}>
        A little distance. A gentler perspective.
      </Text>
      {!enabled ? (
        <View
          style={[
            styles.invitation,
            { borderColor: theme.color.borderGlass },
          ]}
        >
          <ContentBackdrop />
          <EchoIcon color={theme.color.textContent} name="patterns" size={36} />
          <Text style={[styles.inviteTitle, content]}>
            Notice what returns.
          </Text>
          <Text style={[styles.inviteBody, contentSecondary]}>
            Your writing days and the feelings you choose to name, gathered in
            one quiet place.
          </Text>
          <Text style={[styles.inviteBody, contentSecondary]}>
            Calculated on this device. Your words are never analyzed.
          </Text>
          <PrimaryCTA
            label="Show my patterns"
            onPress={() => setPatternsEnabled(true)}
          />
          <Text style={[styles.note, contentSecondary]}>
            Optional. Change this any time in You.
          </Text>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.calendar,
              { borderColor: theme.color.borderGlass },
            ]}
          >
            <ContentBackdrop />
            <View style={styles.monthRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => {
                  setMonthOffset((value) => value - 1);
                  setSelectedDay(null);
                }}
                style={styles.nav}
              >
                <Text style={[styles.chevron, content]}>‹</Text>
              </Pressable>
              <Text style={[styles.month, content]}>
                {monthStart.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                disabled={monthOffset >= 0}
                accessibilityState={{ disabled: monthOffset >= 0 }}
                onPress={() => {
                  setMonthOffset((value) => value + 1);
                  setSelectedDay(null);
                }}
                style={[styles.nav, monthOffset >= 0 && { opacity: 0.2 }]}
              >
                <EchoIcon name="arrow-right" size={20} color={theme.color.textContent} />
              </Pressable>
            </View>
            <View style={styles.grid}>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <View key={index} style={styles.weekday}>
                  <Text style={[styles.weekdayLabel, contentSecondary]}>
                    {day}
                  </Text>
                </View>
              ))}
              {cells.map((day, index) => (
                <View key={index} style={styles.dayCell}>
                  {day ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${monthStart.toLocaleDateString(undefined, { month: "long" })} ${day}, ${byDay.get(day)?.length ?? 0} echoes`}
                      accessibilityState={{ selected: selectedDay === day }}
                      onPress={() =>
                        setSelectedDay(selectedDay === day ? null : day)
                      }
                      style={[
                        styles.day,
                        selectedDay === day && { backgroundColor: theme.color.surfacePrimary },
                        selectedDay !== day &&
                          byDay.has(day) && {
                            backgroundColor: "rgba(190,153,99,0.22)",
                          },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          {
                            color:
                              selectedDay === day
                                ? ink
                                : theme.color.textContent,
                          },
                        ]}
                      >
                        {day}
                      </Text>
                      <View
                        style={[
                          styles.dot,
                          {
                            backgroundColor: byDay.has(day)
                              ? selectedDay === day
                                ? ink
                                : theme.color.textContent
                              : "transparent",
                          },
                        ]}
                      />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={styles.legend}>
              <View style={[styles.dot, { backgroundColor: theme.color.textContent }]} />
              <Text style={[styles.note, styles.legendText, contentSecondary]}>
                A day you made space. No streak to protect.
              </Text>
            </View>
          </View>
          {selectedDay !== null ? (
            <View style={styles.dayEntries}>
              <Text style={[styles.section, secondary]}>
                {monthStart
                  .toLocaleDateString(undefined, { month: "short" })
                  .toUpperCase()}{" "}
                {selectedDay}
              </Text>
              {byDay.get(selectedDay)?.length ? (
                byDay.get(selectedDay)!.map((entry) => (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/entry/${entry.id}` as Href)}
                    style={[
                      styles.entry,
                      { borderBottomColor: theme.color.hairlineSoft },
                    ]}
                  >
                    <Text
                      numberOfLines={2}
                      style={[styles.entryTitle, primary]}
                    >
                      {entry.takeaway || entry.promptTextSnapshot}
                    </Text>
                    <EchoIcon name="arrow-right" size={20} color={theme.color.textPrimary} />
                  </Pressable>
                ))
              ) : (
                <Text style={[styles.intro, secondary]}>
                  No echo on this day. Your rhythm has room for quiet days, too.
                </Text>
              )}
            </View>
          ) : null}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, primary]}>
                {monthEntries.length}
              </Text>
              <Text style={[styles.note, secondary]}>echoes this month</Text>
            </View>
            <View
              style={[
                styles.stat,
                {
                  borderLeftColor: theme.color.hairlineSoft,
                },
              ]}
            >
              <Text style={[styles.statValue, primary]}>{byDay.size}</Text>
              <Text style={[styles.note, secondary]}>days of making space</Text>
            </View>
          </View>
          <Text style={[styles.section, secondary]}>
            THE FEELINGS YOU NAMED
          </Text>
          {moods.length ? (
            <View style={styles.feelings}>
              {MOODS.map((mood) => {
                const total = moods.filter(
                  (entry) => entry.moodBefore === mood.id,
                ).length;
                return (
                  <View key={mood.id} style={styles.feeling}>
                    <Text style={[styles.feelingName, primary]}>
                      {mood.label}
                    </Text>
                    <View
                      style={[
                        styles.track,
                        { backgroundColor: theme.color.hairlineSoft },
                      ]}
                    >
                      <View
                        style={{
                          height: 3,
                          width: `${(total / moods.length) * 100}%`,
                          backgroundColor: theme.color.accentWarm,
                        }}
                      />
                    </View>
                    <Text style={[styles.note, secondary]}>{total}</Text>
                  </View>
                );
              })}
              <Text style={[styles.note, secondary]}>
                Your optional check-ins this month. Every feeling belongs here.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <EchoIcon
                name="cairn-outline"
                color={theme.color.accentWarm}
                size={30}
              />
              <Text style={[styles.emptyTitle, primary]}>
                The picture begins with you.
              </Text>
              <Text style={[styles.intro, secondary]}>
                Choose a feeling before writing. Over time, these small
                check-ins can help you look back.
              </Text>
            </View>
          )}
        </>
      )}
    </TabScreen>
  );
}
const styles = StyleSheet.create({
  intro: { ...tokens.type.ui, fontSize: 12, lineHeight: 21 },
  invitation: { zIndex: 0, marginTop: 28, padding: 26, borderRadius: 8, gap: 20, overflow: "hidden" },
  inviteTitle: { ...tokens.type.display, fontSize: 33, lineHeight: 37 },
  inviteBody: { ...tokens.type.ui, fontSize: 13, lineHeight: 23 },
  note: { ...tokens.type.ui, fontSize: 10, lineHeight: 17 },
  calendar: { zIndex: 0, marginTop: 24, padding: 16, borderRadius: 8, overflow: "hidden" },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  month: { ...tokens.type.display, fontSize: 25 },
  nav: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: { fontSize: 27 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: "14.2857%", alignItems: "center", paddingBottom: 10 },
  weekdayLabel: { ...tokens.type.ui, fontSize: 9 },
  dayCell: { width: "14.2857%", alignItems: "center", minHeight: 44 },
  day: {
    width: "100%",
    maxWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  dayNumber: { ...tokens.type.ui, fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 3 },
  legend: {
    marginTop: 18,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  legendText: { flexShrink: 1 },
  dayEntries: { marginTop: 20 },
  entry: {
    paddingVertical: 12,
    minHeight: 56,
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  entryTitle: { ...tokens.type.display, fontSize: 23, lineHeight: 28, flex: 1 },
  stats: { flexDirection: "row", paddingVertical: 32 },
  stat: { flex: 1, alignItems: "center", gap: 6 },
  statValue: { ...tokens.type.display, fontSize: 40, lineHeight: 42 },
  section: {
    ...tokens.type.uiMedium,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 18,
  },
  feelings: { gap: 18 },
  feeling: { flexDirection: "row", gap: 16, alignItems: "center" },
  feelingName: { ...tokens.type.ui, fontSize: 12, width: 64 },
  track: { flex: 1, height: 3 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 24 },
  emptyTitle: { ...tokens.type.display, fontSize: 25 },
});
