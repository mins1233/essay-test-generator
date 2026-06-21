import { CLASSIFICATION_COLUMNS, LEVELS, SCIENCE_COMMAND_TERMS } from "./constants.js";

const suggestionSchema = {
  type: "object",
  properties: {
    assessmentItems: {
      type: "array",
      minItems: 4,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["title", "rationale"],
      },
    },
    assessmentElements: {
      type: "array",
      minItems: 3,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          focus: { type: "string" },
        },
        required: ["title", "focus"],
      },
    },
  },
  required: ["assessmentItems", "assessmentElements"],
};

const assessmentSchema = {
  type: "object",
  properties: {
    passageTitle: { type: "string" },
    passage: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "integer" },
          assessmentElement: { type: "string" },
          prompt: { type: "string" },
          writingConditions: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["number", "assessmentElement", "prompt", "writingConditions"],
      },
    },
  },
  required: ["passageTitle", "passage", "questions"],
};

const rubricSchema = {
  type: "object",
  properties: {
    rubrics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          criterion: { type: "string" },
          levels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                scoreDescription: { type: "string" },
              },
              required: ["label", "scoreDescription"],
            },
          },
        },
        required: ["questionNumber", "criterion", "levels"],
      },
    },
  },
  required: ["rubrics"],
};

export async function generateSuggestions({ apiKey, model, teacherInput }) {
  const prompt = [
    "당신은 중등 과학 논술형 평가 문항 설계 전문가입니다.",
    "교사가 제공한 성취기준, A~E 성취수준, 성취수준 분류표를 분석하여 평가 항목 4~5개와 평가 요소 3~4개를 제안하세요.",
    "평가 항목은 수업/평가에서 관찰 가능한 수행 중심 문장으로, 평가 요소는 논술형 문항으로 직접 전환 가능한 구체 문장으로 작성하세요.",
    "평가 항목의 title은 반드시 '참여하였는가?', '제시하였는가?', '구성하였는가?'처럼 '~하였는가?' 형식의 질문 문장으로 작성하세요.",
    "예시는 참고하지 말고 입력된 성취기준의 개념과 탐구 기능을 우선하세요.",
    formatTeacherInput(teacherInput),
  ].join("\n\n");

  return requestJson({ apiKey, model, prompt, schema: suggestionSchema });
}

export async function generateAssessmentItems({
  apiKey,
  model,
  teacherInput,
  suggestion,
  selectedElements,
  additionalRequest,
}) {
  const commandTerms = SCIENCE_COMMAND_TERMS.map(
    (term) => `- ${term.command}(${term.english}): ${term.definition}`,
  ).join("\n");

  const prompt = [
    "당신은 중등 과학 논술형 평가 문항 제작 전문가입니다.",
    "교사가 선택한 평가 요소 수와 정확히 같은 개수의 논술형 문항을 만드세요.",
    "제시문은 반드시 실제 맥락과 우리 주변에서 접할 수 있는 실제 상황을 담아야 하며, 모든 문항과 유기적으로 연결되어야 합니다.",
    "제시문의 문장 끝은 '하였습니다', '했습니다' 같은 높임 표현 대신 '~하였다', '~했다'처럼 객관적인 평서문 어조로 작성하세요.",
    "문항마다 작성 조건을 2~4개 제시하고, 학생 답안에 포함되어야 할 핵심 과학 개념과 근거를 명확히 하세요.",
    "발문에는 과학 교과에 적절한 반응지시어를 다양하게 사용하세요.",
    "반응지시어 목록:",
    commandTerms,
    formatTeacherInput(teacherInput),
    `AI가 제안한 평가 항목:\n${formatList(suggestion.assessmentItems)}`,
    `교사가 선택한 평가 요소(${selectedElements.length}개):\n${selectedElements.map((element, index) => `${index + 1}. ${element.title} - ${element.focus}`).join("\n")}`,
    `교사의 추가 요청사항:\n${additionalRequest?.trim() || "없음"}`,
    `반드시 questions 배열의 길이를 ${selectedElements.length}개로 맞추세요.`,
  ].join("\n\n");

  return requestJson({ apiKey, model, prompt, schema: assessmentSchema });
}

export async function generateRubrics({
  apiKey,
  model,
  teacherInput,
  assessment,
  selectedElements,
  rubricLevelCount,
}) {
  const labels = Array.from({ length: rubricLevelCount }, (_, index) =>
    String.fromCharCode("A".charCodeAt(0) + index),
  );

  const prompt = [
    "당신은 중등 과학 논술형 평가 채점 기준 설계 전문가입니다.",
    "생성된 제시문과 문항에 맞춰 문항 수와 동일한 채점 기준을 작성하세요.",
    `각 문항의 채점 기준별 배점 설명은 정확히 ${rubricLevelCount}단계(${labels.join(", ")})로 작성하세요.`,
    "상위 단계는 과학 개념, 근거, 자료 해석, 논리성이 충분한 답안을 설명하고, 하위 단계는 결손 요소를 구체적으로 구분하세요.",
    "문항별 작성 조건과 선택 평가 요소를 직접 반영하세요.",
    formatTeacherInput(teacherInput),
    `선택 평가 요소:\n${selectedElements.map((element, index) => `${index + 1}. ${element.title} - ${element.focus}`).join("\n")}`,
    `제시문 제목: ${assessment.passageTitle}`,
    `제시문:\n${assessment.passage}`,
    `문항:\n${assessment.questions.map((question) => [
      `${question.number}. ${question.prompt}`,
      `평가 요소: ${question.assessmentElement}`,
      `작성 조건: ${question.writingConditions.join(" / ")}`,
    ].join("\n")).join("\n\n")}`,
    `반드시 rubrics 배열의 길이를 ${assessment.questions.length}개로, 각 levels 배열의 길이를 ${rubricLevelCount}개로 맞추세요.`,
  ].join("\n\n");

  return requestJson({ apiKey, model, prompt, schema: rubricSchema });
}

async function requestJson({ apiKey, model, prompt, schema }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || `Gemini 요청에 실패했습니다. (${response.status})`;
    throw new GeminiRequestError(message, payload);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new GeminiParseError("Gemini 응답에서 JSON 텍스트를 찾지 못했습니다.", payload);
  }

  try {
    return JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new GeminiParseError("Gemini 응답을 JSON으로 해석하지 못했습니다.", text, error);
  }
}

function stripCodeFence(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function formatTeacherInput(input) {
  const levels = LEVELS.map((level) => `${level}: ${input.achievementLevels[level]}`).join("\n");
  const tableRows = LEVELS.map((level) => {
    const cells = CLASSIFICATION_COLUMNS.map(
      (column) => `${column}: ${input.classification[level][column] || "미입력"}`,
    ).join(" | ");
    return `${level} - ${cells}`;
  }).join("\n");

  return [
    `성취기준:\n${input.achievementStandard}`,
    `성취기준별 성취수준:\n${levels}`,
    `성취수준 분류표:\n${tableRows}`,
  ].join("\n\n");
}

function formatList(items = []) {
  return items
    .map((item, index) => `${index + 1}. ${item.title}${item.rationale ? ` - ${item.rationale}` : item.focus ? ` - ${item.focus}` : ""}`)
    .join("\n");
}

export class GeminiRequestError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "GeminiRequestError";
    this.details = details;
  }
}

export class GeminiParseError extends Error {
  constructor(message, raw, cause) {
    super(message);
    this.name = "GeminiParseError";
    this.raw = raw;
    this.cause = cause;
  }
}
