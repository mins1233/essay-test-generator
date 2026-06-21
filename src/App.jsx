import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Clipboard,
  Download,
  FileText,
  KeyRound,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  CLASSIFICATION_COLUMNS,
  DEFAULT_MODEL,
  GEMINI_MODEL_OPTIONS,
  LEVELS,
  STORAGE_KEY,
  createEmptyClassification,
} from "./constants.js";
import {
  generateAssessmentItems,
  generateRubrics,
  generateSuggestions,
} from "./gemini.js";
import { buildMarkdown, copyMarkdown, downloadMarkdown } from "./exportMarkdown.js";

const initialTeacherInput = {
  achievementStandard: "",
  achievementLevels: Object.fromEntries(LEVELS.map((level) => [level, ""])),
  classification: createEmptyClassification(),
};

const PAGES = ["input", "suggestion", "assessment", "rubric"];

export default function App() {
  const savedApiKey = readSavedApiKey();
  const [page, setPage] = useState("input");
  const [apiKey, setApiKey] = useState(savedApiKey);
  const [saveApiKey, setSaveApiKey] = useState(Boolean(savedApiKey));
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [modelTier, setModelTier] = useState("free");
  const [teacherInput, setTeacherInput] = useState(initialTeacherInput);
  const [suggestion, setSuggestion] = useState(null);
  const [selectedElementIndexes, setSelectedElementIndexes] = useState([]);
  const [additionalRequest, setAdditionalRequest] = useState("");
  const [rubricLevelCount, setRubricLevelCount] = useState(4);
  const [assessment, setAssessment] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [loadingStep, setLoadingStep] = useState(null);
  const [errors, setErrors] = useState([]);
  const [rawResponse, setRawResponse] = useState("");
  const [notice, setNotice] = useState("");

  const selectedElements = useMemo(() => {
    if (!suggestion) return [];
    return selectedElementIndexes
      .map((index) => suggestion.assessmentElements[index])
      .filter(Boolean);
  }, [selectedElementIndexes, suggestion]);

  const markdown = useMemo(
    () => buildMarkdown({ teacherInput, suggestion, selectedElements, assessment, rubric }),
    [teacherInput, suggestion, selectedElements, assessment, rubric],
  );

  const isBusy = Boolean(loadingStep);
  const pageIndex = PAGES.indexOf(page);
  const hasSuggestion = Boolean(suggestion);
  const hasAssessment = Boolean(assessment);
  const hasRubric = Boolean(rubric);

  function goToPage(nextPage) {
    setErrors([]);
    setRawResponse("");
    setNotice("");
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goPrevious() {
    if (pageIndex > 0) {
      goToPage(PAGES[pageIndex - 1]);
    }
  }

  function updateAchievementLevel(level, value) {
    setTeacherInput((current) => ({
      ...current,
      achievementLevels: { ...current.achievementLevels, [level]: value },
    }));
  }

  function updateClassification(level, column, value) {
    setTeacherInput((current) => ({
      ...current,
      classification: {
        ...current.classification,
        [level]: { ...current.classification[level], [column]: value },
      },
    }));
  }

  function updateAchievementStandard(value) {
    setTeacherInput((current) => ({ ...current, achievementStandard: value }));
  }

  function handleApiKeyChange(value) {
    setApiKey(value);
    if (saveApiKey) {
      localStorage.setItem(STORAGE_KEY, value);
    }
  }

  function handleSaveApiKeyChange(checked) {
    setSaveApiKey(checked);
    if (checked && apiKey) {
      localStorage.setItem(STORAGE_KEY, apiKey);
    }
    if (!checked) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function clearSavedKey() {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey("");
    setSaveApiKey(false);
    setNotice("저장된 API 키를 삭제했습니다.");
  }

  function chooseModelTier(tier) {
    setModelTier(tier);
    const firstModel = GEMINI_MODEL_OPTIONS.find((option) => option.tier === tier);
    if (firstModel) {
      setModel(firstModel.value);
    }
  }

  async function handleGenerateSuggestions() {
    const validation = validateTeacherInput({ apiKey, model, teacherInput });
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }

    await runAiTask("suggestions", async () => {
      const result = await generateSuggestions({ apiKey, model, teacherInput });
      assertRange(result.assessmentItems, 4, 5, "평가 항목");
      assertRange(result.assessmentElements, 3, 4, "평가 요소");
      setSuggestion(result);
      setSelectedElementIndexes([]);
      setAssessment(null);
      setRubric(null);
      setNotice("평가 항목과 평가 요소를 생성했습니다.");
      setPage("suggestion");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function handleSuggestionNext() {
    if (hasAssessment) {
      goToPage("assessment");
      return;
    }
    handleGenerateAssessment();
  }

  async function handleGenerateAssessment() {
    const validation = validateAssessmentRequest({ apiKey, model, teacherInput, suggestion, selectedElements });
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }

    await runAiTask("assessment", async () => {
      const result = await generateAssessmentItems({
        apiKey,
        model,
        teacherInput,
        suggestion,
        selectedElements,
        additionalRequest,
      });
      if (result.questions.length !== selectedElements.length) {
        throw new Error(`선택한 평가 요소는 ${selectedElements.length}개인데 생성 문항은 ${result.questions.length}개입니다. 다시 생성해 주세요.`);
      }
      setAssessment(result);
      setRubric(null);
      setNotice("제시문과 논술형 문항을 생성했습니다.");
      setPage("assessment");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function handleAssessmentNext() {
    if (hasRubric) {
      goToPage("rubric");
      return;
    }
    handleGenerateRubric();
  }

  async function handleGenerateRubric() {
    const validation = validateRubricRequest({ apiKey, model, assessment, selectedElements, rubricLevelCount });
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }

    await runAiTask("rubric", async () => {
      const result = await generateRubrics({
        apiKey,
        model,
        teacherInput,
        assessment,
        selectedElements,
        rubricLevelCount,
      });
      if (result.rubrics.length !== assessment.questions.length) {
        throw new Error(`문항은 ${assessment.questions.length}개인데 채점 기준은 ${result.rubrics.length}개입니다. 다시 생성해 주세요.`);
      }
      const invalidLevel = result.rubrics.find((item) => item.levels.length !== rubricLevelCount);
      if (invalidLevel) {
        throw new Error(`채점 단계 수가 ${rubricLevelCount}단계와 일치하지 않는 채점 기준이 있습니다. 다시 생성해 주세요.`);
      }
      setRubric(result);
      setNotice("문항별 채점 기준을 생성했습니다.");
      setPage("rubric");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function runAiTask(step, task) {
    setLoadingStep(step);
    setErrors([]);
    setRawResponse("");
    setNotice("");

    try {
      await task();
    } catch (error) {
      setErrors([error.message || "알 수 없는 오류가 발생했습니다."]);
      if (error.name === "GeminiParseError") {
        setRawResponse(typeof error.raw === "string" ? error.raw : JSON.stringify(error.raw, null, 2));
      }
      if (error.name === "GeminiRequestError" && error.details) {
        setRawResponse(JSON.stringify(error.details, null, 2));
      }
    } finally {
      setLoadingStep(null);
    }
  }

  async function handleCopy() {
    try {
      await copyMarkdown(markdown);
      setNotice("Markdown 내용을 클립보드에 복사했습니다.");
    } catch {
      setErrors(["브라우저 권한 문제로 클립보드 복사에 실패했습니다."]);
    }
  }

  function toggleElement(index) {
    setSelectedElementIndexes((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index].sort((a, b) => a - b),
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar compact-bar">
        <div>
          <p className="creator-mark">made by. minsT</p>
          <p className="eyebrow">Essay Assessment Studio</p>
          <h1>논술형 평가 문항 제작</h1>
        </div>
        <div className="hero-badge" aria-hidden="true">
          <div className="floating-sheet">
            <PenLine size={26} />
          </div>
          <div className="floating-rubric">
            <span />
            <span />
            <span />
          </div>
          <div className="status-pill">
            <Sparkles size={16} />
            {model}
          </div>
        </div>
      </header>

      <Stepper page={page} />

      <Feedback errors={errors} notice={notice} rawResponse={rawResponse} />

      {page === "input" && (
        <section className="page-layout">
          <div className="page-card">
            <PanelTitle icon={<KeyRound size={18} />} title="AI 연결" />
            <label className="field">
              <span>Gemini API 키</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => handleApiKeyChange(event.target.value)}
                placeholder="AIza..."
                autoComplete="off"
              />
            </label>
            <ModelSelector
              model={model}
              modelTier={modelTier}
              onTierChange={chooseModelTier}
              onModelChange={setModel}
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={saveApiKey}
                onChange={(event) => handleSaveApiKeyChange(event.target.checked)}
              />
              <span>이 브라우저에 API 키 저장</span>
            </label>
            <button className="button ghost" type="button" onClick={clearSavedKey}>
              <Trash2 size={16} />
              저장된 키 삭제
            </button>
          </div>

          <div className="page-card">
            <PanelTitle icon={<PenLine size={18} />} title="교사 입력" />
            <label className="field">
              <span>성취기준</span>
              <textarea
                value={teacherInput.achievementStandard}
                onChange={(event) => updateAchievementStandard(event.target.value)}
                rows={4}
                placeholder="[9과02-04] 종의 개념과 분류 체계를 이해하고..."
              />
            </label>

            <div className="level-grid">
              {LEVELS.map((level) => (
                <label className="field compact" key={level}>
                  <span>{level} 성취수준</span>
                  <textarea
                    value={teacherInput.achievementLevels[level]}
                    onChange={(event) => updateAchievementLevel(level, event.target.value)}
                    rows={3}
                  />
                </label>
              ))}
            </div>

            <div className="table-wrap">
              <table className="classification-table">
                <caption>성취수준 분류표</caption>
                <thead>
                  <tr>
                    <th>수준</th>
                    {CLASSIFICATION_COLUMNS.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((level) => (
                    <tr key={level}>
                      <th>{level}</th>
                      {CLASSIFICATION_COLUMNS.map((column) => (
                        <td key={column}>
                          <textarea
                            aria-label={`${level} ${column}`}
                            value={teacherInput.classification[level][column]}
                            onChange={(event) => updateClassification(level, column, event.target.value)}
                            rows={2}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PageActions>
              <span />
              {hasSuggestion && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={handleGenerateSuggestions}
                  disabled={isBusy}
                >
                  {loadingStep === "suggestions" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                  다시 생성하기
                </button>
              )}
              <button
                className="button primary"
                type="button"
                onClick={hasSuggestion ? () => goToPage("suggestion") : handleGenerateSuggestions}
                disabled={isBusy}
              >
                {loadingStep === "suggestions" ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                {hasSuggestion ? "다음페이지" : "평가 항목/요소 생성"}
              </button>
            </PageActions>
          </div>
        </section>
      )}

      {page === "suggestion" && (
        <section className="page-card">
          <StageHeader step="2" title="평가 요소 선택" />
          {!suggestion ? (
            <EmptyState text="이전 페이지에서 평가 항목과 평가 요소를 먼저 생성해 주세요." />
          ) : (
            <>
              <div className="two-column">
                <ResultGroup title={`평가 항목 ${suggestion.assessmentItems.length}개`}>
                  {suggestion.assessmentItems.map((item, index) => (
                    <ResultItem key={`${item.title}-${index}`} title={item.title} text={item.rationale} />
                  ))}
                </ResultGroup>
                <ResultGroup title={`평가 요소 ${suggestion.assessmentElements.length}개`}>
                  {suggestion.assessmentElements.map((element, index) => (
                    <label className="select-card" key={`${element.title}-${index}`}>
                      <input
                        type="checkbox"
                        checked={selectedElementIndexes.includes(index)}
                        onChange={() => toggleElement(index)}
                      />
                      <span>
                        <strong>{element.title}</strong>
                        <small>{element.focus}</small>
                      </span>
                    </label>
                  ))}
                </ResultGroup>
              </div>

              <div className="request-grid">
                <label className="field">
                  <span>추가 요청사항</span>
                  <textarea
                    value={additionalRequest}
                    onChange={(event) => setAdditionalRequest(event.target.value)}
                    rows={4}
                    placeholder="예: 학교 주변의 실제 생태 맥락을 제시문에 반영해 주세요."
                  />
                </label>
                <div className="request-side">
                  <label className="field">
                    <span>채점 단계 수</span>
                    <select
                      value={rubricLevelCount}
                      onChange={(event) => setRubricLevelCount(Number(event.target.value))}
                    >
                      <option value={3}>3단계</option>
                      <option value={4}>4단계</option>
                      <option value={5}>5단계</option>
                    </select>
                  </label>
                  <div className="metric">
                    <span>선택 평가 요소</span>
                    <strong>{selectedElements.length}개</strong>
                  </div>
                </div>
              </div>
            </>
          )}

          <PageActions>
            <button className="button ghost" type="button" onClick={goPrevious}>
              <ArrowLeft size={17} />
              이전페이지
            </button>
            {hasAssessment && (
              <button
                className="button secondary"
                type="button"
                onClick={handleGenerateAssessment}
                disabled={isBusy || !suggestion}
              >
                {loadingStep === "assessment" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                다시 생성하기
              </button>
            )}
            <button
              className="button primary"
              type="button"
              onClick={handleSuggestionNext}
              disabled={isBusy || !suggestion}
            >
              {loadingStep === "assessment" ? <Loader2 className="spin" size={17} /> : <FileText size={17} />}
              {hasAssessment ? "다음페이지" : "다음페이지: 제시문/문항 생성"}
            </button>
          </PageActions>
        </section>
      )}

      {page === "assessment" && (
        <section className="page-card">
          <StageHeader step="3" title="생성된 제시문과 문항" />
          {!assessment ? (
            <EmptyState text="이전 페이지에서 문항을 먼저 생성해 주세요." />
          ) : (
            <article className="document">
              <h3>{assessment.passageTitle}</h3>
              <p>{assessment.passage}</p>
              <div className="question-list">
                {assessment.questions.map((question) => (
                  <div className="question" key={question.number}>
                    <div className="question-head">
                      <span>문항 {question.number}</span>
                      <small>{question.assessmentElement}</small>
                    </div>
                    <p>{question.prompt}</p>
                    <ul>
                      {question.writingConditions.map((condition, index) => (
                        <li key={`${question.number}-${index}`}>{condition}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          )}

          <PageActions>
            <button className="button ghost" type="button" onClick={goPrevious}>
              <ArrowLeft size={17} />
              이전페이지
            </button>
            {hasRubric && (
              <button
                className="button secondary"
                type="button"
                onClick={handleGenerateRubric}
                disabled={isBusy || !assessment}
              >
                {loadingStep === "rubric" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                다시 생성하기
              </button>
            )}
            <button
              className="button primary"
              type="button"
              onClick={handleAssessmentNext}
              disabled={isBusy || !assessment}
            >
              {loadingStep === "rubric" ? <Loader2 className="spin" size={17} /> : <CheckSquare size={17} />}
              {hasRubric ? "다음페이지" : "다음페이지: 채점 기준 생성"}
            </button>
          </PageActions>
        </section>
      )}

      {page === "rubric" && (
        <section className="page-card">
          <StageHeader step="4" title="채점 기준과 내보내기" />
          {!rubric ? (
            <EmptyState text="이전 페이지에서 채점 기준을 먼저 생성해 주세요." />
          ) : (
            <article className="document">
              <div className="rubric-list">
                {rubric.rubrics.map((item) => (
                  <div className="rubric" key={item.questionNumber}>
                    <h3>채점 기준 {item.questionNumber}</h3>
                    <p>{item.criterion}</p>
                    <div className="rubric-levels">
                      {item.levels.map((level) => (
                        <div className="rubric-level" key={`${item.questionNumber}-${level.label}`}>
                          <strong>{level.label}</strong>
                          <span>{level.scoreDescription}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="actions">
                <button className="button secondary" type="button" onClick={handleCopy}>
                  <Clipboard size={17} />
                  Markdown 복사
                </button>
                <button className="button secondary" type="button" onClick={() => downloadMarkdown(markdown)}>
                  <Download size={17} />
                  Markdown 내보내기
                </button>
              </div>
            </article>
          )}

          <PageActions>
            <button className="button ghost" type="button" onClick={goPrevious}>
              <ArrowLeft size={17} />
              이전페이지
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={handleGenerateRubric}
              disabled={isBusy || !assessment}
            >
              {loadingStep === "rubric" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
              다시 생성하기
            </button>
            <button className="button secondary" type="button" onClick={() => goToPage("input")}>
              <ArrowRight size={17} />
              새로 제작하기
            </button>
          </PageActions>
        </section>
      )}

      <footer className="site-footer">
        © minsT 2026. 본 사이트의 무단 배포 및 공유를 금지합니다.
      </footer>
    </main>
  );
}

function ModelSelector({ model, modelTier, onTierChange, onModelChange }) {
  const filteredModels = GEMINI_MODEL_OPTIONS.filter((option) => option.tier === modelTier);

  return (
    <div className="model-selector">
      <span className="field-label">API 키 유형</span>
      <div className="segmented-control" role="group" aria-label="API 키 유형 선택">
        <button
          className={modelTier === "free" ? "active" : ""}
          type="button"
          onClick={() => onTierChange("free")}
        >
          무료 버전
        </button>
        <button
          className={modelTier === "paid" ? "active" : ""}
          type="button"
          onClick={() => onTierChange("paid")}
        >
          유료 버전
        </button>
      </div>

      <div className="model-options">
        {filteredModels.map((option) => (
          <button
            className={model === option.value ? "model-option selected" : "model-option"}
            key={`${option.tier}-${option.value}`}
            type="button"
            onClick={() => onModelChange(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.value}</span>
            <small>{option.note}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ page }) {
  const steps = [
    { id: "input", label: "교사 입력" },
    { id: "suggestion", label: "평가 요소 선택" },
    { id: "assessment", label: "문항 확인" },
    { id: "rubric", label: "채점 기준" },
  ];
  const currentIndex = steps.findIndex((step) => step.id === page);

  return (
    <nav className="stepper" aria-label="제작 단계">
      {steps.map((step, index) => (
        <div className={index <= currentIndex ? "step active" : "step"} key={step.id}>
          <span>{index + 1}</span>
          <strong>{step.label}</strong>
        </div>
      ))}
    </nav>
  );
}

function PageActions({ children }) {
  return <div className="page-actions">{children}</div>;
}

function PanelTitle({ icon, title }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function StageHeader({ step, title }) {
  return (
    <div className="stage-header">
      <span>{step}</span>
      <h2>{title}</h2>
    </div>
  );
}

function ResultGroup({ title, children }) {
  return (
    <div className="result-group">
      <h3>{title}</h3>
      <div className="result-stack">{children}</div>
    </div>
  );
}

function ResultItem({ title, text }) {
  return (
    <div className="result-item">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function Feedback({ errors, notice, rawResponse }) {
  if (errors.length === 0 && !notice) return null;

  return (
    <div className="feedback-stack">
      {notice && <div className="notice">{notice}</div>}
      {errors.length > 0 && (
        <div className="error-box">
          <div className="error-title">
            <AlertCircle size={18} />
            확인이 필요한 항목
          </div>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          {rawResponse && (
            <details>
              <summary>원문 응답 보기</summary>
              <pre>{rawResponse}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function validateTeacherInput({ apiKey, model, teacherInput }) {
  const messages = [];
  if (!apiKey.trim()) messages.push("Gemini API 키를 입력해 주세요.");
  if (!model.trim()) messages.push("Gemini 모델을 선택해 주세요.");
  if (!teacherInput.achievementStandard.trim()) messages.push("성취기준을 입력해 주세요.");
  LEVELS.forEach((level) => {
    if (!teacherInput.achievementLevels[level].trim()) {
      messages.push(`${level} 성취수준을 입력해 주세요.`);
    }
  });
  return messages;
}

function validateAssessmentRequest({ apiKey, model, teacherInput, suggestion, selectedElements }) {
  const messages = validateTeacherInput({ apiKey, model, teacherInput });
  if (!suggestion) messages.push("먼저 평가 항목과 평가 요소를 생성해 주세요.");
  if (selectedElements.length === 0) messages.push("문항으로 만들 평가 요소를 1개 이상 선택해 주세요.");
  return messages;
}

function validateRubricRequest({ apiKey, model, assessment, selectedElements, rubricLevelCount }) {
  const messages = [];
  if (!apiKey.trim()) messages.push("Gemini API 키를 입력해 주세요.");
  if (!model.trim()) messages.push("Gemini 모델을 선택해 주세요.");
  if (!assessment) messages.push("먼저 제시문과 문항을 생성해 주세요.");
  if (selectedElements.length === 0) messages.push("선택된 평가 요소가 없습니다.");
  if (![3, 4, 5].includes(rubricLevelCount)) messages.push("채점 단계 수는 3, 4, 5단계 중에서 선택해 주세요.");
  return messages;
}

function assertRange(items, min, max, label) {
  if (!Array.isArray(items) || items.length < min || items.length > max) {
    throw new Error(`${label}은 ${min}~${max}개여야 합니다. 다시 생성해 주세요.`);
  }
}

function readSavedApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}
