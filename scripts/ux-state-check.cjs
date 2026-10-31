const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const req = (name) => {
    if (name === "react") return { useSyncExternalStore() {} };
    if (name === "@/storage/journalRepository")
      return {
        createDefaultJournalRepository: () => ({
          kind: "memory",
          persistent: false,
        }),
      };
    if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
    if (name.startsWith("."))
      return load(path.resolve(path.dirname(file), name) + ".ts");
    return require(name);
  };
  new Function("require", "module", "exports", source)(req, mod, mod.exports);
  return mod.exports;
}
(async () => {
  const journal = load("src/state/journal.ts");
  const session = load("src/state/session.ts");
  const saved = new Map();
  let draft = null;
  let fail = false;
  let failClear = false;
  let writes = 0;
  const repo = {
    kind: "sqlite",
    persistent: true,
    loadEntries: async () => [...saved.values()],
    loadDraft: async () => draft,
    saveDraft: async (value) => {
      if (failClear && value === null) throw Error("injected-clear");
      draft = value;
    },
    saveEntry: async (entry) => {
      writes++;
      if (fail) throw Error("injected-save");
      saved.set(entry.id, entry);
    },
    deleteEntry: async (id) => saved.delete(id),
  };
  journal.configureJournalRepository(repo);
  await journal.hydrateJournal();
  const input = {
    promptId: "test",
    promptTextSnapshot: "Synthetic test prompt",
    mode: "text",
    body: "Synthetic test content only",
    durationSeconds: 12,
    moodBefore: "heavy",
  };
  journal.saveDraft(input);
  await journal.flushJournalWrites();
  const id = journal.getDraft().id;
  fail = true;
  await assert.rejects(journal.commitEntry(input));
  assert.equal(journal.getEntries().length, 0);
  assert.equal(journal.getDraft().id, id);
  fail = false;
  failClear = true;
  await assert.rejects(journal.commitEntry(input));
  assert.equal(journal.getEntries().length, 0);
  failClear = false;
  const before = writes;
  const [a, b] = await Promise.all([
    journal.commitEntry(input),
    journal.commitEntry(input),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.id, id);
  assert.equal(writes, before + 1);
  assert.equal(saved.size, 1);
  assert.equal(journal.getDraft(), null);
  await journal.updateJournalEntry(id, {
    moodAfter: "steady",
    takeaway: "Synthetic thought",
    favorite: true,
  });
  assert.equal(saved.get(id).favorite, true);
  assert.equal(saved.get(id).moodAfter, "steady");
  session.startSession("text", undefined, null, {
    ...a,
    body: "restored synthetic draft",
    moodBefore: "heavy",
  });
  assert.equal(session.getSession().text, "restored synthetic draft");
  assert.equal(session.getSession().mood, "heavy");
  assert.equal(session.canReflect(session.getSession()), true);
  session.setSessionMode("voice");
  assert.equal(session.canReflect(session.getSession()), false);
  session.setSessionAudio("synthetic.enc", 4);
  assert.equal(session.canReflect(session.getSession()), true);
  session.startRecordingSession();
  assert.equal(session.canReflect(session.getSession()), false);
  session.endSession();
  journal.saveDraft(input);
  await journal.flushJournalWrites();
  await journal.discardDraft();
  assert.equal(draft, null);
  assert.equal(journal.getDraft(), null);
  console.log(
    "PASS failed save retains draft; failed cleanup retry deduplicates; concurrent save deduplicates; closing data persists; restored session; mode/recording guard; discard persists",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
