// Tags (what makes a copy special: autograph, patch, several players…) and the serial number of a numbered
// card (限號, e.g. 23/99 — not the card number in the set). Card Pool has no fields for these yet, so they
// ride at the front of the record's private notes as readable tokens: "[SN 23/99] [#AUTO] [#PATCH] rest".
// Preset tags are stored by code and shown in the UI language; custom tags are stored as typed.

export const TAG_PRESETS = ['AUTO', 'PATCH', 'MULTI', 'ROOKIE', 'PARALLEL', 'REFRACTOR', 'INSERT', 'SHORT_PRINT', 'ERROR'] as const;
export type TagPreset = (typeof TAG_PRESETS)[number];
export const isPreset = (tag: string): tag is TagPreset => (TAG_PRESETS as readonly string[]).includes(tag);

export const MAX_TAGS = 8;
export const MAX_TAG = 24;
export const MAX_SERIAL = 20;
const NOTES_MAX = 500; // Card Pool's limit for the whole notes field

export interface CardMeta { tags: string[]; serial: string; text: string }

const TOKEN = /^\[(SN |#)([^[\]]{1,24})\]\s*/;

/** Split stored notes into tags, serial number and the seller's own text. */
export function splitNotes(notes: string | null | undefined): CardMeta {
  let rest = notes ?? '';
  const tags: string[] = [];
  let serial = '';
  for (let m = TOKEN.exec(rest); m; m = TOKEN.exec(rest)) {
    if (m[1] === 'SN ') serial = m[2].trim();
    else tags.push(m[2].trim());
    rest = rest.slice(m[0].length);
  }
  return { tags, serial, text: rest };
}

/** The notes value to store. Card Pool collapses whitespace, so everything stays on one line. */
export function joinNotes({ tags, serial, text }: CardMeta): string {
  return [serial && `[SN ${serial}]`, ...tags.map((t) => `[#${t}]`), text.replace(/\s+/g, ' ').trim()].filter(Boolean).join(' ');
}

/** Room left for the seller's own notes once the tags and serial take their share. */
export const notesRoom = (m: Omit<CardMeta, 'text'>) => Math.max(0, NOTES_MAX - joinNotes({ ...m, text: '' }).length - 1);

/** A tag as typed, made safe to store: no brackets, single spaces, at most 24 characters. */
export const cleanTag = (s: string) => s.normalize('NFKC').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG);

/** Add a tag unless it is empty, already there (ignoring case) or the list is full. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = cleanTag(raw);
  const preset = TAG_PRESETS.find((p) => p.toLowerCase() === tag.toLowerCase());
  const v = preset ?? tag;
  if (!v || tags.length >= MAX_TAGS || tags.some((x) => x.toLowerCase() === v.toLowerCase())) return tags;
  return [...tags, v];
}

/** Serial number as typed → stored form: "23 / 99" → "23/99", full-width digits to plain. */
export const cleanSerial = (s: string) => s.normalize('NFKC').replace(/[[\]]/g, '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim().slice(0, MAX_SERIAL);

/** "23/99" must have its copy number within the print run; free forms ("/99", "1 of 1") pass. */
export function serialProblem(serial: string): 'range' | null {
  const m = /^(\d+)\/(\d+)$/.exec(serial);
  if (!m) return null;
  const [n, of] = [Number(m[1]), Number(m[2])];
  return n >= 1 && of >= 1 && n <= of ? null : 'range';
}
