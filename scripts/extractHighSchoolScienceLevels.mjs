import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const OUTPUT = "src/data/high-school-science-achievement-levels.md";
const LEVELS = ["A", "B", "C", "D", "E"];
const CODE_PATTERN = /\[(?:10|12)[가-힣0-9-]+\]/g;
const CODE_MARKER_PATTERN = /@@CODE\{([^}]+)\}@@/g;
const LEVEL_MARKER_PATTERN = /@@LEVEL\{([ABCDE])\}@@/g;
const STANDARD_COLUMN_MAX_X = 170;
const LEVEL_COLUMN_MIN_X = 160;
const LEVEL_COLUMN_MAX_X = 205;
const DESCRIPTION_COLUMN_MIN_X = 170;

const SOURCES = [
  {
    name: "고등학교 과학과 공통과목",
    file: "raw-data/11. 과학과 성취수준.pdf",
    ranges: [
      [31, 36],
      [125, 129],
      [209, 210],
      [247, 248],
    ],
    expectedCount: 43,
  },
  {
    name: "고등학교 과학 계열 선택과목",
    file: "raw-data/14-2. 과학 계열(과학) 선택과목 성취수준 현장 보급본.pdf",
    ranges: [
      [27, 34],
      [77, 85],
      [131, 138],
      [181, 193],
      [245, 250],
      [309, 319],
      [365, 373],
      [419, 430],
      [481, 493],
    ],
    expectedCount: 266,
  },
];

const standardsBySource = [];

for (const source of SOURCES) {
  const standards = await extractSource(source);
  console.log(`Extracted ${standards.length} standards from ${source.name}`);

  if (standards.length !== source.expectedCount) {
    throw new Error(`Expected ${source.expectedCount} standards from ${source.name}, but extracted ${standards.length}.`);
  }

  standardsBySource.push({ source: source.name, standards });
}

const standards = standardsBySource.flatMap(({ source, standards: sourceStandards }) =>
  sourceStandards.map((standard) => ({ ...standard, source })),
);
const uniqueCodes = new Set(standards.map((standard) => standard.code));

if (standards.length !== 309) {
  throw new Error(`Expected 309 total standards, but extracted ${standards.length}.`);
}
if (uniqueCodes.size !== standards.length) {
  throw new Error(`Expected unique codes, but found ${standards.length - uniqueCodes.size} duplicates.`);
}
if (standards[0]?.code !== "[10통과1-01-01]") {
  throw new Error(`Unexpected first code: ${standards[0]?.code}`);
}
if (standards.at(-1)?.code !== "[12지실03-15]") {
  throw new Error(`Unexpected last code: ${standards.at(-1)?.code}`);
}

const markdown = buildMarkdown(standardsBySource);
const outputPath = resolve(OUTPUT);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown, "utf8");
console.log(`Wrote ${standards.length} standards to ${OUTPUT}`);

async function extractSource(source) {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(readFileSync(source.file)),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const pageTexts = [];
  const standardParts = new Map();
  let currentStandardCode = null;

  for (const pageNumber of expandRanges(source.ranges)) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const pageTokens = [];
    let hasSeenTableContent = false;
    let skipExplorationPrefix = false;

    for (const item of content.items) {
      const text = item.str.trim();
      if (!text) continue;

      if (text === "<탐구 활동>") {
        if (hasSeenTableContent) break;
        skipExplorationPrefix = true;
        continue;
      }
      if (skipExplorationPrefix) {
        if (text === "성취기준별 성취수준") {
          skipExplorationPrefix = false;
        }
        continue;
      }
      if (shouldSkipText(text)) continue;

      const x = item.transform[4];
      const y = item.transform[5];
      if (y < 70 || y > 650) continue;

      const code = text.match(CODE_PATTERN)?.[0];

      if (x < STANDARD_COLUMN_MAX_X) {
        if (code) {
          currentStandardCode = code;
          appendMapText(standardParts, currentStandardCode, text.slice(text.indexOf(code)));
          pageTokens.push(createCodeMarker(code));
          hasSeenTableContent = true;
          continue;
        }

        if (currentStandardCode && !isPageOrSectionLabel(text)) {
          appendMapText(standardParts, currentStandardCode, text);
        }
        continue;
      }

      if (LEVELS.includes(text) && x >= LEVEL_COLUMN_MIN_X && x <= LEVEL_COLUMN_MAX_X) {
        pageTokens.push(createLevelMarker(text));
        hasSeenTableContent = true;
        continue;
      }

      if (x >= DESCRIPTION_COLUMN_MIN_X && !isPageOrSectionLabel(text)) {
        pageTokens.push(text);
        hasSeenTableContent = true;
      }
    }

    pageTexts.push(cleanPageText(pageTokens.join(" ")));
  }

  return parseStandards(pageTexts.join(" "), standardParts);
}

function parseStandards(text, standardParts) {
  const codeMatches = [...text.matchAll(CODE_MARKER_PATTERN)];

  return codeMatches.map((match, index) => {
    const nextMatch = codeMatches[index + 1];
    const section = text.slice(match.index, nextMatch?.index ?? text.length).trim();
    const code = match[1];
    return parseStandardSection(section, code, standardParts.get(code));
  });
}

function parseStandardSection(section, code, standardText) {
  const levelMatches = [...section.matchAll(LEVEL_MARKER_PATTERN)];
  if (levelMatches.length === 0) {
    throw new Error(`No achievement levels found for ${code}`);
  }

  const standard = cleanStandard(standardText || section.slice(0, levelMatches[0].index));
  const groups = [];

  for (let index = 0; index < levelMatches.length; index += 1) {
    const group = [levelMatches[index][1]];

    while (
      index + 1 < levelMatches.length &&
      section.slice(levelMatches[index].index + levelMatches[index][0].length, levelMatches[index + 1].index).trim() === ""
    ) {
      index += 1;
      if (!group.includes(levelMatches[index][1])) {
        group.push(levelMatches[index][1]);
      }
    }

    const descriptionStart = levelMatches[index].index + levelMatches[index][0].length;
    const descriptionEnd = levelMatches[index + 1]?.index ?? section.length;
    const description = cleanDescription(section.slice(descriptionStart, descriptionEnd));

    if (description) {
      groups.push({ label: group.join("/"), description });
    }
  }

  if (groups.length === 0) {
    throw new Error(`No achievement level descriptions found for ${code}`);
  }

  return { code, standard, groups };
}

function cleanPageText(text) {
  const explorationIndex = text.indexOf("<탐구 활동>");
  if (explorationIndex !== -1) {
    text = text.slice(0, explorationIndex);
  }

  return normalizeText(text)
    .replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ\s.ㆍ0-9]+/, "")
    .trim();
}

function cleanStandard(text) {
  return cleanKoreanSpacing(normalizeText(text))
    .replace(/<탐구 활동>[\s\S]*$/u, "")
    .replace(/※[\s\S]*$/u, "")
    .trim();
}

function cleanDescription(text) {
  return cleanKoreanSpacing(normalizeText(text))
    .replace(/\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*\.?\s*[\s\S]*?성취수준\s*$/u, "")
    .replace(/\s*\d+\s*$/u, "")
    .trim();
}

function appendMapText(map, key, text) {
  map.set(key, normalizeText(`${map.get(key) || ""} ${text}`));
}

function shouldSkipText(text) {
  return (
    text === "성취기준" ||
    text === "성취기준별 성취수준" ||
    text === "영역" ||
    text === "영역별 성취수준" ||
    text === "<탐구 활동>" ||
    text.startsWith("•")
  );
}

function createCodeMarker(code) {
  return `@@CODE{${code}}@@`;
}

function createLevelMarker(level) {
  return `@@LEVEL{${level}}@@`;
}

function isPageOrSectionLabel(text) {
  return (
    /^\d+$/.test(text) ||
    /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+$/.test(text) ||
    /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ\s.ㆍ]+/.test(text) ||
    /^\(\d\)/.test(text) ||
    text.includes("2022 개정 교육과정") ||
    /성취수준$/.test(text)
  );
}

function buildMarkdown(standardsBySource) {
  const sections = standardsBySource.map(({ source, standards }) => {
    const body = standards
      .map((standard) => {
        const rows = standard.groups
          .map((group) => `| ${group.label} | ${escapeMarkdownTableCell(group.description)} |`)
          .join("\n");

        return [
          `## ${escapeHeading(standard.standard)}`,
          "",
          `출처: ${source}`,
          "",
          "| 수준 | 성취수준 |",
          "| --- | --- |",
          rows,
        ].join("\n");
      })
      .join("\n\n");

    return [`# ${source}`, "", body].join("\n");
  });

  return `# 고등학교 과학 성취기준별 성취수준\n\n${sections.join("\n\n")}\n`;
}

function normalizeText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/ㆍ/g, "ㆍ")
    .trim();
}

function cleanKoreanSpacing(text) {
  const replacements = [
    ["아날로 그", "아날로그"],
    ["뉴클레 오타이드", "뉴클레오타이드"],
    ["지구시스 템", "지구시스템"],
    ["지구시 스템", "지구시스템"],
    ["첨단기 술", "첨단기술"],
    ["성 질", "성질"],
    ["물 질", "물질"],
    ["생 성", "생성"],
    ["운 동", "운동"],
    ["전 기", "전기"],
    ["자 기", "자기"],
    ["실 험", "실험"],
    ["탐 구", "탐구"],
    ["연 구", "연구"],
    ["분 석", "분석"],
    ["해 석", "해석"],
    ["설 명", "설명"],
    ["에 너지", "에너지"],
    ["우 주", "우주"],
    ["생 명", "생명"],
    ["화 학", "화학"],
    ["물 리", "물리"],
    ["지 구", "지구"],
    ["이 해", "이해"],
    ["비 교", "비교"],
    ["계 산", "계산"],
    ["작 성", "작성"],
    ["구 성", "구성"],
    ["관 계", "관계"],
    ["개 념", "개념"],
    ["과 정", "과정"],
    ["산출 함", "산출함"],
    ["전자기 유 도", "전자기 유도"],
    ["마이크로 컨트롤러", "마이크로컨트롤러"],
    ["스마트 폰", "스마트폰"],
    ["케 플러", "케플러"],
    ["허블-르 메트르", "허블-르메트르"],
    ["차등측광 법", "차등측광법"],
    ["주계열 맞 추기", "주계열 맞추기"],
    ["색초 과", "색초과"],
    ["표준 등급", "표준등급"],
    ["기기등급", "기기 등급"],
    ["시간계", "시간계"],
    ["전 세계", "전 세계"],
  ];

  let cleaned = text;
  for (const [target, replacement] of replacements) {
    cleaned = cleaned.replaceAll(target, replacement);
  }

  let previous;
  do {
    previous = cleaned;
    cleaned = cleaned
      .replace(/([가-힣])\s+(은|는|이|가|을|를|에|에서|에게|으로|로|와|과|도|만|부터|까지|보다|처럼|조차|마저|의)(?=[\s,.)]|$)/g, "$1$2")
      .replace(/([가-힣])\s+(하고|하며|하여|하되|하므로|하면|하는|한|할|함|했다|한다|였다|고|며|거나|지만|면서|도록)(?=[\s,.)]|$)/g, "$1$2")
      .replace(/([가-힣])\s+(되었|되었음을|되었음|되었다|되었고)(?=[\s,.)]|$)/g, "$1$2")
      .replace(/([가-힣]+하)\s+(는|여|고|며|면|도록|였다|였다면|였다가|였다고|였다며)/g, "$1$2");
  } while (cleaned !== previous);

  return cleaned
    .replace(/([가-힣]+가)되(며|고|는|어|었다|었고|었으며)/g, "$1 되$2")
    .replace(/\bSi-O\s+사면체/g, "Si-O 사면체")
    .replace(/\bH-R도/g, "H-R도")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHeading(text) {
  return text.replace(/\s*#+\s*/g, " ");
}

function escapeMarkdownTableCell(text) {
  return text.replace(/\|/g, "\\|");
}

function expandRanges(ranges) {
  return ranges.flatMap(([start, end]) =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index),
  );
}
