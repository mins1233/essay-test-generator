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

const curriculumCodeInstruction =
  "성취기준과 성취수준 앞의 [9과04-03], [10통과1-01-01], [12고물01-01] 같은 대괄호 코드는 성취기준 식별용입니다. 여러 성취기준과 성취수준의 대응 관계를 파악하는 데만 사용하고, 평가 항목, 평가 요소, 제시문, 문항, 작성 조건, 채점 기준 문장에는 이 코드를 그대로 노출하지 마세요.";
const achievementLevelInstruction =
  "성취수준은 원문에 따라 A~E 5수준이거나 A~C 3수준일 수 있습니다. 입력된 수준만 근거로 사용하고, 비어 있는 수준은 임의로 만들지 마세요.";

export async function generateSuggestions({ provider, apiKey, model, teacherInput }) {
  const prompt = [
    "당신은 중·고등 과학 논술형 평가 문항 설계 전문가입니다.",
    "교사가 제공한 성취기준, 성취기준별 성취수준, 성취수준 분류표를 분석하여 평가 항목 4~5개와 평가 요소 3~4개를 제안하세요.",
    curriculumCodeInstruction,
    achievementLevelInstruction,
    "평가 항목은 수업/평가에서 관찰 가능한 수행 중심 문장으로, 평가 요소는 논술형 문항으로 직접 전환 가능한 구체 문장으로 작성하세요.",
    "평가 항목의 title은 반드시 '참여하였는가?', '제시하였는가?', '구성하였는가?'처럼 '~하였는가?' 형식의 질문 문장으로 작성하세요.",
    "평가 요소의 title은 반드시 '자료를 해석하기', '과학 개념을 적용하기', '근거를 들어 설명하기'처럼 '~하기'로 끝나는 명사형 어구로 작성하세요.",
    "평가 요소의 title은 질문 문장이나 완결된 서술문으로 작성하지 마세요.",
    "예시는 참고하지 말고 입력된 성취기준의 개념과 탐구 기능을 우선하세요.",
    formatTeacherInput(teacherInput),
  ].join("\n\n");

  return requestJson({
    provider,
    apiKey,
    model,
    prompt,
    schema: suggestionSchema,
    schemaName: "assessment_suggestions",
  });
}

export async function generateAssessmentItems({
  provider,
  apiKey,
  model,
  teacherInput,
  suggestion,
  selectedElements,
  selectedProblemType,
  additionalRequest,
}) {
  const commandTerms = SCIENCE_COMMAND_TERMS.map(
    (term) => `- ${term.command}(${term.english}): ${term.definition}`,
  ).join("\n");

  const prompt = [
    "당신은 중·고등 과학 논술형 평가 문항 제작 전문가입니다.",
    "교사가 선택하거나 직접 입력한 평가 요소 수와 정확히 같은 개수의 논술형 문항을 만드세요.",
    curriculumCodeInstruction,
    achievementLevelInstruction,
    "제시문은 반드시 실제 맥락과 우리 주변에서 접할 수 있는 실제 상황을 담아야 하며, 모든 문항과 유기적으로 연결되어야 합니다.",
    "제시문의 문장 끝은 '하였습니다', '했습니다' 같은 높임 표현 대신 '~하였다', '~했다'처럼 객관적인 평서문 어조로 작성하세요.",
    "문항마다 작성 조건을 2~4개 제시하고, 학생 답안에 포함되어야 할 핵심 과학 개념과 근거를 명확히 하세요.",
    "발문에는 과학 교과에 적절한 반응지시어를 다양하게 사용하세요.",
    "논술형 평가 문항은 반드시 성취기준, 성취기준별 성취수준, 성취수준 분류표, 평가 요소, 문제 유형, 추가 요청사항을 종합하여 제작하세요.",
    "문제 유형 예시는 형식 이해를 위한 참고 자료일 뿐입니다. 예시의 소재, 맥락, 표현, 문항 구조를 그대로 또는 비슷하게 모방하지 말고 입력된 성취기준과 평가 요소에 맞는 새로운 문항을 만드세요.",
    "반응지시어 목록:",
    commandTerms,
    formatTeacherInput(teacherInput),
    `AI가 제안한 평가 항목:\n${formatList(suggestion.assessmentItems)}`,
    `교사가 선택하거나 직접 입력한 평가 요소(${selectedElements.length}개):\n${selectedElements.map((element, index) => `${index + 1}. ${element.title} - ${element.focus}`).join("\n")}`,
    formatProblemType(selectedProblemType),
    `교사의 추가 요청사항:\n${additionalRequest?.trim() || "없음"}`,
    `반드시 questions 배열의 길이를 ${selectedElements.length}개로 맞추세요.`,
  ].join("\n\n");

  return requestJson({
    provider,
    apiKey,
    model,
    prompt,
    schema: assessmentSchema,
    schemaName: "assessment_items",
  });
}

function formatProblemType(problemType) {
  if (!problemType) return "문제 유형:\n지정 없음";
  return [
    "문제 유형:",
    `- 유형명: ${problemType.label}`,
    `- 설명: ${problemType.description}`,
    problemType.example ? `- 예시(참고용, 모방 금지):\n${problemType.example}` : "- 예시: 없음",
  ].join("\n");
}

export async function generateRubrics({
  provider,
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
    "당신은 중·고등 과학 논술형 평가 채점 기준 설계 전문가입니다.",
    "생성된 제시문과 문항에 맞춰 문항 수와 동일한 채점 기준을 작성하세요.",
    curriculumCodeInstruction,
    achievementLevelInstruction,
    `각 문항의 채점 기준별 배점 설명은 정확히 ${rubricLevelCount}단계(${labels.join(", ")})로 작성하세요.`,
    "상위 단계는 과학 개념, 근거, 자료 해석, 논리성이 충분한 답안을 설명하고, 하위 단계는 결손 요소를 구체적으로 구분하세요.",
    "문항별 작성 조건과 선택하거나 직접 입력한 평가 요소를 직접 반영하세요.",
    formatTeacherInput(teacherInput),
    `선택 또는 직접 입력 평가 요소:\n${selectedElements.map((element, index) => `${index + 1}. ${element.title} - ${element.focus}`).join("\n")}`,
    `제시문 제목: ${assessment.passageTitle}`,
    `제시문:\n${assessment.passage}`,
    `문항:\n${assessment.questions.map((question) => [
      `${question.number}. ${question.prompt}`,
      `평가 요소: ${question.assessmentElement}`,
      `작성 조건: ${question.writingConditions.join(" / ")}`,
    ].join("\n")).join("\n\n")}`,
    `반드시 rubrics 배열의 길이를 ${assessment.questions.length}개로, 각 levels 배열의 길이를 ${rubricLevelCount}개로 맞추세요.`,
  ].join("\n\n");

  return requestJson({
    provider,
    apiKey,
    model,
    prompt,
    schema: rubricSchema,
    schemaName: "assessment_rubrics",
  });
}

async function requestJson({ provider = "gemini", apiKey, model, prompt, schema, schemaName }) {
  if (provider === "openai") {
    return requestOpenAiJson({ apiKey, model, prompt, schema, schemaName });
  }
  return requestGeminiJson({ apiKey, model, prompt, schema });
}

async function requestGeminiJson({ apiKey, model, prompt, schema }) {
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
    throw new AiRequestError(message, payload);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new AiParseError("Gemini 응답에서 JSON 텍스트를 찾지 못했습니다.", payload);
  }

  try {
    return JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new AiParseError("Gemini 응답을 JSON으로 해석하지 못했습니다.", text, error);
  }
}

async function requestOpenAiJson({ apiKey, model, prompt, schema, schemaName }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "응답은 지정된 JSON 스키마를 정확히 따르는 JSON 객체만 반환하세요.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema: toOpenAiStrictSchema(schema),
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI 요청에 실패했습니다. (${response.status})`;
    throw new AiRequestError(message, payload);
  }

  const text = extractOpenAiText(payload).trim();
  if (!text) {
    throw new AiParseError("OpenAI 응답에서 JSON 텍스트를 찾지 못했습니다.", payload);
  }

  try {
    return JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new AiParseError("OpenAI 응답을 JSON으로 해석하지 못했습니다.", text, error);
  }
}

function toOpenAiStrictSchema(schema) {
  if (Array.isArray(schema)) {
    return schema.map(toOpenAiStrictSchema);
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const next = {};
  Object.entries(schema).forEach(([key, value]) => {
    if (["minItems", "maxItems"].includes(key)) return;
    next[key] = toOpenAiStrictSchema(value);
  });

  if (next.type === "object") {
    next.additionalProperties = false;
  }

  return next;
}

function extractOpenAiText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("");
}

function stripCodeFence(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function formatTeacherInput(input) {
  const levels = LEVELS
    .filter((level) => input.achievementLevels[level].trim())
    .map((level) => `${level}: ${input.achievementLevels[level]}`)
    .join("\n") || "입력 없음";
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

export class AiRequestError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "AiRequestError";
    this.details = details;
  }
}

export class AiParseError extends Error {
  constructor(message, raw, cause) {
    super(message);
    this.name = "AiParseError";
    this.raw = raw;
    this.cause = cause;
  }
}
