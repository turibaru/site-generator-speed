// Bagian 1: util teks + front matter

function byCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESCAPE_RE = /[&<>"']/g;

function escapeHtml(text) {
  if (text.indexOf('&') === -1 && text.indexOf('<') === -1 && text.indexOf('>') === -1 && text.indexOf('"') === -1 && text.indexOf("'") === -1) return text;
  return text.replace(ESCAPE_RE, c => ESCAPE_MAP[c]);
}

const slugCache = new Map();

function slugify(text) {
  const hit = slugCache.get(text);
  if (hit !== undefined) return hit;
  let ascii = true;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) >= 128) { ascii = false; break; }
  const plain = ascii ? text : text.normalize('NFKD').replace(/\p{M}/gu, '');
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

function longDate(date) {
  const p = date.split('-');
  const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return Number(p[2]) + ' ' + m[Number(p[1]) - 1] + ' ' + p[0];
}

function wordsOf(text) {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let ws;
    if (c < 128) ws = c === 32 || (c >= 9 && c <= 13);
    else ws = c === 0xA0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200A) || c === 0x2028 || c === 0x2029 || c === 0x202F || c === 0x205F || c === 0x3000 || c === 0xFEFF;
    if (ws) inWord = false;
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
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
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
    for (const t of parts) if (t === '' || /["[\]]/.test(t)) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
    return { value: parts };
  }
  if (k === 'draft') {
    if (raw === 'true') return { value: true };
    if (raw === 'false') return { value: false };
    return { error: 'key "draft": true or false' };
  }
  if (k === 'layout') {
    if (/^[a-z0-9-]+$/.test(raw)) return { value: raw };
    return { error: 'key "layout": not a template name' };
  }
  if (k === 'slug') {
    if (raw.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) return { value: raw };
    return { error: 'key "slug": not a slug' };
  }
  return { error: 'unknown key "' + k + '"' };
}

function parseFrontMatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { error: 'no front matter' };
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') { end = i; break; }
  if (end === -1) return { error: 'the front matter is not closed' };
  const data = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (/^[ \t]*$/.test(line) || line.startsWith('#')) continue;
    const m = /^([a-z_]+):(?: (.*))?$/.exec(line);
    if (!m) return { error: 'line ' + (i + 1) + ' is not "key: value"' };
    const key = m[1];
    const raw = (m[2] ?? '').replace(/[ \t]+$/, '');
    if (!KEYS.includes(key)) return { error: 'unknown key "' + key + '"' };
    if (key in data) return { error: 'key "' + key + '" is given twice' };
    if (raw === '') return { error: 'key "' + key + '" has no value' };
    const r = valueOf(key, raw);
    if (r.error) return r;
    data[key] = r.value;
  }
  if (!('title' in data)) return { error: 'no title' };
  return { data, body: lines.slice(end + 1).join('\n') };
}

// === Bagian 2: Markdown ===

const BLANK = /^[ \t]*$/;
const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const QUOTE = /^>/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;

function headingOf(line) {
  const m = HEADING.exec(line);
  if (m === null || m[2] === '') return null;
  return { depth: m[1].length, text: m[2] };
}

function endsParagraph(line) {
  if (line === '') return true;
  const c0 = line[0];
  if (c0 === ' ' || c0 === '\t') return BLANK.test(line);
  if (c0 === '`') return FENCE_OPEN.test(line);
  if (c0 === '#') return headingOf(line) !== null;
  if (c0 === '-' || c0 === '*') return HR.test(line);
  return false;
}

function trimLine(line) {
  return line.replace(/^[ \t]+|[ \t]+$/g, '');
}

function lex(src) {
  const lines = src.split('\n');
  const tokens = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === '' || ((line[0] === ' ' || line[0] === '\t') && BLANK.test(line))) { i++; continue; }
    const fence = line[0] === '`' ? FENCE_OPEN.exec(line) : null;
    if (fence !== null) {
      const body = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      tokens.push({ type: 'code', lang: fence[1], lines: body });
      continue;
    }
    const heading = line[0] === '#' ? headingOf(line) : null;
    if (heading !== null) {
      tokens.push({ type: 'heading', depth: heading.depth, text: heading.text });
      i++;
      continue;
    }
    if ((line[0] === '-' || line[0] === '*') && HR.test(line)) {
      tokens.push({ type: 'hr' });
      i++;
      continue;
    }
    if (line[0] === '>' && QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) { body.push(lines[i].replace(/^> ?/, '')); i++; }
      tokens.push({ type: 'blockquote', lines: body.map(trimLine).filter(l => l !== '') });
      continue;
    }
    const bullet = (line[0] === '-' || line[0] === '*') ? BULLET.exec(line) : null;
    const ordered = bullet !== null ? null : (line[0] >= '0' && line[0] <= '9' ? ORDERED.exec(line) : null);
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const items = [];
      while (i < lines.length) {
        const m = marker.exec(lines[i]);
        if (m !== null) {
          items.push([trimLine(isOrdered ? m[2] : m[1])]);
          i++;
        } else if (lines[i][0] === ' ' && lines[i][1] === ' ' && CONTINUED.test(lines[i])) {
          items[items.length - 1].push(trimLine(lines[i]));
          i++;
        } else break;
      }
      tokens.push({ type: 'list', ordered: isOrdered, start: isOrdered ? Number(ordered[1]) : 1, items: items.map(parts => parts.join('\n')) });
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < lines.length && !endsParagraph(lines[i])) { body.push(trimLine(lines[i++])); }
    tokens.push({ type: 'paragraph', text: body.join('\n') });
  }
  return tokens;
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

function findUnescaped(s, what, from) {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) { j++; continue; }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) { j++; continue; }
    if (s[j] !== '*') continue;
    if (s[j + 1] === '*') { j++; continue; }
    return j;
  }
  return -1;
}

function inline(s, env) {
  if (s.indexOf('\\') === -1 && s.indexOf('`') === -1 && s.indexOf('*') === -1 && s.indexOf('[') === -1) return escapeHtml(s);
  let out = '';
  let i = 0;
  while (i < s.length) {
    let j = s.length;
    let k = s.indexOf('\\', i); if (k !== -1 && k < j) j = k;
    k = s.indexOf('`', i); if (k !== -1 && k < j) j = k;
    k = s.indexOf('*', i); if (k !== -1 && k < j) j = k;
    k = s.indexOf('[', i); if (k !== -1 && k < j) j = k;
    if (j > i) out += escapeHtml(s.slice(i, j));
    if (j === s.length) break;
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      out += s[j + 1];
      i = j + 2;
    } else if (c === '`') {
      const m = s.indexOf('`', j + 1);
      if (m > j + 1) { out += `<code>${escapeHtml(s.slice(j + 1, m))}</code>`; i = m + 1; }
      else { out += '`'; i = j + 1; }
    } else if (c === '*') {
      if (s[j + 1] === '*') {
        const m = findUnescaped(s, '**', j + 2);
        if (m > j + 2) { out += `<strong>${inline(s.slice(j + 2, m), env)}</strong>`; i = m + 2; }
        else { out += '**'; i = j + 2; }
      } else {
        const m = findSingleStar(s, j + 1);
        if (m > j + 1) { out += `<em>${inline(s.slice(j + 1, m), env)}</em>`; i = m + 1; }
        else { out += '*'; i = j + 1; }
      }
    } else if (c === '[') {
      const k2 = findUnescaped(s, ']', j + 1);
      const m = (k2 !== -1 && s[k2 + 1] === '(') ? s.indexOf(')', k2 + 2) : -1;
      const target = m === -1 ? '' : s.slice(k2 + 2, m);
      if (target !== '' && !/\s/.test(target)) {
        out += `<a href="${escapeHtml(env.link(target))}">${inline(s.slice(j + 1, k2), env)}</a>`;
        i = m + 1;
      } else { out += '['; i = j + 1; }
    } else {
      out += c;
      i = j + 1;
    }
  }
  return out;
}

function renderMarkdown(src, env) {
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  for (const t of lex(src)) {
    if (t.type === 'heading') {
      const id = uniqueSlug(slugify(t.text), ids);
      const html = inline(t.text, env);
      blocks.push(`<h${t.depth} id="${id}">${html}</h${t.depth}>`);
      if (t.depth === 2 || t.depth === 3) toc.push({ level: t.depth, id, html });
    } else if (t.type === 'code') {
      const cls = t.lang === '' ? '' : ` class="language-${escapeHtml(t.lang)}"`;
      blocks.push(`<pre><code${cls}>${t.lines.length === 0 ? '' : t.lines.map(escapeHtml).join('\n') + '\n'}</code></pre>`);
    } else if (t.type === 'hr') {
      blocks.push('<hr>');
    } else if (t.type === 'blockquote') {
      if (t.lines.length === 0) blocks.push('<blockquote>\n</blockquote>');
      else blocks.push(`<blockquote>\n<p>${inline(t.lines.join('\n'), env)}</p>\n</blockquote>`);
    } else if (t.type === 'list') {
      const tag = t.ordered ? 'ol' : 'ul';
      const open = (t.ordered && t.start !== 1) ? `<ol start="${t.start}">` : `<${tag}>`;
      blocks.push(`${open}\n${t.items.map(item => `<li>${inline(item, env)}</li>`).join('\n') + '\n'}</${tag}>`);
    } else if (t.type === 'paragraph') {
      const html = inline(t.text, env);
      if (excerpt === null) excerpt = html;
      blocks.push(`<p>${html}</p>`);
    }
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

function renderNodes(nodes, scope, ctx, depth) {
  let out = '';
  for (const n of nodes) {
    if (n.kind === 'text') out += n.text;
    else if (n.kind === 'var') out += ctx.escape(textOf(lookup(scope, n.path)));
    else if (n.kind === 'raw') out += textOf(lookup(scope, n.path));
    else if (n.kind === 'if') {
      const v = truthy(lookup(scope, n.path));
      const branch = v !== n.not ? n.then : n.else;
      if (branch !== null) out += renderNodes(branch, scope, ctx, depth);
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
        out += renderNodes(n.body, child, ctx, depth);
      }
    } else if (n.kind === 'include') {
      const t = ctx.templates.get(n.name);
      if (t !== undefined && depth < INCLUDE_DEPTH) out += renderNodes(t, scope, ctx, depth + 1);
    }
  }
  return out;
}

const REPORT_FILE = 'build-report.txt';
const RESERVED = Object.freeze(['posts', 'tags', 'page']);

function resolvePath(dir, rel) {
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
  return { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date), summary: s.data.summary ?? '', excerpt: s.excerpt, reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)), tags: s.tagRefs.map(t => ({ name: t.name, slug: t.slug, url: t.url })) };
}

function pageOf(s) {
  return { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date), summary: s.data.summary ?? '', excerpt: s.excerpt, reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)), tags: s.tagRefs.map(t => ({ name: t.name, slug: t.slug, url: t.url })), slug: s.slug, content: s.html, toc: s.toc.map(h => ({ level: h.level, id: h.id, html: h.html })), newer: linkOf(s.newer ?? null), older: linkOf(s.older ?? null), is_post: s.post };
}

function tagOf(b, t) {
  return { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map(p => b.cards.get(p)) };
}

function build(input) {
  const templates = new Map();
  const report = [];
  for (const nama of Object.keys(input.templates).sort(byCodeUnits)) {
    try { templates.set(nama, parseTemplate(nama, input.templates[nama])); }
    catch (err) { if (!(err instanceof TemplateError)) throw err; report.push(err.message); }
  }
  const b = { input, base: input.site.base_url.replace(/\/+$/, ''), templates, sources: [], statics: [], bySource: new Map(), broken: new Set(), report, posts: [], tags: [], cards: new Map(), output: {} };

  // 1. Sources
  const files = [...input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  for (const f of files) {
    if (f.path.endsWith('.md')) b.sources.push({ path: f.path, text: f.content.replace(/\r\n?/g, '\n') });
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
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('/') || target.startsWith('#')) return target;
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
  }

  // 5. Koleksi
  const posts = b.sources.filter(s => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
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
  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));

  // 7. Layout
  b.cards = new Map(b.posts.map(p => [p, cardOf(p)]));
  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map(t => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map(p => b.cards.get(p));
  const ctx = { templates: b.templates, escape: escapeHtml };
  const render = (nama, vars) => {
    const nodes = b.templates.get(nama);
    return nodes === undefined ? null : renderNodes(nodes, { vars: { site, tags: allTags, recent, ...vars }, parent: null }, ctx, 0);
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
  const lines = [...b.report, ...b.broken].sort(byCodeUnits);
  const pageCount = b.sources.filter(s => !s.post).length;
  lines.push(`built ${pageCount} pages, ${b.posts.length} posts, ${b.tags.length} tags and ${b.statics.length} static files`);
  b.output[REPORT_FILE] = lines.join('\n') + '\n';
  return b.output;
}

export function run(input) { return build(input); }
