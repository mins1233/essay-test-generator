import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

const SOURCE = "raw-data/(중등)2022 개정 교육과정에 따른 성취수준(과학).hwpx";
const SECTION = "Contents/section0.xml";
const OUTPUT = "src/data/middle-school-science-achievement-levels.md";
const LEVELS = ["A", "B", "C", "D", "E"];
let nextCellId = 0;

const sourcePath = resolve(SOURCE);
const outputPath = resolve(OUTPUT);
const xml = readZipText(sourcePath, SECTION);
const tables = matchAll(xml, /<hp:tbl\b[\s\S]*?<\/hp:tbl>/g);
const targetTables = selectAchievementTables(tables);
const standards = targetTables.flatMap(parseAchievementTable);
const markdown = buildMarkdown(standards);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown, "utf8");

console.log(`Extracted ${standards.length} standards to ${OUTPUT}`);

if (standards.length !== 87) {
  throw new Error(`Expected 87 standards, but extracted ${standards.length}.`);
}
if (standards[0]?.code !== "[9과01-01]") {
  throw new Error(`Unexpected first code: ${standards[0]?.code}`);
}
if (standards.at(-1)?.code !== "[9과23-02]") {
  throw new Error(`Unexpected last code: ${standards.at(-1)?.code}`);
}
if (markdown.includes("<탐구 활동>")) {
  throw new Error("Exploration activity text was not removed.");
}

function readZipText(zipPath, entryName) {
  const zip = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = zip.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory.");
    }

    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const fileNameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const fileName = zip.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      if (zip.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`Invalid local header for ${entryName}.`);
      }
      const localFileNameLength = zip.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);

      if (compressionMethod === 0) return compressed.toString("utf8");
      if (compressionMethod === 8) return inflateRawSync(compressed).toString("utf8");
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 66000); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("End of central directory not found.");
}

function selectAchievementTables(tables) {
  const start = tables.findIndex((table) => table.includes("[9과01-01]"));
  if (start === -1) throw new Error("Start standard [9과01-01] not found.");

  const end = tables.findIndex((table, index) => index >= start && table.includes("[9과23-02]"));
  if (end === -1) throw new Error("End standard [9과23-02] not found.");

  return tables.slice(start, end + 1);
}

function parseAchievementTable(tableXml) {
  const rows = matchAll(tableXml, /<hp:tr\b[\s\S]*?<\/hp:tr>/g).map(parseRow);
  const grid = new Map();
  const sourceCellsByRow = new Map();

  rows.forEach((cells) => {
    cells.forEach((cell) => {
      const rowCells = sourceCellsByRow.get(cell.row) || [];
      rowCells.push(cell);
      sourceCellsByRow.set(cell.row, rowCells);

      for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
        for (let col = cell.col; col < cell.col + cell.colSpan; col += 1) {
          grid.set(cellKey(row, col), cell);
        }
      }
    });
  });

  const rowNumbers = [...sourceCellsByRow.keys()].sort((a, b) => a - b);
  const standards = [];
  let current = null;

  rowNumbers.forEach((row) => {
    const standardCell = grid.get(cellKey(row, 0));
    const standardText = standardCell?.text || "";
    const code = standardText.match(/\[9과\d{2}-\d{2}\]/)?.[0];

    if (code && current?.code !== code) {
      current = {
        code,
        standard: cleanStandard(standardText),
        levelRows: [],
      };
      standards.push(current);
    }

    if (!current) return;

    const levelCell = findLevelCell(sourceCellsByRow.get(row) || []);
    if (!levelCell) return;

    const descriptionCell = findDescriptionCell(row, levelCell, grid);
    if (!descriptionCell?.text) return;

    current.levelRows.push({
      level: levelCell.text,
      description: normalizeText(descriptionCell.text),
      descriptionId: descriptionCell.id,
    });
  });

  return standards.map((standard) => ({
    code: standard.code,
    standard: standard.standard,
    groups: groupLevelRows(standard.levelRows),
  }));
}

function parseRow(rowXml) {
  return matchAll(rowXml, /<hp:tc\b[\s\S]*?<\/hp:tc>/g).map((cellXml) => {
    const addressTag = cellXml.match(/<hp:cellAddr\b[^>]*\/>/)?.[0] || "";
    const spanTag = cellXml.match(/<hp:cellSpan\b[^>]*\/>/)?.[0] || "";
    return {
      id: createCellId(),
      row: Number(readAttribute(addressTag, "rowAddr") || 0),
      col: Number(readAttribute(addressTag, "colAddr") || 0),
      rowSpan: Number(readAttribute(spanTag, "rowSpan") || 1),
      colSpan: Number(readAttribute(spanTag, "colSpan") || 1),
      text: normalizeText(readCellText(cellXml)),
    };
  });
}

function findLevelCell(cells) {
  return cells.find((cell) => LEVELS.includes(cell.text));
}

function findDescriptionCell(row, levelCell, grid) {
  const candidates = [];

  for (let col = levelCell.col + levelCell.colSpan; col < levelCell.col + levelCell.colSpan + 8; col += 1) {
    const cell = grid.get(cellKey(row, col));
    if (cell?.text && !LEVELS.includes(cell.text)) candidates.push(cell);
  }

  return candidates.find((cell) => cell.id !== levelCell.id);
}

function groupLevelRows(levelRows) {
  const groups = [];

  levelRows.forEach((row) => {
    const previous = groups.at(-1);
    if (previous?.descriptionId === row.descriptionId) {
      previous.levels.push(row.level);
      previous.label = previous.levels.join("/");
      return;
    }

    groups.push({
      label: row.level,
      levels: [row.level],
      description: row.description,
      descriptionId: row.descriptionId,
    });
  });

  return groups.map(({ label, description }) => ({ label, description }));
}

function cleanStandard(text) {
  return normalizeText(
    text
      .replace(/<탐구 활동>[\s\S]*$/u, "")
      .replace(/※[\s\S]*$/u, ""),
  );
}

function buildMarkdown(standards) {
  const body = standards
    .map((standard) => {
      const rows = standard.groups
        .map((group) => `| ${group.label} | ${escapeMarkdownTableCell(group.description)} |`)
        .join("\n");

      return [
        `## ${escapeHeading(standard.standard)}`,
        "",
        "| 수준 | 성취수준 |",
        "| --- | --- |",
        rows,
      ].join("\n");
    })
    .join("\n\n");

  return `# 중학교 과학 성취기준별 성취수준\n\n${body}\n`;
}

function readCellText(cellXml) {
  return matchAll(cellXml, /<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g)
    .map((match) =>
      decodeXml(
        match
          .replace(/<hp:lineBreak\b[^>]*\/>/g, "\n")
          .replace(/<hp:tab\b[^>]*\/>/g, " ")
          .replace(/<hp:fwSpace\b[^>]*\/>/g, " ")
          .replace(/<[^>]+>/g, ""),
      ),
    )
    .join("");
}

function normalizeText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function escapeHeading(text) {
  return text.replace(/\s*#+\s*/g, " ");
}

function escapeMarkdownTableCell(text) {
  return text.replace(/\|/g, "\\|");
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readAttribute(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function createCellId() {
  nextCellId += 1;
  return nextCellId;
}

function matchAll(text, expression) {
  return [...text.matchAll(expression)].map((match) => match[1] ?? match[0]);
}
