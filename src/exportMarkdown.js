export function buildMarkdown({ teacherInput, suggestion, selectedElements, selectedProblemType, additionalRequest, assessment, rubric }) {
  const lines = [
    "# 논술형 평가 문항",
    "",
    "## 성취기준",
    teacherInput.achievementStandard || "",
    "",
    "## 성취수준",
    ...Object.entries(teacherInput.achievementLevels).map(([level, text]) => `- ${level}: ${text}`),
  ];

  if (suggestion) {
    lines.push(
      "",
      "## 평가 항목",
      ...suggestion.assessmentItems.map((item) => `- ${item.title}: ${item.rationale}`),
      "",
      "## 선택 평가 요소",
      ...selectedElements.map((element) => `- ${element.title}: ${element.focus}`),
    );
  }

  if (selectedProblemType) {
    lines.push(
      "",
      "## 문제 유형",
      `- ${selectedProblemType.label}: ${selectedProblemType.description}`,
      "",
      "## 추가 요청사항",
      additionalRequest?.trim() || "없음",
    );
  }

  if (assessment) {
    lines.push(
      "",
      "## 제시문",
      `### ${assessment.passageTitle}`,
      assessment.passage,
      "",
      "## 문항",
      ...assessment.questions.flatMap((question) => [
        `### 문항 ${question.number}`,
        question.prompt,
        "",
        "<작성 조건>",
        ...question.writingConditions.map((condition) => `- ${condition}`),
        "",
      ]),
    );
  }

  if (rubric) {
    lines.push(
      "",
      "## 채점 기준",
      ...rubric.rubrics.flatMap((item) => [
        `### 채점 기준 ${item.questionNumber}`,
        item.criterion,
        "",
        ...item.levels.map((level) => `- ${level.label}: ${level.scoreDescription}`),
        "",
      ]),
    );
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function copyMarkdown(markdown) {
  await navigator.clipboard.writeText(markdown);
}

export function downloadMarkdown(markdown) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "논술형_평가_문항.md";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
