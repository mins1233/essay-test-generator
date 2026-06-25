import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckSquare,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  KeyRound,
  Loader2,
  PenLine,
  PlusCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  AI_MODEL_OPTIONS,
  AI_PROVIDERS,
  CLASSIFICATION_COLUMNS,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_MODEL_TIER_BY_PROVIDER,
  DEFAULT_PROVIDER,
  LEVELS,
  MODEL_TIER_OPTIONS,
  PROBLEM_TYPES,
  STORAGE_KEYS,
  createEmptyClassification,
} from "./constants.js";
import {
  generateAssessmentItems,
  generateRubrics,
  generateSuggestions,
} from "./gemini.js";
import { buildMarkdown, copyMarkdown, downloadMarkdown } from "./exportMarkdown.js";
import { HIGH_SCHOOL_SCIENCE_STANDARDS } from "./highSchoolScience.js";
import { MIDDLE_SCHOOL_SCIENCE_STANDARDS } from "./middleSchoolScience.js";

const initialTeacherInput = {
  achievementStandard: "",
  achievementLevels: Object.fromEntries(LEVELS.map((level) => [level, ""])),
  classification: createEmptyClassification(),
};

const PAGES = ["input", "suggestion", "assessment", "rubric"];
const CURRICULUM_DATASETS = [
  {
    id: "middle",
    label: "중학교",
    title: "중학교 과학 성취기준별 성취수준",
    standards: MIDDLE_SCHOOL_SCIENCE_STANDARDS,
  },
  {
    id: "high",
    label: "고등학교",
    title: "고등학교 과학 성취기준별 성취수준",
    standards: HIGH_SCHOOL_SCIENCE_STANDARDS,
  },
];

export default function App() {
  const savedApiKeys = readSavedApiKeys();
  const [page, setPage] = useState("input");
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [apiKeys, setApiKeys] = useState(savedApiKeys);
  const [saveApiKeys, setSaveApiKeys] = useState(
    Object.fromEntries(AI_PROVIDERS.map((item) => [item.id, Boolean(savedApiKeys[item.id])])),
  );
  const [model, setModel] = useState(DEFAULT_MODEL_BY_PROVIDER[DEFAULT_PROVIDER]);
  const [modelTier, setModelTier] = useState(DEFAULT_MODEL_TIER_BY_PROVIDER[DEFAULT_PROVIDER]);
  const [teacherInput, setTeacherInput] = useState(initialTeacherInput);
  const [suggestion, setSuggestion] = useState(null);
  const [selectedElementIndexes, setSelectedElementIndexes] = useState([]);
  const [customAssessmentElements, setCustomAssessmentElements] = useState([]);
  const [additionalRequest, setAdditionalRequest] = useState("");
  const [problemTypeId, setProblemTypeId] = useState(PROBLEM_TYPES[0].id);
  const [customProblemType, setCustomProblemType] = useState("");
  const [rubricLevelCount, setRubricLevelCount] = useState(4);
  const [assessment, setAssessment] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [loadingStep, setLoadingStep] = useState(null);
  const [errors, setErrors] = useState([]);
  const [rawResponse, setRawResponse] = useState("");
  const [notice, setNotice] = useState("");
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [curriculumDatasetId, setCurriculumDatasetId] = useState(CURRICULUM_DATASETS[0].id);
  const [curriculumSearch, setCurriculumSearch] = useState("");
  const [selectedCurriculumCode, setSelectedCurriculumCode] = useState(MIDDLE_SCHOOL_SCIENCE_STANDARDS[0]?.code || "");
  const [addedCurriculumCodes, setAddedCurriculumCodes] = useState([]);

  const selectedElements = useMemo(() => {
    if (!suggestion) return [];
    const suggestedElements = selectedElementIndexes
      .map((index) => suggestion.assessmentElements[index])
      .filter(Boolean);
    const customElements = customAssessmentElements
      .map((element) => ({
        title: element.title.trim(),
        focus: element.focus.trim(),
        source: "custom",
      }))
      .filter((element) => element.title && element.focus);
    return [...suggestedElements, ...customElements];
  }, [customAssessmentElements, selectedElementIndexes, suggestion]);

  const selectedProblemType = useMemo(() => {
    const problemType = PROBLEM_TYPES.find((type) => type.id === problemTypeId) || PROBLEM_TYPES[0];
    if (problemType.id !== "custom") return problemType;
    return {
      ...problemType,
      label: customProblemType.trim() || problemType.label,
      description: customProblemType.trim()
        ? `교사가 직접 입력한 문제 유형: ${customProblemType.trim()}`
        : problemType.description,
    };
  }, [customProblemType, problemTypeId]);

  const markdown = useMemo(
    () => buildMarkdown({ teacherInput, suggestion, selectedElements, selectedProblemType, additionalRequest, assessment, rubric }),
    [teacherInput, suggestion, selectedElements, selectedProblemType, additionalRequest, assessment, rubric],
  );

  const selectedCurriculumStandard = useMemo(
    () => {
      const dataset = CURRICULUM_DATASETS.find((item) => item.id === curriculumDatasetId) || CURRICULUM_DATASETS[0];
      return dataset.standards.find((standard) => standard.code === selectedCurriculumCode) || dataset.standards[0];
    },
    [curriculumDatasetId, selectedCurriculumCode],
  );

  const isBusy = Boolean(loadingStep);
  const pageIndex = PAGES.indexOf(page);
  const hasSuggestion = Boolean(suggestion);
  const hasAssessment = Boolean(assessment);
  const hasRubric = Boolean(rubric);
  const providerConfig = getProviderConfig(provider);
  const apiKey = apiKeys[provider] || "";
  const saveApiKey = Boolean(saveApiKeys[provider]);

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

  function chooseCurriculumDataset(datasetId) {
    const dataset = CURRICULUM_DATASETS.find((item) => item.id === datasetId);
    if (!dataset) return;
    setCurriculumDatasetId(datasetId);
    setCurriculumSearch("");
    setSelectedCurriculumCode(dataset.standards[0]?.code || "");
  }

  function handleAddCurriculumStandard(standard) {
    if (!standard) return;

    setTeacherInput((current) => ({
      ...current,
      achievementStandard: appendTextareaValue(current.achievementStandard, standard.standard),
      achievementLevels: Object.fromEntries(
        LEVELS.map((level) => {
          const levelText = standard.levels[level];
          const nextValue = levelText ? `${standard.code} ${levelText}` : "";
          return [
            level,
            nextValue
              ? appendTextareaValue(current.achievementLevels[level], nextValue)
              : current.achievementLevels[level],
          ];
        }),
      ),
    }));
    setAddedCurriculumCodes((current) => [...current, standard.code]);
    setErrors([]);
    setRawResponse("");
    setNotice(`${standard.code} 성취기준을 입력칸에 추가했습니다.`);
  }

  function chooseProvider(nextProvider) {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    setModelTier(DEFAULT_MODEL_TIER_BY_PROVIDER[nextProvider]);
    setModel(DEFAULT_MODEL_BY_PROVIDER[nextProvider]);
    setErrors([]);
    setRawResponse("");
    setNotice("");
  }

  function handleApiKeyChange(value) {
    setApiKeys((current) => ({ ...current, [provider]: value }));
    if (saveApiKey) {
      localStorage.setItem(STORAGE_KEYS[provider], value);
    }
  }

  function handleSaveApiKeyChange(checked) {
    setSaveApiKeys((current) => ({ ...current, [provider]: checked }));
    if (checked && apiKey) {
      localStorage.setItem(STORAGE_KEYS[provider], apiKey);
    }
    if (!checked) {
      localStorage.removeItem(STORAGE_KEYS[provider]);
    }
  }

  function clearSavedKey() {
    localStorage.removeItem(STORAGE_KEYS[provider]);
    setApiKeys((current) => ({ ...current, [provider]: "" }));
    setSaveApiKeys((current) => ({ ...current, [provider]: false }));
    setNotice(`저장된 ${providerConfig.label} API 키를 삭제했습니다.`);
  }

  function chooseModelTier(tier) {
    setModelTier(tier);
    const firstModel = AI_MODEL_OPTIONS.find((option) => option.provider === provider && option.tier === tier);
    if (firstModel) {
      setModel(firstModel.value);
    }
  }

  async function handleGenerateSuggestions() {
    const validation = validateTeacherInput({ provider, apiKey, model, teacherInput });
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }

    await runAiTask("suggestions", async () => {
      const result = await generateSuggestions({ provider, apiKey, model, teacherInput });
      assertRange(result.assessmentItems, 4, 5, "평가 항목");
      assertRange(result.assessmentElements, 3, 4, "평가 요소");
      setSuggestion(result);
      setSelectedElementIndexes([]);
      setCustomAssessmentElements([]);
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
    const validation = validateAssessmentRequest({
      apiKey,
      provider,
      model,
      teacherInput,
      suggestion,
      selectedElements,
      customAssessmentElements,
      problemTypeId,
      customProblemType,
    });
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }

    await runAiTask("assessment", async () => {
      const result = await generateAssessmentItems({
        apiKey,
        provider,
        model,
        teacherInput,
        suggestion,
        selectedElements,
        selectedProblemType,
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
    const validation = validateRubricRequest({ provider, apiKey, model, assessment, selectedElements, rubricLevelCount });
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }

    await runAiTask("rubric", async () => {
      const result = await generateRubrics({
        apiKey,
        provider,
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
      if (error.name === "AiParseError") {
        setRawResponse(typeof error.raw === "string" ? error.raw : JSON.stringify(error.raw, null, 2));
      }
      if (error.name === "AiRequestError" && error.details) {
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
    clearGeneratedOutputs();
  }

  function addCustomAssessmentElement() {
    setCustomAssessmentElements((current) => [
      ...current,
      { id: createElementId(), title: "", focus: "" },
    ]);
    clearGeneratedOutputs();
  }

  function updateCustomAssessmentElement(id, field, value) {
    setCustomAssessmentElements((current) =>
      current.map((element) =>
        element.id === id ? { ...element, [field]: value } : element,
      ),
    );
    clearGeneratedOutputs();
  }

  function removeCustomAssessmentElement(id) {
    setCustomAssessmentElements((current) => current.filter((element) => element.id !== id));
    clearGeneratedOutputs();
  }

  function updateAdditionalRequest(value) {
    setAdditionalRequest(value);
    setAssessment(null);
    setRubric(null);
  }

  function updateProblemType(value) {
    setProblemTypeId(value);
    setAssessment(null);
    setRubric(null);
  }

  function updateCustomProblemType(value) {
    setCustomProblemType(value);
    setAssessment(null);
    setRubric(null);
  }

  function updateRubricLevelCount(value) {
    setRubricLevelCount(value);
    setRubric(null);
  }

  function clearGeneratedOutputs() {
    setAssessment(null);
    setRubric(null);
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
            <ProviderSelector provider={provider} onProviderChange={chooseProvider} />
            <label className="field">
              <span>{providerConfig.apiKeyLabel}</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => handleApiKeyChange(event.target.value)}
                placeholder={providerConfig.apiKeyPlaceholder}
                autoComplete="off"
              />
              <small className="field-help">{providerConfig.keyHint}</small>
            </label>
            <ModelSelector
              provider={provider}
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
            <CurriculumLoader
              addedCodes={addedCurriculumCodes}
              isOpen={curriculumOpen}
              onAdd={handleAddCurriculumStandard}
              onDatasetChange={chooseCurriculumDataset}
              onOpenChange={setCurriculumOpen}
              onSearchChange={setCurriculumSearch}
              onSelect={setSelectedCurriculumCode}
              selectedDatasetId={curriculumDatasetId}
              search={curriculumSearch}
              selectedStandard={selectedCurriculumStandard}
              datasets={CURRICULUM_DATASETS}
            />
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
                  <div className="custom-elements">
                    {customAssessmentElements.map((element, index) => (
                      <div className="custom-element-card" key={element.id}>
                        <div className="custom-element-head">
                          <strong>직접 입력 평가 요소 {index + 1}</strong>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => removeCustomAssessmentElement(element.id)}
                            aria-label="직접 입력 평가 요소 삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <label className="field compact">
                          <span>평가 요소명</span>
                          <input
                            value={element.title}
                            onChange={(event) =>
                              updateCustomAssessmentElement(element.id, "title", event.target.value)
                            }
                            placeholder="예: 생태계 상호작용을 근거로 설명하기"
                          />
                        </label>
                        <label className="field compact">
                          <span>평가 초점</span>
                          <textarea
                            value={element.focus}
                            onChange={(event) =>
                              updateCustomAssessmentElement(element.id, "focus", event.target.value)
                            }
                            rows={3}
                            placeholder="예: 제시문 속 실제 사례를 활용해 생물 간 관계와 물질 순환을 논리적으로 연결한다."
                          />
                        </label>
                      </div>
                    ))}
                    <button
                      className="button secondary add-element-button"
                      type="button"
                      onClick={addCustomAssessmentElement}
                    >
                      <PlusCircle size={17} />
                      평가 요소 추가
                    </button>
                  </div>
                </ResultGroup>
              </div>

              <div className="request-grid">
                <div className="request-main">
                  <label className="field">
                    <span>추가 요청사항</span>
                    <textarea
                      value={additionalRequest}
                      onChange={(event) => updateAdditionalRequest(event.target.value)}
                      rows={4}
                      placeholder="예: 학교 주변의 실제 생태 맥락을 제시문에 반영해 주세요."
                    />
                  </label>
                  <div className="problem-type-panel">
                    <label className="field">
                      <span>문제 유형</span>
                      <select
                        value={problemTypeId}
                        onChange={(event) => updateProblemType(event.target.value)}
                      >
                        {PROBLEM_TYPES.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {problemTypeId === "custom" && (
                      <label className="field compact">
                        <span>직접 입력 문제 유형</span>
                        <input
                          value={customProblemType}
                          onChange={(event) => updateCustomProblemType(event.target.value)}
                          placeholder="예: 실험 설계형"
                        />
                      </label>
                    )}
                    <details className="type-details">
                      <summary>{selectedProblemType.label}</summary>
                      <p>{selectedProblemType.description}</p>
                      {selectedProblemType.example && <pre>{selectedProblemType.example}</pre>}
                    </details>
                  </div>
                </div>
                <div className="request-side">
                  <label className="field">
                    <span>채점 단계 수</span>
                    <select
                      value={rubricLevelCount}
                      onChange={(event) => updateRubricLevelCount(Number(event.target.value))}
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

function ProviderSelector({ provider, onProviderChange }) {
  return (
    <div className="model-selector">
      <span className="field-label">AI 제공자</span>
      <div className="segmented-control" role="group" aria-label="AI 제공자 선택">
        {AI_PROVIDERS.map((option) => (
          <button
            className={provider === option.id ? "active" : ""}
            key={option.id}
            type="button"
            onClick={() => onProviderChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ModelSelector({ provider, model, modelTier, onTierChange, onModelChange }) {
  const filteredModels = AI_MODEL_OPTIONS.filter(
    (option) => option.provider === provider && option.tier === modelTier,
  );
  const tierOptions = MODEL_TIER_OPTIONS[provider] || [];

  return (
    <div className="model-selector">
      <span className="field-label">모델 구분</span>
      <div className="segmented-control" role="group" aria-label="모델 구분 선택">
        {tierOptions.map((option) => (
          <button
            className={modelTier === option.id ? "active" : ""}
            key={option.id}
            type="button"
            onClick={() => onTierChange(option.id)}
          >
            {option.label}
          </button>
        ))}
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

function CurriculumLoader({
  addedCodes,
  datasets,
  isOpen,
  onAdd,
  onDatasetChange,
  onOpenChange,
  onSearchChange,
  onSelect,
  search,
  selectedDatasetId,
  selectedStandard,
}) {
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) || datasets[0];
  const standards = selectedDataset.standards;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredStandards = standards.filter((standard) => {
    if (!normalizedSearch) return true;
    return (
      standard.code.toLowerCase().includes(normalizedSearch) ||
      standard.standard.toLowerCase().includes(normalizedSearch)
    );
  });
  const addedCodeSet = new Set(addedCodes);

  return (
    <section className="curriculum-loader" aria-label="교육과정 자료 불러오기">
      <div className="curriculum-loader-head">
        <div>
          <span className="field-label">교육과정 자료 불러오기</span>
          <strong>{selectedDataset.title}</strong>
        </div>
        <div className="curriculum-school-group" role="group" aria-label="학교급 자료 선택">
          {datasets.map((dataset) => (
            <button
              className={
                isOpen && selectedDatasetId === dataset.id
                  ? "button secondary curriculum-school active"
                  : "button ghost curriculum-school"
              }
              key={dataset.id}
              type="button"
              onClick={() => {
                if (isOpen && selectedDatasetId === dataset.id) {
                  onOpenChange(false);
                  return;
                }
                onDatasetChange(dataset.id);
                onOpenChange(true);
              }}
            >
              <BookOpen size={17} />
              {dataset.label}
            </button>
          ))}
        </div>
      </div>

      {isOpen && (
        <div className="curriculum-browser">
          <label className="field compact curriculum-search">
            <span>
              <Search size={15} />
              성취기준 검색
            </span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="[9과01-01]"
            />
          </label>

          <div className="curriculum-content">
            <div className="curriculum-code-list" aria-label="성취기준 번호 목록">
              {filteredStandards.map((standard) => {
                const isSelected = selectedStandard?.code === standard.code;
                const isAdded = addedCodeSet.has(standard.code);
                return (
                  <button
                    className={isSelected ? "curriculum-code selected" : "curriculum-code"}
                    key={standard.code}
                    type="button"
                    onClick={() => onSelect(standard.code)}
                  >
                    <span>{standard.code}</span>
                    {isAdded && <small>이미 추가됨</small>}
                  </button>
                );
              })}
              {filteredStandards.length === 0 && (
                <div className="curriculum-empty">검색 결과가 없습니다.</div>
              )}
            </div>

            {selectedStandard && (
              <div className="curriculum-preview">
                <div className="curriculum-preview-head">
                  <strong>{selectedStandard.code}</strong>
                  {addedCodeSet.has(selectedStandard.code) && (
                    <span>
                      <CheckCircle2 size={15} />
                      이미 추가됨
                    </span>
                  )}
                </div>
                <p>{selectedStandard.standard}</p>
                <div className="curriculum-levels">
                  {LEVELS.map((level) => (
                    <div className="curriculum-level" key={level}>
                      <strong>{level}</strong>
                      <span>{selectedStandard.levels[level] || "원문에 없음"}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="button primary curriculum-add"
                  type="button"
                  onClick={() => onAdd(selectedStandard)}
                >
                  <PlusCircle size={17} />
                  성취기준 추가
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
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

function validateTeacherInput({ provider, apiKey, model, teacherInput }) {
  const messages = [];
  const providerLabel = getProviderConfig(provider).label;
  if (!apiKey.trim()) messages.push(`${providerLabel} API 키를 입력해 주세요.`);
  if (!model.trim()) messages.push(`${providerLabel} 모델을 선택해 주세요.`);
  if (!teacherInput.achievementStandard.trim()) messages.push("성취기준을 입력해 주세요.");
  const filledLevelCount = LEVELS.filter((level) => teacherInput.achievementLevels[level].trim()).length;
  if (filledLevelCount < 3) {
    messages.push("성취수준을 3개 이상 입력해 주세요.");
  }
  return messages;
}

function validateAssessmentRequest({
  apiKey,
  provider,
  model,
  teacherInput,
  suggestion,
  selectedElements,
  customAssessmentElements,
  problemTypeId,
  customProblemType,
}) {
  const messages = validateTeacherInput({ provider, apiKey, model, teacherInput });
  if (!suggestion) messages.push("먼저 평가 항목과 평가 요소를 생성해 주세요.");
  if (selectedElements.length === 0) messages.push("문항으로 만들 평가 요소를 1개 이상 선택해 주세요.");
  if (problemTypeId === "custom" && !customProblemType.trim()) {
    messages.push("기타 문제 유형을 선택한 경우 직접 입력 문제 유형을 입력해 주세요.");
  }
  customAssessmentElements.forEach((element, index) => {
    const hasTitle = Boolean(element.title.trim());
    const hasFocus = Boolean(element.focus.trim());
    if (hasTitle !== hasFocus) {
      messages.push(`직접 입력 평가 요소 ${index + 1}의 평가 요소명과 평가 초점을 모두 입력해 주세요.`);
    }
  });
  return messages;
}

function validateRubricRequest({ provider, apiKey, model, assessment, selectedElements, rubricLevelCount }) {
  const messages = [];
  const providerLabel = getProviderConfig(provider).label;
  if (!apiKey.trim()) messages.push(`${providerLabel} API 키를 입력해 주세요.`);
  if (!model.trim()) messages.push(`${providerLabel} 모델을 선택해 주세요.`);
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

function readSavedApiKeys() {
  return Object.fromEntries(
    AI_PROVIDERS.map((provider) => {
      try {
        return [provider.id, localStorage.getItem(STORAGE_KEYS[provider.id]) || ""];
      } catch {
        return [provider.id, ""];
      }
    }),
  );
}

function getProviderConfig(provider) {
  return AI_PROVIDERS.find((item) => item.id === provider) || AI_PROVIDERS[0];
}

function createElementId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function appendTextareaValue(currentValue, nextValue) {
  const current = currentValue.trimEnd();
  return current ? `${current}\n${nextValue}` : nextValue;
}
