import { LEVELS } from "./constants.js";
import achievementLevelsMarkdown from "./data/high-school-science-achievement-levels.md?raw";

export const HIGH_SCHOOL_SCIENCE_STANDARDS = parseAchievementLevelMarkdown(achievementLevelsMarkdown);

export function parseAchievementLevelMarkdown(markdown) {
  const sections = markdown.split(/\n(?=## \[(?:10|12)[^\]]+\] )/u);

  return sections
    .map(parseSection)
    .filter(Boolean);
}

function parseSection(section) {
  const heading = section.match(/^## (\[(?:10|12)[^\]]+\])\s+(.+)$/mu);
  if (!heading) return null;

  const [, code, statement] = heading;
  const groups = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("수준 | 성취수준"))
    .map(parseTableRow)
    .filter(Boolean);

  const levels = Object.fromEntries(LEVELS.map((level) => [level, ""]));

  groups.forEach((group) => {
    group.levels.forEach((level) => {
      if (level in levels) levels[level] = group.description;
    });
  });

  return {
    code,
    standard: `${code} ${statement.trim()}`,
    groups,
    levels,
    availableLevels: LEVELS.filter((level) => levels[level]),
  };
}

function parseTableRow(line) {
  const cells = splitMarkdownTableRow(line);
  if (cells.length < 2) return null;

  const label = cells[0].trim();
  const description = unescapeMarkdownTableCell(cells.slice(1).join("|").trim());
  const levels = label.split("/").map((level) => level.trim()).filter(Boolean);

  return { label, levels, description };
}

function splitMarkdownTableRow(line) {
  const content = line.replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let escaped = false;

  for (const character of content) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (character === "|") {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells;
}

function unescapeMarkdownTableCell(text) {
  return text.replace(/\\\|/g, "|").trim();
}
