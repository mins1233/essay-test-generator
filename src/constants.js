export const LEVELS = ["A", "B", "C", "D", "E"];

export const CLASSIFICATION_COLUMNS = ["지식 이해", "과정 기능", "가치 태도"];

export const DEFAULT_MODEL = "gemini-2.5-flash";

export const STORAGE_KEY = "essay-assessment-gemini-api-key";

export const GEMINI_MODEL_OPTIONS = [
  {
    tier: "free",
    value: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    note: "무료 API 키 권장",
  },
  {
    tier: "free",
    value: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    note: "무료 티어 사용 가능",
  },
  {
    tier: "free",
    value: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    note: "빠른 생성용",
  },
  {
    tier: "paid",
    value: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro (유료)",
    note: "복잡한 문항 설계용",
  },
  {
    tier: "paid",
    value: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview (유료)",
    note: "유료 API 키 필요",
  },
  {
    tier: "paid",
    value: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash (유료)",
    note: "유료 한도와 개인정보 처리 기준 적용",
  },
];

export const SCIENCE_COMMAND_TERMS = [
  { command: "분석하시오", english: "Analyse", definition: "정보나 자료를 여러 부분으로 나누어 각 부분의 의미와 관계, 구조를 파악한다." },
  { command: "설명하시오", english: "Explain", definition: "과정, 원리, 결과 등을 명확하고 논리적으로 풀어 설명한다." },
  { command: "비교하시오", english: "Compare", definition: "두 가지 이상의 대상, 아이디어, 과정 등을 유사점과 차이점을 중심으로 비교한다." },
  { command: "대조하시오", english: "Contrast", definition: "두 가지 이상의 대상, 아이디어, 과정 등의 차이점에 초점을 두어 대조한다." },
  { command: "평가하시오", english: "Evaluate", definition: "기준이나 근거에 따라 가치, 효과, 타당성, 한계 등을 판단하고 그 이유를 제시한다." },
  { command: "논의하시오", english: "Discuss", definition: "여러 관점과 의견을 검토하고 근거를 들어 토론하며 자신의 생각을 정리한다." },
  { command: "해석하시오", english: "Interpret", definition: "자료, 그래프, 표, 현상 등을 과학적 원리나 개념에 근거하여 의미를 해석한다." },
  { command: "식별하시오", english: "Identify", definition: "주어진 자료나 상황에서 특정한 요소, 특징, 패턴 등을 찾아내어 밝힌다." },
  { command: "예를 들어 설명하시오", english: "Give an example", definition: "개념, 원리, 과정 등을 구체적인 사례나 예로 들어 설명한다." },
  { command: "요약하시오", english: "Summarize", definition: "핵심 내용을 간략하고 명확하게 요약하여 정리한다." },
  { command: "추론하시오", english: "Infer", definition: "주어진 정보나 자료를 바탕으로 논리적으로 결론을 이끌어낸다." },
  { command: "예측하시오", english: "Predict", definition: "주어진 자료, 패턴, 원리를 바탕으로 앞으로의 결과나 변화를 예측한다." },
  { command: "적용하시오", english: "Apply", definition: "배운 지식, 개념, 원리, 방법을 새로운 상황이나 문제에 적절히 적용한다." },
  { command: "설계하시오", english: "Design", definition: "목표를 달성하기 위해 실험, 조사, 모형, 절차, 장치 등을 계획하거나 구성한다." },
  { command: "조사하시오", english: "Investigate", definition: "질문이나 문제에 대해 다양한 자료나 방법을 활용하여 체계적으로 탐구하고 정보를 수집한다." },
  { command: "구성하시오", english: "Construct", definition: "요소나 정보를 조직하여 구조, 모형, 논리적 설명, 반응식 등을 만들어낸다." },
  { command: "모델링하시오", english: "Model", definition: "개념이나 현상을 2D 또는 3D 모형, 수식, 시뮬레이션 등으로 나타내어 이해를 돕는다." },
  { command: "일반화하시오", english: "Generalize", definition: "특정 사례나 자료에서 공통된 특징이나 원리를 찾아 일반적인 결론이나 법칙으로 확장한다." },
  { command: "비판하시오", english: "Critique", definition: "자료, 방법, 주장, 결과 등의 강점과 약점을 분석하고 타당성을 비판적으로 검토한다." },
  { command: "결론을 도출하시오", english: "Draw conclusions", definition: "분석, 조사, 실험 등의 결과를 바탕으로 의미 있는 결론을 내리고 정리한다." },
];

export function createEmptyClassification() {
  return Object.fromEntries(
    LEVELS.map((level) => [
      level,
      Object.fromEntries(CLASSIFICATION_COLUMNS.map((column) => [column, ""])),
    ]),
  );
}
