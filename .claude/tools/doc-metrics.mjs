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
    const body = b.lines.filter((l) => l.trim());
    if (!body.length) continue;
    if (body.some((l) => /[├└│]/.test(l)) || body.filter((l) => /^\s*[\w.-]+\/\s*$/.test(l)).length >= 3) {
      unnecessary.push({ kind: "file-tree", line: b.start, quote: (body[0] || "").trim().slice(0, 160), truncated: false, source: "script" });
    } else if (body.every((l) => /^\s*(#|\$)?\s*(npm|pnpm|yarn|bun|cd|git clone|nvm|node)\b/.test(l))) {
      unnecessary.push({ kind: "install-boilerplate", line: b.start, quote: body.join(" ").trim().slice(0, 160), truncated: body.join(" ").length > 160, source: "script" });
    }
  }
  for (let n = 1; n <= lines.length; n++) {
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
