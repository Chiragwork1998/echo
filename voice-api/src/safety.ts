// A first screen for language about suicide or self-harm, run before anything is analysed. It is
// deliberately a net, not a judge: a false alarm costs a person a calm message and no cards, and a
// miss costs far more. It starts from the earlier ECHO prototype's list and widens it.
//
// Hindi and Hinglish are best effort and need review by a native speaker before launch.
// No journal text is ever logged or returned from here: the answer is a boolean.

const ENGLISH: RegExp[] = [
  /\bkill(?:ing)?\s+(?:my\s*self|myself)\b/,
  /\bsuicid(?:e|al)\b/,
  /\bself[\s-]?harm/,
  /\bself[\s-]?injur/,
  /\bend(?:ing)?\s+(?:my\s+(?:own\s+)?life|it\s+all)\b/,
  /\btake\s+my\s+(?:own\s+)?life\b/,
  /\b(?:want|wanted|wanna|wish|wishing|planning|thinking\s+(?:about|of))\s+(?:to\s+|of\s+)?(?:die|dying|be\s+dead|not\s+(?:be\s+alive|exist))\b/,
  /\bwish\s+(?:i|i'd|i\s+would|i\s+were|i\s+was)\s+(?:were\s+|was\s+)?(?:dead|never\s+born|not\s+alive|not\s+here)\b/,
  /\bdon'?t\s+want\s+to\s+(?:be\s+here|live|be\s+alive|wake\s+up|go\s+on|exist)\b/,
  /\b(?:can'?t|cannot)\s+go\s+on\s+living\b/,
  /\bno\s+(?:reason|point)\s+(?:to|in)\s+(?:live|living|going\s+on|being\s+alive)\b/,
  /\bnothing\s+to\s+live\s+for\b/,
  /\bbetter\s+off\s+(?:dead|without\s+me)\b/,
  /\bworld\s+(?:would\s+be|is)\s+better\s+without\s+me\b/,
  /\b(?:hurt|harm|cut|burn)(?:ting|ning|ing)?\s+(?:my\s*self|myself)\b/,
  /\b(?:overdos(?:e|ing)\s+on|swallow(?:ing)?\s+(?:all\s+)?(?:the\s+|my\s+)?pills)\b/,
  /\bwish\s+i\s+(?:could\s+)?(?:just\s+)?(?:not\s+wake\s+up|disappear|fall\s+asleep\s+and\s+not)/,
];

// Roman-script Hindi as people text it, so spellings vary.
const HINGLISH: RegExp[] = [
  /\b(?:mar(?:na|ne|\s*jaana|\s*jana)|marr?ne)\s+(?:ka\s+man\s+)?(?:chah(?:ta|ti|te)|hai)\b/,
  /\bjeena\s+nahi\s+chah(?:ta|ti|te)\b/,
  /\bjeene\s+(?:ka|ki)\s+(?:man|mann|ichha|iccha|wajah|vajah)\s+nahi\b/,
  /\bkhud\s*ko\s+(?:khatam|maar|nuksan|hurt)/,
  /\bapni\s+jaan\s+(?:de|lena|le)/,
  /\b(?:khudkushi|khud\s*kushi|aatm\s*hatya|atm\s*hatya|aatmhatya|atmahatya)\b/,
];

// Devanagari has no \b, so these match on the characters alone.
const DEVANAGARI: RegExp[] = [
  /आत्म\s*हत्या/,
  /ख\u093c?ुद\s*कुशी/,
  /मरना\s+चाह(?:ता|ती|ते)/,
  /जीना\s+नहीं\s+चाह(?:ता|ती|ते)/,
  /जीने\s+का\s+मन\s+नहीं/,
  /ख\u093c?ुद\s*को\s+(?:ख\u093c?त्म|मार)/,
];

const tidy = (text: string) =>
  text
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase();

/** True when any text carries language about suicide or self-harm. */
export function screenForCrisis(texts: readonly string[]): boolean {
  for (const text of texts) {
    const plain = tidy(text);
    if (ENGLISH.some((pattern) => pattern.test(plain))) return true;
    if (HINGLISH.some((pattern) => pattern.test(plain))) return true;
    if (DEVANAGARI.some((pattern) => pattern.test(plain))) return true;
  }
  return false;
}
