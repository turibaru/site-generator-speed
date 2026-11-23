// Bagian 1: util teks + front matter

function byCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_TEST = /[&<>"']/;

// Regex panas di-hoist ke module scope: literal di dalam fungsi dialokasi
// ulang tiap evaluasi, dan fungsi-fungsi ini dipanggil ribuan kali per run.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TAGS_BAD_RE = /["[\]]/;
const LAYOUT_RE = /^[a-z0-9-]+$/;
const SLUG_FM_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FM_BLANK_RE = /^[ \t]*$/;
const FM_LINE_RE = /^([a-z_]+):(?: (.*))?$/;
const FM_TRAIL_WS_RE = /[ \t]+$/;
const WS_RE = /\s/;
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const MARKS_RE = /\p{M}/gu;
const CR_RE = /\r\n?/g;

function escapeHtml(text) {
  if (!ESCAPE_TEST.test(text)) return text;
  return text.replace(ESCAPE_RE, c => ESCAPE_MAP[c]);
}

const slugCache = new Map();

function slugify(text) {
  const hit = slugCache.get(text);
  if (hit !== undefined) return hit;
  let ascii = true;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) >= 128) { ascii = false; break; }
  const plain = ascii ? text : text.normalize('NFKD').replace(MARKS_RE, '');
  const parts = [];
  let dash = false;
  for (let i = 0; i < plain.length; i++) {
    let c = plain[i];
    if (c >= 'A' && c <= 'Z') c = c.toLowerCase();
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { parts.push(c); dash = false; }
    else if (parts.length > 0 && !dash) { parts.push('-'); dash = true; }
  }
  let out = parts.join('');
  if (out.endsWith('-')) out = out.slice(0, -1);
  if (out.length > 64) {
    out = out.slice(0, 64);
    if (out.endsWith('-')) out = out.slice(0, -1);
  }
  const result = out || 'untitled';
  slugCache.set(text, result);
  return result;
}

function uniqueSlug(slug, taken) {
  let s = slug;
  let n = 2;
  while (taken.has(s)) { s = slug + '-' + n; n++; }
  taken.add(s);
  return s;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(date) {
  return Number(date.slice(8, 10)) + ' ' + MONTHS[Number(date.slice(5, 7)) - 1] + ' ' + date.slice(0, 4);
}

// Whitespace table for wordsOf: ASCII 9-13, 32 + the non-ASCII spaces wordsOf treats as separators.
const WS_TABLE = new Uint8Array(65536);
for (const c of [9, 10, 11, 12, 13, 32, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF]) WS_TABLE[c] = 1;
for (let c = 0x2000; c <= 0x200A; c++) WS_TABLE[c] = 1;

function wordsOf(text) {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    if (WS_TABLE[text.charCodeAt(i)]) inWord = false;
    else if (!inWord) { inWord = true; n++; }
  }
  return n;
}

const KEYS = ['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary'];

function daysIn(y, m) {
  if (m === 2) return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
}

function stringOf(k, raw) {
  if (raw[0] === '"') {
    if (raw.length < 2 || raw[raw.length - 1] !== '"') return { error: 'key "' + k + '": a quoted string is not closed' };
    let out = '';
    let start = 1;
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'key "' + k + '": a quoted string holds an escape other than \\" or \\\\' };
        out += raw.slice(start, i) + n;
        start = i + 2;
        i++;
      } else if (c === '"') {
        return { error: 'key "' + k + '": a quoted string holds a stray quote' };
      }
    }
    return { value: out + raw.slice(start, raw.length - 1) };
  }
  if (raw[0] === '[') return { error: 'key "' + k + '": a bare string opens on [' };
  return { value: raw };
}

function valueOf(k, raw) {
  if (k === 'title' || k === 'summary') return stringOf(k, raw);
  if (k === 'date') {
    const m = DATE_RE.exec(raw);
    if (!m) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!(y >= 1970 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo))) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
    return { value: raw };
  }
  if (k === 'tags') {
    if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
    const inner = raw.slice(1, -1);
    if (inner.trim() === '') return { value: [] };
    const parts = inner.split(',').map(s => s.trim());
    for (const t of parts) if (t === '' || TAGS_BAD_RE.test(t)) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
    return { value: parts };
  }
  if (k === 'draft') {
    if (raw === 'true') return { value: true };
    if (raw === 'false') return { value: false };
    return { error: 'key "draft": true or false' };
  }
  if (k === 'layout') {
    if (LAYOUT_RE.test(raw)) return { value: raw };
    return { error: 'key "layout": not a template name' };
  }
  if (k === 'slug') {
    if (raw.length <= 64 && SLUG_FM_RE.test(raw)) return { value: raw };
    return { error: 'key "slug": not a slug' };
  }
  return { error: 'unknown key "' + k + '"' };
}

function parseFrontMatter(text) {
  // Scan lines by index (no split): line 0 must be '---', then the closing '---' line.
  let nl = text.indexOf('\n');
  if (nl === -1) nl = text.length;
  if (text.slice(0, nl) !== '---') return { error: 'no front matter' };
  let pos = nl + 1;
  let lineNo = 1; // 1-based number of the line starting at pos
  let endLineNo = -1;
  let bodyStart = -1;
  while (true) {
    let e = text.indexOf('\n', pos);
    if (e === -1) e = text.length;
    if (text.slice(pos, e) === '---') { endLineNo = lineNo; bodyStart = e === text.length ? text.length : e + 1; break; }
    if (e === text.length) break;
    pos = e + 1;
    lineNo++;
  }
  if (endLineNo === -1) return { error: 'the front matter is not closed' };
  const data = {};
  pos = nl + 1;
  for (let i = 1; i < endLineNo; i++) {
    let e = text.indexOf('\n', pos);
    if (e === -1) e = text.length;
    const line = text.slice(pos, e);
    pos = e + 1;
    if (FM_BLANK_RE.test(line) || line.startsWith('#')) continue;
    const m = FM_LINE_RE.exec(line);
    if (!m) return { error: 'line ' + (i + 1) + ' is not "key: value"' };
    const key = m[1];
    const raw = (m[2] ?? '').replace(FM_TRAIL_WS_RE, '');
    if (!KEYS.includes(key)) return { error: 'unknown key "' + key + '"' };
    if (key in data) return { error: 'key "' + key + '" is given twice' };
    if (raw === '') return { error: 'key "' + key + '" has no value' };
    const r = valueOf(key, raw);
    if (r.error) return r;
    data[key] = r.value;
  }
  if (!('title' in data)) return { error: 'no title' };
  return { data, body: text.slice(bodyStart) };
}

// === Bagian 2: Markdown ===

// Klasifikasi baris pada offset (src, s, e) — tanpa array baris, tanpa regex.
// Semantiknya sama persis dengan regex lama: BLANK /^[ \t]*$/, FENCE_OPEN
// /^```([A-Za-z0-9_+-]*)[ \t]*$/, FENCE_CLOSE /^```[ \t]*$/,
// HEADING /^(#{1,6})[ \t]+(.*?)[ \t]*$/, HR /^(?:---|\*\*\*)[ \t]*$/,
// BULLET /^[-*] (.*)$/, ORDERED /^(\d{1,9})\. (.*)$/, CONTINUED /^ {2,}\S/.

function lineIsBlank(src, s, e) {
  for (let i = s; i < e; i++) { const c = src[i]; if (c !== ' ' && c !== '\t') return false; }
  return true;
}

function fenceLang(src, s, e) {
  if (e - s < 3 || src[s] !== '`' || src[s + 1] !== '`' || src[s + 2] !== '`') return null;
  let i = s + 3;
  const ls = i;
  while (i < e) {
    const c = src.charCodeAt(i);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45)) break;
    i++;
  }
  const lang = src.slice(ls, i);
  while (i < e && (src[i] === ' ' || src[i] === '\t')) i++;
  return i === e ? lang : null;
}

function fenceClose(src, s, e) {
  if (e - s < 3 || src[s] !== '`' || src[s + 1] !== '`' || src[s + 2] !== '`') return false;
  for (let i = s + 3; i < e; i++) if (src[i] !== ' ' && src[i] !== '\t') return false;
  return true;
}

function headingAt(src, s, e) {
  let i = s;
  while (i < e && src[i] === '#') i++;
  const depth = i - s;
  if (depth === 0 || depth > 6) return null;
  if (i >= e || (src[i] !== ' ' && src[i] !== '\t')) return null;
  let j = i;
  while (j < e && (src[j] === ' ' || src[j] === '\t')) j++;
  let k = e;
  while (k > j && (src[k - 1] === ' ' || src[k - 1] === '\t')) k--;
  if (k === j) return null;
  return { depth, text: src.slice(j, k) };
}

function isHr(src, s, e) {
  if (e - s < 3) return false;
  const c = src[s];
  if (c !== '-' && c !== '*') return false;
  if (src[s + 1] !== c || src[s + 2] !== c) return false;
  for (let i = s + 3; i < e; i++) if (src[i] !== ' ' && src[i] !== '\t') return false;
  return true;
}

// Offset awal isi item bullet ('- ' / '* ') atau null.
function bulletText(src, s, e) {
  if (e - s < 2) return null;
  const c = src[s];
  if ((c !== '-' && c !== '*') || src[s + 1] !== ' ') return null;
  return s + 2;
}

// { start, textStart } untuk /^(\d{1,9})\. (.*)$/ atau null.
function orderedAt(src, s, e) {
  let i = s;
  while (i < e && src[i] >= '0' && src[i] <= '9') i++;
  const nd = i - s;
  if (nd === 0 || nd > 9) return null;
  if (i + 1 >= e || src[i] !== '.' || src[i + 1] !== ' ') return null;
  return { start: Number(src.slice(s, i)), textStart: i + 2 };
}

function isContinued(src, s, e) {
  let j = s;
  while (j < e && src[j] === ' ') j++;
  return j - s >= 2 && j < e && !WS_TABLE[src.charCodeAt(j)];
}

function endsParagraph(src, s, e) {
  if (e === s) return true;
  const c0 = src[s];
  if (c0 === ' ' || c0 === '\t') return lineIsBlank(src, s, e);
  if (c0 === '`') return fenceLang(src, s, e) !== null;
  if (c0 === '#') return headingAt(src, s, e) !== null;
  if (c0 === '-' || c0 === '*') return isHr(src, s, e);
  return false;
}

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b && (line[a] === ' ' || line[a] === '\t')) a++;
  while (b > a && (line[b - 1] === ' ' || line[b - 1] === '\t')) b--;
  return a === 0 && b === line.length ? line : line.slice(a, b);
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

function findUnescaped(s, what, from) {
  // Setara dengan sapuan per-karakter lama: kemunculan `what` di j
  // ter-escape iff jumlah backslash tepat sebelum j ganjil (karakter
  // pertama `what` — '*' dan ']' — selalu ada di ESCAPABLE).
  let j = s.indexOf(what, from);
  while (j !== -1) {
    let k = j - 1;
    let n = 0;
    while (k >= from && s[k] === '\\') { n++; k--; }
    if (n % 2 === 0) return j;
    j = s.indexOf(what, j + 1);
  }
  return -1;
}

function findSingleStar(s, from) {
  let j = s.indexOf('*', from);
  while (j !== -1) {
    let k = j - 1;
    let n = 0;
    while (k >= from && s[k] === '\\') { n++; k--; }
    if (n % 2 === 1) { j = s.indexOf('*', j + 1); continue; }
    if (s[j + 1] === '*') { j = s.indexOf('*', j + 2); continue; }
    return j;
  }
  return -1;
}

const INLINE_RE = /[\\`*[&<>"']/g;

// Cache hasil inline untuk string tanpa '[': hasilnya murni fungsi dari
// string itu (env.link hanya dipakai di cabang '['; substring hasil
// rekursi pun tak mengandung '[' bila string asal tak mengandungnya),
// jadi aman dipakai lintas source/case. ~37% panggilan inline adalah
// duplikat string seperti ini.
const INLINE_CACHE = new Map();

function inline(s, env) {
  if (s.indexOf('[') !== -1) return inlineRaw(s, env);
  const hit = INLINE_CACHE.get(s);
  if (hit !== undefined) return hit;
  const out = inlineRaw(s, env);
  INLINE_CACHE.set(s, out);
  return out;
}

function inlineRaw(s, env) {
  // Satu sapuan regex atas karakter istimewa (\ ` * [) dan karakter yang
  // perlu di-escape (& < > " '): segmen polos di-push apa adanya karena
  // regex sudah menjamin tak ada karakter istimewa di dalamnya. Regex
  // dipakai bersama (module-level): setiap jalur yang berekursi diakhiri
  // `INLINE_RE.lastIndex = i`, dan loop selalu habis (exec -> null
  // mereset lastIndex ke 0), jadi pemakaian ulang aman.
  INLINE_RE.lastIndex = 0;
  let out = null;
  let i = 0;
  let m;
  while ((m = INLINE_RE.exec(s)) !== null) {
    const j = m.index;
    const c = m[0];
    if (c === '&' || c === '<' || c === '>' || c === '"' || c === "'") {
      if (out === null) out = [];
      if (j > i) out.push(s.slice(i, j));
      out.push(ESCAPE_MAP[c]);
      i = j + 1;
      continue;
    }
    if (out === null) out = [];
    if (j > i) out.push(s.slice(i, j));
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      out.push(s[j + 1]);
      i = j + 2;
    } else if (c === '`') {
      const m2 = s.indexOf('`', j + 1);
      if (m2 > j + 1) { out.push(`<code>${escapeHtml(s.slice(j + 1, m2))}</code>`); i = m2 + 1; }
      else { out.push('`'); i = j + 1; }
    } else if (c === '*') {
      if (s[j + 1] === '*') {
        const m2 = findUnescaped(s, '**', j + 2);
        if (m2 > j + 2) { out.push(`<strong>${inline(s.slice(j + 2, m2), env)}</strong>`); i = m2 + 2; }
        else { out.push('**'); i = j + 2; }
      } else {
        const m2 = findSingleStar(s, j + 1);
        if (m2 > j + 1) { out.push(`<em>${inline(s.slice(j + 1, m2), env)}</em>`); i = m2 + 1; }
        else { out.push('*'); i = j + 1; }
      }
    } else if (c === '[') {
      const k2 = findUnescaped(s, ']', j + 1);
      const m2 = (k2 !== -1 && s[k2 + 1] === '(') ? s.indexOf(')', k2 + 2) : -1;
      const target = m2 === -1 ? '' : s.slice(k2 + 2, m2);
      if (target !== '' && !WS_RE.test(target)) {
        out.push(`<a href="${escapeHtml(env.link(target))}">${inline(s.slice(j + 1, k2), env)}</a>`);
        i = m2 + 1;
      } else { out.push('['); i = j + 1; }
    } else {
      out.push(c);
      i = j + 1;
    }
    INLINE_RE.lastIndex = i;
  }
  if (out === null) return s;
  if (i < s.length) out.push(s.slice(i));
  return out.join('');
}

// Fusi lex + render: blok dirender langsung saat baris dipindai, tanpa
// objek token perantara. Semantik identik dengan lex() + loop token lama.
function renderMarkdown(src, env) {
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  const n = src.length;
  let pos = 0;
  while (pos < n) {
    let e = src.indexOf('\n', pos);
    if (e === -1) e = n;
    const s = pos;
    const next = e === n ? n : e + 1;
    if (e === s || ((src[s] === ' ' || src[s] === '\t') && lineIsBlank(src, s, e))) { pos = next; continue; }
    const c0 = src[s];
    if (c0 === '`') {
      const lang = fenceLang(src, s, e);
      if (lang !== null) {
        const body = [];
        pos = next;
        let closed = false;
        while (pos < n) {
          let e2 = src.indexOf('\n', pos);
          if (e2 === -1) e2 = n;
          if (fenceClose(src, pos, e2)) { pos = e2 === n ? n : e2 + 1; closed = true; break; }
          body.push(src.slice(pos, e2));
          pos = e2 === n ? n : e2 + 1;
        }
        // Fence tak tertutup di EOF: split('\n') versi lama menghasilkan
        // satu elemen '' terakhir bila src berakhir '\n' — baris itu ikut
        // jadi isi code block dan harus dipertahankan.
        if (!closed && n > 0 && src[n - 1] === '\n') body.push('');
        const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
        blocks.push(`<pre><code${cls}>${body.length === 0 ? '' : body.map(escapeHtml).join('\n') + '\n'}</code></pre>`);
        continue;
      }
    }
    if (c0 === '#') {
      const h = headingAt(src, s, e);
      if (h !== null) {
        const id = uniqueSlug(slugify(h.text), ids);
        const html = inline(h.text, env);
        blocks.push(`<h${h.depth} id="${id}">${html}</h${h.depth}>`);
        if (h.depth === 2 || h.depth === 3) toc.push({ level: h.depth, id, html });
        pos = next;
        continue;
      }
    }
    if ((c0 === '-' || c0 === '*') && isHr(src, s, e)) {
      blocks.push('<hr>');
      pos = next;
      continue;
    }
    if (c0 === '>') {
      const body = [];
      while (pos < n) {
        let e2 = src.indexOf('\n', pos);
        if (e2 === -1) e2 = n;
        if (src[pos] !== '>') break;
        let st = pos + 1;
        if (st < e2 && src[st] === ' ') st++;
        body.push(src.slice(st, e2));
        pos = e2 === n ? n : e2 + 1;
      }
      const lines = [];
      for (const l of body) { const t = trimLine(l); if (t !== '') lines.push(t); }
      if (lines.length === 0) blocks.push('<blockquote>\n</blockquote>');
      else blocks.push(`<blockquote>\n<p>${inline(lines.join('\n'), env)}</p>\n</blockquote>`);
      continue;
    }
    const bStart = (c0 === '-' || c0 === '*') ? bulletText(src, s, e) : null;
    const ord = bStart === null && c0 >= '0' && c0 <= '9' ? orderedAt(src, s, e) : null;
    if (bStart !== null || ord !== null) {
      const isOrdered = ord !== null;
      const start = isOrdered ? ord.start : 1;
      const items = [];
      let cur = pos;
      while (cur < n) {
        let e2 = src.indexOf('\n', cur);
        if (e2 === -1) e2 = n;
        const nx = e2 === n ? n : e2 + 1;
        if (isOrdered) {
          const o2 = orderedAt(src, cur, e2);
          if (o2 !== null) { items.push([trimLine(src.slice(o2.textStart, e2))]); cur = nx; continue; }
        } else {
          const b2 = bulletText(src, cur, e2);
          if (b2 !== null) { items.push([trimLine(src.slice(b2, e2))]); cur = nx; continue; }
        }
        if (isContinued(src, cur, e2)) {
          items[items.length - 1].push(trimLine(src.slice(cur, e2)));
          cur = nx;
          continue;
        }
        break;
      }
      pos = cur;
      const tag = isOrdered ? 'ol' : 'ul';
      const open = (isOrdered && start !== 1) ? `<ol start="${start}">` : `<${tag}>`;
      const lis = [];
      for (const parts of items) lis.push(parts.length === 1 ? `<li>${inline(parts[0], env)}</li>` : `<li>${inline(parts.join('\n'), env)}</li>`);
      blocks.push(`${open}\n${lis.join('\n') + '\n'}</${tag}>`);
      continue;
    }
    // Paragraf satu baris (kasus umum): tanpa array + join.
    let e2 = next < n ? src.indexOf('\n', next) : -1;
    if (e2 === -1) e2 = n;
    if (next >= n || endsParagraph(src, next, e2)) {
      const html = inline(trimLine(src.slice(s, e)), env);
      if (excerpt === null) excerpt = html;
      blocks.push(`<p>${html}</p>`);
      pos = next;
      continue;
    }
    const body = [trimLine(src.slice(s, e))];
    pos = next;
    while (pos < n) {
      let e3 = src.indexOf('\n', pos);
      if (e3 === -1) e3 = n;
      if (endsParagraph(src, pos, e3)) break;
      body.push(trimLine(src.slice(pos, e3)));
      pos = e3 === n ? n : e3 + 1;
    }
    const html = inline(body.join('\n'), env);
    if (excerpt === null) excerpt = html;
    blocks.push(`<p>${html}</p>`);
  }
  return { html: blocks.length === 0 ? '' : blocks.join('\n') + '\n', toc, excerpt: excerpt ?? '' };
}

// ---- Bagian 3: Template + pipeline + run ----

const INCLUDE_DEPTH = 8;
const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

class TemplateError extends Error {}

function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) { text += src.slice(i); break; }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') { text += src.slice(i, open + 1); i = open + 1; continue; }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') { tokens.push({ t: 'text', text }); text = ''; }
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') { tokens.push({ t: 'text', text }); text = ''; }
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') { body.push({ kind: 'text', text: tok.text }); continue; }
    if (tok.t === 'var' || tok.t === 'raw') { body.push({ kind: tok.t, path: tok.path }); continue; }
    const tag = tok.tag;
    const top = stack[stack.length - 1];
    let m;
    if ((m = FOR.exec(tag)) !== null) {
      const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
      body.push(node); stack.push(node); body = node.body;
    } else if ((m = IF.exec(tag)) !== null) {
      const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
      body.push(node); stack.push(node); body = node.then;
    } else if (tag === 'else') {
      if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
      top.else = []; body = top.else;
    } else if (tag === 'endfor' || tag === 'endif') {
      if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
      stack.pop();
      const parent = stack[stack.length - 1];
      body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
    } else if ((m = INCLUDE.exec(tag)) !== null) {
      body.push({ kind: 'include', name: m[1] });
    } else {
      throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

function lookup(scope, path) {
  let s = scope;
  while (s !== null && !Object.hasOwn(s.vars, path[0])) s = s.parent;
  if (s === null) return undefined;
  let v = s.vars[path[0]];
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

function renderNodes(nodes, scope, ctx, depth, out) {
  for (const n of nodes) {
    if (n.kind === 'text') out.push(n.text);
    else if (n.kind === 'var') out.push(ctx.escape(textOf(lookup(scope, n.path))));
    else if (n.kind === 'raw') out.push(textOf(lookup(scope, n.path)));
    else if (n.kind === 'if') {
      const v = truthy(lookup(scope, n.path));
      const branch = v !== n.not ? n.then : n.else;
      if (branch !== null) renderNodes(branch, scope, ctx, depth, out);
    } else if (n.kind === 'for') {
      const xs = lookup(scope, n.path);
      if (!Array.isArray(xs)) continue;
      const child = { vars: {}, parent: scope };
      const loop = { index: 0, first: true, last: false, length: xs.length };
      child.vars.loop = loop;
      for (let k = 0; k < xs.length; k++) {
        child.vars[n.name] = xs[k];
        loop.index = k + 1;
        loop.first = k === 0;
        loop.last = k === xs.length - 1;
        renderNodes(n.body, child, ctx, depth, out);
      }
    } else if (n.kind === 'include') {
      const t = ctx.templates.get(n.name);
      if (t !== undefined && depth < INCLUDE_DEPTH) renderNodes(t, scope, ctx, depth + 1, out);
    }
  }
}

const REPORT_FILE = 'build-report.txt';
const RESERVED = Object.freeze(['posts', 'tags', 'page']);

function resolvePath(dir, rel) {
  if (rel.indexOf('/') === -1) {
    if (rel === '..') return dir === '' ? null : (dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '');
    if (rel === '' || rel === '.') return dir;
    return dir === '' ? rel : dir + '/' + rel;
  }
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (parts.length === 0) return null; parts.pop(); }
    else parts.push(seg);
  }
  return parts.join('/');
}

function dirOf(path) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function linkOf(s) {
  return s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) };
}

function cardOf(s) {
  return { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date), summary: s.data.summary ?? '', excerpt: s.excerpt, reading_minutes: s.readingMinutes, tags: s.tagLinks };
}

function pageOf(s) {
  return { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date), summary: s.data.summary ?? '', excerpt: s.excerpt, reading_minutes: s.readingMinutes, tags: s.tagLinks, slug: s.slug, content: s.html, toc: s.toc, newer: linkOf(s.newer ?? null), older: linkOf(s.older ?? null), is_post: s.post };
}

function tagOf(b, t) {
  return { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map(p => b.cards.get(p)) };
}

function build(input) {
  const templates = new Map();
  const report = [];
  for (const nama of Object.keys(input.templates).sort()) {
    try { templates.set(nama, parseTemplate(nama, input.templates[nama])); }
    catch (err) { if (!(err instanceof TemplateError)) throw err; report.push(err.message); }
  }
  const b = { input, base: input.site.base_url.replace(/\/+$/, ''), templates, sources: [], statics: [], bySource: new Map(), broken: new Set(), report, posts: [], tags: [], cards: new Map(), output: {} };

  // 1. Sources
  const files = [...input.files].sort((x, y) => x.path < y.path ? -1 : x.path > y.path ? 1 : 0);
  for (const f of files) {
    if (f.path.endsWith('.md')) b.sources.push({ path: f.path, text: f.content.indexOf('\r') === -1 ? f.content : f.content.replace(CR_RE, '\n') });
    else b.statics.push({ path: f.path, content: f.content });
  }

  // 2. Front matter
  const kept = [];
  for (const s of b.sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) { b.report.push(`refused ${s.path}: ${fm.error}`); continue; }
    s.data = fm.data; s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = RESERVED.find(d => d !== 'posts' && s.path.startsWith(d + '/'));
    if (own !== undefined) { b.report.push(`refused ${s.path}: ${own}/ is the generator's own`); continue; }
    if (s.post && !Object.hasOwn(s.data, 'date')) { b.report.push(`refused ${s.path}: a post needs a date`); continue; }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!b.templates.has(layout)) { b.report.push(`refused ${s.path}: layout "${layout}" is no template that parses`); continue; }
    s.layout = layout;
    if (s.data.draft === true) { b.report.push(`draft ${s.path}`); continue; }
    kept.push(s);
  }
  b.sources = kept;

  // 3. Permalink
  const taken = new Map();
  const takenIn = dir => { if (!taken.has(dir)) taken.set(dir, new Set(dir === '' ? RESERVED : [])); return taken.get(dir); };
  for (const s of b.sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), takenIn(dir));
    s.slug = slug;
    s.outDir = dir === '' ? slug : dir + '/' + slug;
    s.url = b.base + '/' + s.outDir + '/';
    b.bySource.set(s.path, s);
  }

  // 4. Markdown
  const staticPaths = new Set(b.statics.map(f => f.path));
  for (const s of b.sources) {
    const dir = dirOf(s.path);
    const env = { link: target => {
      if (SCHEME_RE.test(target) || target.startsWith('/') || target.startsWith('#')) return target;
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const frag = hash === -1 ? '' : target.slice(hash);
      const path = rel === '' ? null : resolvePath(dir, rel);
      if (path !== null && b.bySource.has(path)) return b.bySource.get(path).url + frag;
      if (path !== null && staticPaths.has(path)) return b.base + '/' + path + frag;
      b.broken.add(`broken-link ${s.path} -> ${target}`);
      return target;
    } };
    const md = renderMarkdown(s.body, env);
    s.html = md.html; s.toc = md.toc; s.excerpt = md.excerpt;
    s.readingMinutes = Math.max(1, Math.ceil(wordsOf(s.body) / 200));
  }

  // 5. Koleksi
  const posts = b.sources.filter(s => s.post);
  posts.sort((x, y) => y.data.date < x.data.date ? -1 : y.data.date > x.data.date ? 1 : x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0);
  b.posts = posts;
  posts.forEach((p, k) => { p.newer = k === 0 ? null : posts[k - 1]; p.older = k === posts.length - 1 ? null : posts[k + 1]; });

  // 6. Tags (ownTags memanggil slugify sekali per nama)
  const bySlug = new Map();
  const ownTags = s => {
    const seen = new Set();
    const out = [];
    for (const nama of s.data.tags ?? []) {
      const slug = slugify(nama);
      if (!seen.has(slug)) { seen.add(slug); out.push(nama); }
    }
    return out;
  };
  for (const p of b.posts) {
    p.tagRefs = [];
    for (const nama of ownTags(p)) {
      const slug = slugify(nama);
      if (!bySlug.has(slug)) bySlug.set(slug, { name: nama, slug, url: b.base + '/tags/' + slug + '/', posts: [] });
      const tag = bySlug.get(slug);
      tag.posts.push(p); p.tagRefs.push(tag);
    }
  }
  for (const s of b.sources) {
    if (!s.post) s.tagRefs = ownTags(s).map(nama => bySlug.get(slugify(nama)) ?? { name: nama, slug: slugify(nama), url: '', posts: [] });
  }
  // tagLinks dihitung sekali per source (dipakai cardOf + pageOf); toc
  // dipakai langsung di pageOf karena entri toc sudah { level, id, html }.
  for (const s of b.sources) s.tagLinks = s.tagRefs.map(t => ({ name: t.name, slug: t.slug, url: t.url }));
  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));

  // 7. Layout
  b.cards = new Map(b.posts.map(p => [p, cardOf(p)]));
  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map(t => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map(p => b.cards.get(p));
  const ctx = { templates: b.templates, escape: escapeHtml };
  const baseScope = { vars: { site, tags: allTags, recent }, parent: null };
  const render = (nama, vars) => {
    const nodes = b.templates.get(nama);
    if (nodes === undefined) return null;
    const parts = [];
    renderNodes(nodes, { vars, parent: baseScope }, ctx, 0, parts);
    return parts.join('');
  };
  for (const s of b.sources) b.output[s.outDir + '/index.html'] = render(s.layout, { page: pageOf(s) });
  const per = b.input.site.per_page;
  const pages = Math.max(1, Math.ceil(b.posts.length / per));
  const indexUrl = k => k === 1 ? b.base + '/' : b.base + '/page/' + k + '/';
  for (let k = 1; k <= pages; k++) {
    const html = render('index', { posts: b.posts.slice((k - 1) * per, k * per).map(p => b.cards.get(p)), pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) } });
    if (html !== null) b.output[k === 1 ? 'index.html' : 'page/' + k + '/index.html'] = html;
  }
  for (const t of b.tags) {
    const html = render('tag', { tag: tagOf(b, t) });
    if (html !== null) b.output['tags/' + t.slug + '/index.html'] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) b.output['tags/index.html'] = tagsHtml;
  for (const f of b.statics) {
    if (Object.hasOwn(b.output, f.path)) b.report.push(`shadowed ${f.path}: a built page has its path`);
    else b.output[f.path] = f.content;
  }

  // 8. Report
  const lines = [...b.report, ...b.broken].sort();
  const pageCount = b.sources.length - b.posts.length;
  lines.push(`built ${pageCount} pages, ${b.posts.length} posts, ${b.tags.length} tags and ${b.statics.length} static files`);
  b.output[REPORT_FILE] = lines.join('\n') + '\n';
  return b.output;
}

export function run(input) { return build(input); }
