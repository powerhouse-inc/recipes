#!/usr/bin/env node
// Deterministic measurement pass for doc-readability-judge.
//
// Owns everything in the rubric that can be counted rather than judged:
// sentence mechanics (scored authoritatively here), the LLM-tell phrase list,
// and candidate extraction for the dimensions a model still has to adjudicate.
//
//   node .claude/tools/doc-metrics.mjs <file.md> [--pretty]
//
// Prints one JSON object to stdout. Never edits anything.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const CAP = 20; // max candidates reported per list

// ---------------------------------------------------------------- extraction

// Split the file into prose segments, each carrying the source line it starts
// on so every finding can quote verbatim from the original text.
function extract(raw) {
  const lines = raw.split("\n");
  const segments = []; // { kind, pieces: [{ line, text }] }
  const codeBlocks = []; // { start, end, lines }
  let i = 0;

  // YAML frontmatter
  if (lines[0] !== undefined && lines[0].trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i].trim() !== "---") i++;
    i++;
  }

  let inComment = false;
  let para = null;
  const flush = () => {
    if (para && para.pieces.length) segments.push(para);
    para = null;
  };

  for (; i < lines.length; i++) {
    const raws = lines[i];
    const lineNo = i + 1;
    const trimmed = raws.trim();

    if (inComment) {
      if (trimmed.includes("-->")) inComment = false;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      if (!trimmed.includes("-->")) inComment = true;
      continue;
    }

    // Fenced code: recorded, never counted as prose.
    const fence = trimmed.match(/^(```|~~~)/);
    if (fence) {
      flush();
      const marker = fence[1];
      const start = lineNo;
      const body = [];
      i++;
      for (; i < lines.length; i++) {
        if (lines[i].trim().startsWith(marker)) break;
        body.push(lines[i]);
      }
      codeBlocks.push({ start, end: i + 1, lines: body });
      continue;
    }

    if (trimmed === "") { flush(); continue; }
    if (/^\s*([-*_]\s*){3,}$/.test(raws)) { flush(); continue; } // hr

    // Heading
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      segments.push({ kind: "heading", pieces: [{ line: lineNo, text: strip(h[2]) }] });
      continue;
    }

    // Table row: each prose-bearing cell is its own segment.
    if (/^\s*\|/.test(raws) && raws.includes("|")) {
      flush();
      if (/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(raws)) continue; // separator row
      for (const cell of raws.split("|").slice(1, -1)) {
        const text = strip(cell).trim();
        if (!text) continue;
        if (!/\s/.test(text)) continue; // identifier-only cell
        segments.push({ kind: "cell", pieces: [{ line: lineNo, text }] });
      }
      continue;
    }

    // List item
    const li = trimmed.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      segments.push({ kind: "item", pieces: [{ line: lineNo, text: strip(li[2]) }] });
      continue;
    }

    // Blockquote and plain paragraph lines accumulate.
    const text = strip(trimmed.replace(/^>\s?/, ""));
    if (!para) para = { kind: "para", pieces: [] };
    para.pieces.push({ line: lineNo, text });
  }
  flush();
  return { segments, codeBlocks, lines };
}

// Remove everything the rubric says not to measure. Inline code collapses to a
// single token so it still counts as one word.
function strip(s) {
  return s
    .replace(/`[^`]*`/g, " CODE ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------- sentences

const ABBREV = new Set([
  "e.g", "i.e", "etc", "vs", "cf", "al", "approx", "fig", "no", "inc", "ltd",
  "dr", "mr", "mrs", "ms", "st", "jr", "sr", "ca", "vol", "ch", "sec", "eq",
  "ref", "esp", "ie", "eg", "resp", "dept",
]);

function countWords(text) {
  return (text.match(/[^\s]+/g) || []).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

// Sentences within one segment. Returns [{ text, words, line }].
function sentencesOf(seg) {
  const offsets = [];
  let joined = "";
  for (const p of seg.pieces) {
    offsets.push({ at: joined.length, line: p.line });
    joined += (joined ? " " : "") + p.text;
  }
  const lineAt = (off) => {
    let line = offsets.length ? offsets[0].line : 1;
    for (const o of offsets) if (o.at <= off) line = o.line;
    return line;
  };

  const out = [];
  let start = 0;
  const re = /[.!?]+["')\]]*(\s+)(?=[A-Z"'([])/g;
  let m;
  while ((m = re.exec(joined)) !== null) {
    const before = joined.slice(start, m.index);
    const lastWord = (before.match(/(\S+)$/) || [, ""])[1].toLowerCase().replace(/[^a-z.]/g, "");
    if (ABBREV.has(lastWord.replace(/\.$/, ""))) continue;
    const text = joined.slice(start, m.index + m[0].length - m[1].length).trim();
    if (text) out.push({ text, words: countWords(text), line: lineAt(start) });
    start = re.lastIndex;
  }
  const tail = joined.slice(start).trim();
  if (tail) out.push({ tail: true, text: tail, words: countWords(tail), line: lineAt(start) });
  return out;
}

// ---------------------------------------------------------------- detectors

const TELLS = [
  ["not-just-x-its-y", /\bnot just\b[^.!?]{0,70}\bit'?s\b/i],
  ["not-about-x-about-y", /\bit'?s not about\b[^.!?]{0,70}\babout\b/i],
  ["delve", /\bdelv(e|es|ed|ing)\b/i],
  ["dive-in", /\bdiv(e|es|ing)\s+(in|into)\b/i],
  ["seamless", /\bseamless(ly)?\b/i],
  ["robust", /\brobust\b/i],
  ["leverage-verb", /\bleverag(e|es|ed|ing)\b/i],
  ["harness", /\bharness(es|ed|ing)?\b/i],
  ["unlock", /\bunlock(s|ed|ing)?\b/i],
  ["elevate", /\belevat(e|es|ed|ing)\b/i],
  ["streamline", /\bstreamlin(e|es|ed|ing)\b/i],
  ["cutting-edge", /\bcutting[- ]edge\b/i],
  ["game-changing", /\bgame[- ]chang\w*/i],
  ["fast-paced", /\bin today'?s\b|\bfast[- ]paced\b/i],
  ["landscape-metaphor", /\blandscape\b/i],
  ["comprehensive-guide", /\bcomprehensive guide\b/i],
  ["best-in-class", /\bbest[- ]in[- ]class\b/i],
  ["chat-opener", /^\s*(certainly|great question|absolutely)[!,.]/i],
  ["lets-explore", /\blet'?s (explore|take a look|walk through|dive)\b/i],
  ["by-following-these", /\bby following these steps\b/i],
  ["important-to-consider", /\bwhile\b[^.!?]{0,60}\bit'?s important to (consider|note|remember)\b/i],
  ["remember-callout", /^\s*\*{0,2}remember:?\*{0,2}\s/i],
];
// Tells whose plain-English sense is common enough that a model confirms them.
const TELLS_SOFT = new Set(["landscape-metaphor", "harness", "unlock"]);

const LOADED = [
  "powerful", "elegant", "simple", "simply", "just", "easy", "easily",
  "intuitive", "clean", "blazing", "lightweight", "obviously", "trivially",
  "beautiful", "amazing", "effortless", "painless", "straightforward",
];
const LOADED_PHRASES = [
  ["of-course", /\bof course\b/i],
  ["all-you-need", /\ball you (need to do|have to do)\b/i],
  ["production-ready", /\bproduction[- ]ready\b/i],
];

const HEDGES = [
  ["worth-noting", /\bit'?s worth noting\b/i],
  ["note-that", /\bnote that\b/i],
  ["as-mentioned", /\bas mentioned (above|earlier|previously)\b/i],
  ["in-order-to", /\bin order to\b/i],
  ["generally", /\bgenerally\b/i],
  ["typically", /\btypically\b/i],
  ["basically", /\bbasically\b/i],
  ["essentially", /\bessentially\b/i],
  ["simply-put", /\bsimply put\b/i],
  ["needless-to-say", /\bneedless to say\b/i],
  ["that-said", /\bthat said\b/i],
];

const CLAIM_VERBS = /\b(handles?|supports?|ensures?|guarantees?|manages?|provides?|scales?|prevents?|validates?|optimiz\w+|integrates?|works with)\b/i;
const ACRONYM_STOP = new Set([
  "HTTP", "HTTPS", "JSON", "CLI", "SQL", "URL", "URI", "API", "UI", "ID", "IDE",
  "OS", "CI", "CD", "TODO", "NOTE", "MIT", "YAML", "TOML", "CSV", "HTML", "CSS",
  "REST", "RPC", "TCP", "DNS", "UTC", "ISO", "PR", "OK", "AND", "OR", "NOT",
  "A", "I",
]);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

// ---------------------------------------------------------------- analysis

// -------------------------------------------------------------------- shape

// Document shape: the budgets a reader feels as "too long" before they notice
// any sentence-level problem. A section that carries six key concepts has no
// key concepts, and a list of eight one-paragraph bullets is a document that
// never decided what mattered. Scored here so two runs cannot disagree.
//
// These numbers are editorial. They are calibrated against the tight end of
// this collection (discord-webhook-processor 105w, subscription-cli 170w,
// audit-trail 253w) rather than its median, because the median is the problem.
//
// They assume a guide or an index page, which is every document in this repo.
// A reference (an API surface, a config table) is legitimately longer and its
// list caps do not apply; the judge treats a shape finding against a reference
// as the routine decline. Retune here if this script is pointed at one.
const BUDGET = {
  doc: 400,      // whole-document prose words
  preamble: 60,  // title to the first heading: what this is, in a breath
  lead: 80,      // the first section, usually "What it demonstrates"
  section: 120,  // any other single section
  list: 4,       // items in an ordinary list
  keyList: 3,    // items in a list whose heading calls them key or core
  item: 40,      // words in one list item
};

// A heading that promises the reader a short, curated set.
const KEY_LIST = /\b(key|core|essential|main|primary|principles?|concepts?)\b/i;

// Sections the repository itself answers. LICENSE, package.json, and the root
// README carry these; a per-recipe copy is duplication that rots. These are
// never load-bearing, so they drive the score.
const BOILERPLATE =
  /^(licen[cs]e|installation|install|getting started|contributing|regenerat\w*)\b/i;

// Sections that are usually boilerplate but sometimes carry the one constraint
// a reader cannot run without (a required Postgres, a Docker daemon). Reported
// for the model to adjudicate under unnecessary-data; they do not move the score.
const BOILERPLATE_SOFT = /^(prerequisites?|requirements?|setup)\b/i;

function shapeOf(lines, codeBlocks, quoteOf) {
  const fenced = new Set();
  for (const b of codeBlocks) for (let n = b.start; n <= b.end; n++) fenced.add(n);

  // YAML frontmatter is not prose, and extract() already drops it.
  let bodyStart = 0;
  if (lines[0] !== undefined && lines[0].trim() === "---") {
    let j = 1;
    while (j < lines.length && lines[j].trim() !== "---") j++;
    if (j < lines.length) bodyStart = j + 1;
  }

  // Walk the file into sections, counting only prose the rubric measures.
  const sections = [];
  let cur = { title: "(preamble)", line: 1, level: 0, words: 0, items: [], lists: [] };
  let run = null; // current consecutive run of list items

  const closeRun = () => { if (run && run.count) cur.lists.push(run); run = null; };

  for (let i = bodyStart; i < lines.length; i++) {
    const n = i + 1;
    if (fenced.has(n)) { closeRun(); continue; }
    const raw = lines[i];
    const t = raw.trim();

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeRun();
      if (h[1].length === 1) continue; // the document title is not a section
      sections.push(cur);
      cur = { title: strip(h[2]).trim(), line: n, level: h[1].length, words: 0, items: [], lists: [] };
      continue;
    }

    const li = t.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const w = countWords(strip(li[2]));
      cur.words += w;
      cur.items.push({ line: n, words: w });
      if (!run) run = { line: n, count: 0, widest: 0 };
      run.count++;
      run.widest = Math.max(run.widest, w);
      continue;
    }

    if (t === "") { closeRun(); continue; }
    cur.words += countWords(strip(t.replace(/^>\s?/, "")));
  }
  closeRun();
  sections.push(cur);

  const findings = [];
  const push = (line, why, fix, severity = "major") =>
    findings.push({ severity, line, ...quoteOf(line), source: "script", why, fix });

  const words = sections.reduce((a, s) => a + s.words, 0);
  const real = sections.filter((s) => s.level > 0);
  const preamble = sections.find((s) => s.level === 0) || { words: 0, line: 1 };
  const lead = real[0];

  // --- length bands
  const band = (v, cuts) => { for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]) return 5 - i; return 0; };

  const sDoc = band(words, [BUDGET.doc, 550, 700, 900, 1200]);
  if (words > BUDGET.doc) {
    push(1, `Document runs ${words} prose words against a ${BUDGET.doc}-word budget.`,
      `Cut ${words - BUDGET.doc} words. Take them from the longest section first, not evenly.`,
      words > 700 ? "blocker" : "major");
  }

  const sPre = band(preamble.words, [BUDGET.preamble, 90, 130, 180, 250]);
  if (preamble.words > BUDGET.preamble) {
    push(preamble.line, `Opening runs ${preamble.words} words before the first heading (budget ${BUDGET.preamble}).`,
      "Say what this is and what it needs in one or two sentences. The detail belongs in a section.");
  }

  let sLead = 5;
  if (lead) {
    sLead = band(lead.words, [BUDGET.lead, 130, 190, 260, 350]);
    if (lead.words > BUDGET.lead) {
      push(lead.line, `The lead section "${lead.title}" runs ${lead.words} words (budget ${BUDGET.lead}).`,
        "This section orients the reader; it is not the documentation. A few lines, then let the sections carry it.",
        lead.words > 190 ? "blocker" : "major");
    }
  }

  let sSection = 5;
  for (const s of real) {
    if (s === lead) continue;
    const band1 = band(s.words, [BUDGET.section, 180, 240, 320, 420]);
    sSection = Math.min(sSection, band1);
    if (s.words > BUDGET.section) {
      push(s.line, `Section "${s.title}" runs ${s.words} words (budget ${BUDGET.section}).`,
        "Split it, or cut what the reader does not need to run and understand the recipe.");
    }
  }

  // --- list discipline
  let sList = 5;
  for (const s of real.concat([preamble])) {
    const keyed = KEY_LIST.test(s.title || "");
    const capItems = keyed ? BUDGET.keyList : BUDGET.list;
    for (const l of s.lists || []) {
      sList = Math.min(sList, band(l.count, [capItems, capItems + 2, capItems + 4, capItems + 6, capItems + 9]));
      if (l.count > capItems) {
        push(l.line,
          keyed
            ? `"${s.title}" lists ${l.count} items. More than ${capItems} and none of them is key.`
            : `List of ${l.count} items (budget ${capItems}).`,
          keyed
            ? `Keep the ${capItems} a reader cannot work without. Fold or drop the rest.`
            : "Cut to the items that change what the reader does.",
          l.count > capItems + 2 ? "blocker" : "major");
      }
      if (l.widest > BUDGET.item) {
        sList = Math.min(sList, 3);
        push(l.line, `Longest item in this list runs ${l.widest} words (budget ${BUDGET.item}).`,
          "A bullet that needs a paragraph is a section, or it is padding.", "minor");
      }
    }
  }

  // --- sections the repo already answers
  const boiler = real.filter((s) => BOILERPLATE.test(s.title || ""));
  // One is enough to gate. These sections are never load-bearing, so a document
  // carrying even one has not been finished, however good the rest of it is.
  const sBoiler = band(boiler.length, [0, 0, 1, 2, 3]);
  for (const s of boiler) {
    push(s.line, `"${s.title}" is a section the repository already answers.`,
      "Delete it. LICENSE, package.json, and the root README carry this, and a copy here rots.",
      "major");
  }

  // Soft: reported, never scored. The model decides whether this one is the
  // constraint the recipe genuinely cannot run without.
  const boilerSoft = real.filter((s) => BOILERPLATE_SOFT.test(s.title || ""));
  for (const s of boilerSoft) {
    push(s.line, `"${s.title}" is boilerplate unless it names a constraint specific to this recipe.`,
      "Keep it only if it names something the reader must have and would not guess. Otherwise fold it into the run step.",
      "minor");
  }

  const RANK = { blocker: 0, major: 1, minor: 2 };
  const ranked = findings
    .slice()
    .sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || (a.line - b.line));

  const score = Math.min(sDoc, sPre, sLead, sSection, sList, sBoiler);
  return {
    score,
    subScores: { documentLength: sDoc, preamble: sPre, leadSection: sLead, sections: sSection, lists: sList, boilerplate: sBoiler },
    metrics: {
      proseWords: words,
      sectionCount: real.length,
      preambleWords: preamble.words,
      leadSectionWords: lead ? lead.words : 0,
      longestSectionWords: real.reduce((a, s) => Math.max(a, s.words), 0),
      longestListItems: real.concat([preamble]).reduce((a, s) => Math.max(a, ...(s.lists || []).map((l) => l.count), 0), 0),
      boilerplateSections: boiler.map((s) => s.title),
      boilerplateCandidates: boilerSoft.map((s) => s.title),
    },
    budgets: BUDGET,
    // Sort before truncating: a blocker produced late in the walk (an oversized
    // list, a boilerplate section) must not be dropped for an earlier minor.
    findings: ranked.slice(0, 8),
    findingsTruncated: ranked.length > 8,
  };
}

function analyze(path) {
  const raw = readFileSync(path, "utf8");
  const { segments, codeBlocks, lines } = extract(raw);

  const quoteOf = (line) => {
    const t = (lines[line - 1] || "").trim();
    return t.length > 160
      ? { quote: t.slice(0, 160), truncated: true }
      : { quote: t, truncated: false };
  };

  // --- counts
  let words = 0;
  const sentences = [];
  for (const seg of segments) {
    for (const p of seg.pieces) words += countWords(p.text);
    if (seg.kind === "heading") continue;
    sentences.push(...sentencesOf(seg));
  }

  const proseByLine = new Map();
  for (const seg of segments) {
    for (const p of seg.pieces) {
      proseByLine.set(p.line, (proseByLine.get(p.line) || "") + " " + p.text);
    }
  }
  const allProse = [...proseByLine.values()].join(" ");

  const emDashes = (allProse.match(/—/g) || []).length + (allProse.match(/(^|\s)--(\s|$)/g) || []).length;
  const enDashes = (allProse.match(/–/g) || []).length;
  const semicolons = (allProse.match(/;/g) || []).length;
  const long = sentences.filter((s) => s.words > 35);
  const longest = sentences.reduce((a, s) => Math.max(a, s.words), 0);
  const per100 = words ? +((emDashes / words) * 100).toFixed(2) : 0;

  // --- sentence-mechanics score: lowest of the three columns
  const band = (v, cuts) => { for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]) return 5 - i; return 0; };
  let sDash = band(per100, [0.5, 1.0, 2.0, 3.0, 4.0]);
  let sSemi = band(semicolons, [0, 1, 2, 4, 6]);
  let sLong = band(long.length, [0, 1, 3, 5, 8]);
  if (longest > 50) sLong = Math.min(sLong, 2);
  if (longest > 60) sLong = Math.min(sLong, 1);
  const mechScore = Math.min(sDash, sSemi, sLong);

  const mechFindings = [];
  for (const s of long.sort((a, b) => b.words - a.words).slice(0, 8)) {
    mechFindings.push({
      severity: "minor", line: s.line, ...quoteOf(s.line), source: "script",
      why: `Sentence runs ${s.words} words (limit 35).`,
      fix: "Split at the natural clause boundary.",
      sentenceWords: s.words,
    });
  }
  for (const [line, text] of proseByLine) {
    if (text.includes(";")) {
      mechFindings.push({
        severity: "minor", line, ...quoteOf(line), source: "script",
        why: "Semicolon in prose.", fix: "Use a period, or a comma with a conjunction.",
      });
    }
  }

  // --- llm-tells (authoritative phrase hits + structural)
  const tells = [], tellsSoft = [];
  for (const [line, text] of proseByLine) {
    for (const [id, re] of TELLS) {
      const m = text.match(re);
      if (!m) continue;
      const hit = { id, line, match: m[0].trim(), ...quoteOf(line), source: "script" };
      (TELLS_SOFT.has(id) ? tellsSoft : tells).push(hit);
    }
  }
  for (const seg of segments) {
    if (seg.kind !== "heading") continue;
    const line = seg.pieces[0].line;
    if (EMOJI.test(lines[line - 1])) {
      tells.push({ id: "emoji-heading", line, match: "emoji in heading", ...quoteOf(line), source: "script" });
    }
  }
  // A run of >=3 consecutive list items all opening with a bolded lead.
  let run = [];
  const closeRun = () => {
    if (run.length >= 3 && run.every((r) => r.bold)) {
      tells.push({
        id: "uniform-bolded-bullets", line: run[0].line,
        match: `${run.length} consecutive bullets with bolded leads`,
        ...quoteOf(run[0].line), source: "script",
      });
    }
    run = [];
  };
  let prevItemLine = -2;
  for (const seg of segments) {
    if (seg.kind !== "item") { closeRun(); continue; }
    const line = seg.pieces[0].line;
    if (line > prevItemLine + 2) closeRun();
    run.push({ line, bold: /^\s*([-*+]|\d+[.)])\s+\*\*/.test(lines[line - 1]) });
    prevItemLine = line;
  }
  closeRun();

  // --- candidate lists for model adjudication
  const loaded = [];
  for (const [line, text] of proseByLine) {
    for (const w of LOADED) {
      if (new RegExp(`\\b${w}\\b`, "i").test(text)) {
        loaded.push({ term: w, line, ...quoteOf(line), source: "script" });
      }
    }
    for (const [id, re] of LOADED_PHRASES) {
      if (re.test(text)) loaded.push({ term: id, line, ...quoteOf(line), source: "script" });
    }
  }

  const hedges = [];
  for (const [line, text] of proseByLine) {
    for (const [id, re] of HEDGES) {
      if (re.test(text)) hedges.push({ term: id, line, ...quoteOf(line), source: "script" });
    }
  }

  const acronyms = [];
  const seenAcr = new Map();
  for (const [line, text] of proseByLine) {
    for (const tok of text.match(/\b[A-Z][A-Z0-9]{1,}\b/g) || []) {
      if (ACRONYM_STOP.has(tok) || tok === "CODE") continue;
      if (seenAcr.has(tok)) { seenAcr.get(tok).uses++; continue; }
      const ctx = [lines[line - 2], lines[line - 1], lines[line]].join(" ");
      const entry = {
        term: tok, firstUseLine: line, uses: 1,
        linkedNearby: /\]\(/.test(ctx),
        definedNearby: new RegExp(`${tok}\\b[^.]{0,20}\\b(is|are|means|refers to|stands for)\\b`, "i").test(ctx),
        ...quoteOf(line), source: "script",
      };
      seenAcr.set(tok, entry);
      acronyms.push(entry);
    }
  }

  const unnecessary = [];
  for (const b of codeBlocks) {
    // Report the first non-blank body line and the line it actually sits on, so
    // the quote is verbatim at the number given (rules 2 and 3).
    const k = b.lines.findIndex((l) => l.trim());
    if (k < 0) continue;
    const body = b.lines.filter((l) => l.trim());
    const firstLine = b.start + 1 + k;
    const firstText = b.lines[k].trim();

    if (body.some((l) => /[├└│]/.test(l)) || body.filter((l) => /^\s*[\w.-]+\/\s*$/.test(l)).length >= 3) {
      unnecessary.push({ kind: "file-tree", line: firstLine, quote: firstText.slice(0, 160), truncated: firstText.length > 160, source: "script" });
    } else if (
      // Every line is a package-manager or shell invocation...
      body.every((l) => /^\s*(#|\$)?\s*(npm|pnpm|yarn|bun|cd|git clone|nvm|node)\b/.test(l)) &&
      // ...and at least one is actually setup. A block of `pnpm start` or
      // `pnpm test` is the recipe's run command, not install boilerplate.
      body.some((l) => /\b(install|add|ci|clone|cd|nvm\s+use)\b/.test(l))
    ) {
      unnecessary.push({ kind: "install-boilerplate", line: firstLine, quote: firstText.slice(0, 160), truncated: firstText.length > 160, source: "script" });
    }
  }

  // Raw-line candidates must skip fenced content: rule 5 forbids a finding drawn
  // from inside a code block, and a `|` row or a heading can appear in one.
  const fencedLines = new Set();
  for (const b of codeBlocks) for (let n = b.start; n <= b.end; n++) fencedLines.add(n);

  for (let n = 1; n <= lines.length; n++) {
    if (fencedLines.has(n)) continue;
    const t = lines[n - 1];
    if (/^\s*(#+\s*)?\**prerequisites\b/i.test(t)) {
      unnecessary.push({ kind: "prerequisites", line: n, ...quoteOf(n), source: "script" });
    }
    if ((t.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length >= 2 || /shields\.io|badge\.fury|img\.shields/.test(t)) {
      unnecessary.push({ kind: "badges", line: n, ...quoteOf(n), source: "script" });
    }
    if (/^\s*\|/.test(t) && /\bversions?\b/i.test(t) && /\|.*\|/.test(t) && /^\s*\|[^|]*\|/.test(t) && /compat|support|version/i.test(t)) {
      unnecessary.push({ kind: "version-matrix", line: n, ...quoteOf(n), source: "script" });
    }
  }

  const unanchored = [];
  for (const s of sentences) {
    if (s.words < 8 || !CLAIM_VERBS.test(s.text)) continue;
    const src = lines[s.line - 1] || "";
    if (/`|\]\(|\.(ts|js|tsx|mjs|json|md|sql)\b|\//.test(src)) continue;
    unanchored.push({ line: s.line, ...quoteOf(s.line), words: s.words, source: "script" });
  }

  const shape = shapeOf(lines, codeBlocks, quoteOf);

  const cap = (arr) => ({ items: arr.slice(0, CAP), total: arr.length, truncated: arr.length > CAP });

  return {
    file: basename(path),
    path,
    generatedBy: "doc-metrics.mjs",
    metrics: {
      words, sentences: sentences.length, emDashes, enDashes, semicolons,
      emDashesPer100Words: per100,
      sentencesOver35Words: long.length, longestSentenceWords: longest,
      codeBlocks: codeBlocks.length,
    },
    authoritative: {
      "document-shape": shape,
      "sentence-mechanics": {
        score: mechScore,
        subScores: { emDashDensity: sDash, semicolons: sSemi, longSentences: sLong },
        metrics: { emDashes, emDashesPer100Words: per100, semicolons, sentencesOver35Words: long.length, longestSentenceWords: longest },
        findings: mechFindings.slice(0, 8),
        findingsTruncated: mechFindings.length > 8,
      },
      "llm-tells": { count: tells.length, hits: cap(tells) },
    },
    candidates: {
      "llm-tells-soft": cap(tellsSoft),
      "loaded-language": cap(loaded),
      "brevity-hedges": cap(hedges),
      "undefined-terms": cap(acronyms.filter((a) => !a.definedNearby)),
      "unnecessary-data": cap(unnecessary),
      "claim-grounding": cap(unanchored),
    },
  };
}

const args = process.argv.slice(2);
const pretty = args.includes("--pretty");
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("usage: doc-metrics.mjs <file.md> [--pretty]");
  process.exit(2);
}
process.stdout.write(JSON.stringify(analyze(target), null, pretty ? 2 : 0) + "\n");
