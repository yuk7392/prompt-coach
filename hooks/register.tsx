import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  ModelCompleteResult,
  ModelForkResult,
  ModelUsage,
  Register,
  RenderElement,
  RenderSurface,
} from 'claude-code'

import type { ButtonId, HotkeyMode, Prefs, SettingsTab } from '../types'

// 개발 중 확인용: 어느 화면에서 입력창을 읽고 채울 수 있는지 trace.log에 남긴다.
const TRACE = false
const TRACE_MAX = 200

const busy = atom({ plugin: 'prompt-coach', key: 'busy' } as const, null)
const original = atom({ plugin: 'prompt-coach', key: 'original' } as const, null)
// 설정 패널에 적은 이번 세션용 요청. 지울 때까지 두 버튼 모두에 붙는다.
const note = atom({ plugin: 'prompt-coach', key: 'note' } as const, '')
// 빈 답 경고를 한 번 보여 준 초안. 같은 초안을 다시 보내면 그대로 보낸다.
const warned = atom({ plugin: 'prompt-coach', key: 'warned' } as const, null)
// 설정 패널에서 바꾼 값. $.store 에 저장해 세션을 넘어 유지하고, 기본값 위에 얹는다.
const prefs = atom({ plugin: 'prompt-coach', key: 'prefs' } as const, {})
// 설정 패널에서 보고 있는 탭.
const tab = atom({ plugin: 'prompt-coach', key: 'tab' } as const, 'general')
// 초기화 확인 버튼을 보이는 상태. 확인 버튼을 따로 눌러야 초기화한다.
const resetArmed = atom({ plugin: 'prompt-coach', key: 'resetArmed' } as const, false)
// 골격 칸에 친 글(줄 번호 → 글). 저장할 때까지 화면 상태에 쓰지 않는다.
// 데스크톱은 다시 그릴 때마다 입력칸을 새로 만들어서, 칠 때마다 상태를 쓰면 글자가 빠지고 한글 조합이 끊긴다.
const typedLines = new Map<number, string>()

const HEADER = '[Clarify]'
const SETTINGS = 'coach-settings'
const REPO = 'https://github.com/yuk7392/prompt-coach'
const LANGUAGES = ['auto', 'en', 'ko'] as const
const HOTKEY_MODES = ['auto', 'on', 'off'] as const
const BUTTON_IDS = ['template', 'ask', 'refine', 'undo'] as const
const TABS = ['general', 'ask', 'refine', 'template', 'about'] as const
const QUESTION_COUNTS = [1, 2, 3, 4, 5] as const
const MODELS = ['haiku', 'sonnet', 'opus', 'session'] as const
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const MIN_DRAFTS = [0, 12, 30, 60] as const
const TEMPLATE_MAX_LINES = 30

// 색은 테마 이름으로 준다. 데스크톱은 앱의 밝은/어두운 테마 색으로, 터미널은 Claude Code 테마 색으로 그린다.
const BRAND = 'claude'
const HINT = 'inactive'

// 모든 기능의 설정값. 설정 패널에서 저장한 값이 이 기본값 위에 얹힌다.
type Settings = {
  language: (typeof LANGUAGES)[number]
  buttons: Record<ButtonId, boolean>
  hotkeys: HotkeyMode
  warnBlank: boolean
  showUsage: boolean
  askStyle: string
  maxQuestions: (typeof QUESTION_COUNTS)[number]
  refineStyle: string
  refineModel: (typeof MODELS)[number]
  refineEffort: (typeof EFFORTS)[number]
  minDraft: (typeof MIN_DRAFTS)[number]
  template: string[] | undefined
}

const DEFAULTS: Settings = {
  language: 'auto',
  buttons: { template: true, ask: true, refine: true, undo: true },
  hotkeys: 'auto',
  warnBlank: true,
  showUsage: false,
  askStyle: '',
  maxQuestions: 3,
  refineStyle: '',
  refineModel: 'haiku',
  refineEffort: 'low',
  minDraft: 12,
  template: undefined,
}

const EN = {
  changed: 'The draft changed while working, so it was left as is',
  notFilled: (why: string) => `Could not put the text in the prompt box (${why})`,
  unknown: 'unknown reason',
  empty: 'Nothing typed yet',
  asking: 'Looking for what is missing…',
  noHistory: 'No conversation yet to ask from',
  noQuestions: (why: string) => `Could not get questions (${why})`,
  nothingToAsk: 'Nothing more to ask',
  refining: 'Refining…',
  noRefine: (why: string) => `Could not refine (${why})`,
  tooShort: 'The draft is too short to refine',
  notADraft: 'the reply was not a refined draft',
  templateEmpty: 'The template is empty',
  template: 'Template',
  ask: 'Ask what is missing',
  refine: 'Refine',
  undo: 'Undo',
  settings: 'Settings',
  directionOn: 'direction on',
  blank: (n: number) => `${n} [Clarify] question(s) have no answer. Press Enter again to send anyway.`,
  usage: (label: string, input: number, cached: number, output: number) =>
    `${label}: input ${input} + cache ${cached}, output ${output} tokens`,
  askCommand: 'Ask what the given draft is missing (for apps that draw their own prompt box)',
  refineCommand: 'Refine the given draft (for apps that draw their own prompt box)',
  settingsCommand: 'Open prompt-coach settings',
  copied: '(Copied to the clipboard.)',
  settingsOpened: 'prompt-coach settings opened.',
  paneTitle: 'prompt-coach settings',
  tabs: { general: 'General', ask: 'Ask', refine: 'Refine', template: 'Template', about: 'About' } as Record<SettingsTab, string>,
  on: 'On',
  off: 'Off',
  save: 'Save',
  apply: 'Apply',
  saved: 'Saved',
  close: 'Close',
  none: '(none)',
  mobileText: 'Text fields cannot be edited in the mobile app.',
  language: 'Language',
  languageHint: 'Auto follows the language setting of Claude Code.',
  auto: 'Auto',
  buttonsLabel: 'Buttons in the band',
  buttonsHint: 'A button you turn off leaves the band. Settings always stays.',
  hotkeysLabel: 'Hotkeys',
  hotkeysHint: 'Auto turns the keys on in the terminal only. On the desktop a key always comes with a key box beside the button.',
  always: 'Always',
  warnBlankLabel: 'Warn about blank answers',
  warnBlankHint: 'Stops the first Enter when a [Clarify] answer is empty.',
  usageLabel: 'Show tokens',
  usageHint: 'Shows the tokens each press used. It costs nothing extra.',
  noteLabel: 'Direction for this session',
  noteHint: 'After Apply, it goes to Ask and Refine until you clear it. It is not saved.',
  notePlaceholder: 'e.g. formal tone',
  maxQuestionsLabel: 'Questions at most',
  maxQuestionsHint: 'Ask adds up to this many questions.',
  askStyleLabel: 'Ask style',
  askStyleHint: 'A direction that always goes to Ask.',
  askStylePlaceholder: 'e.g. ask scope first',
  askModelLabel: 'Model',
  askModelHint: (model: string) =>
    `Ask uses the session model (${model}). It reuses the conversation cache, so you cannot change it.`,
  refineModelLabel: 'Model',
  refineModelHint: 'Refine sends only the draft, so a small model is enough.',
  sessionModel: 'Session model',
  effortLabel: 'Effort',
  effortHint: 'Higher effort thinks longer and costs more.',
  effortHaiku: 'haiku takes no effort setting.',
  refineStyleLabel: 'Refine style',
  refineStyleHint: 'A direction that always goes to Refine.',
  refineStylePlaceholder: 'e.g. conditions as bullets',
  minDraftLabel: 'Skip short drafts',
  minDraftHint: 'Refine does nothing when the draft has fewer characters than this, spaces not counted.',
  chars: (n: number) => (n === 0 ? 'Never skip' : `Under ${n}`),
  templateLabel: 'Template',
  templateHint: 'The Template button inserts this. An empty prompt box gets the template; a draft gets it at the end. Press Enter in a line, or Save, to keep your edits.',
  templateBuiltIn: 'Built-in template',
  templateCustom: 'Your template',
  linePlaceholder: 'empty line',
  addLine: 'Add line',
  removeLine: 'Remove',
  templateReset: 'Use the built-in template',
  templateSaved: 'Template saved',
  templateUnchanged: 'Nothing changed',
  versionLabel: 'Version',
  commandsLabel: 'Slash commands',
  commandsHint: '/coach-ask <draft> and /coach-refine <draft> show the result and copy it. /coach-settings opens this panel.',
  promptsLabel: 'Instruction files',
  promptsHint: 'Edits take effect on the next press. An update of the plugin puts the files back.',
  copyPath: 'Copy path',
  pathCopied: 'Path copied',
  repoLabel: 'Repository',
  reset: 'Reset all settings',
  resetAsk: 'Your saved styles, template, and model settings will be removed.',
  resetConfirm: 'Reset',
  cancel: 'Cancel',
  resetDone: 'Settings are back to the defaults',
}

const KO: typeof EN = {
  changed: '그 사이 입력이 바뀌어서 반영하지 않았어요',
  notFilled: why => `입력창에 넣지 못했어요 (${why})`,
  unknown: '이유 모름',
  empty: '입력 중인 내용이 없어요',
  asking: '빠진 것 찾는 중…',
  noHistory: '대화가 아직 없어서 물을 근거가 없어요',
  noQuestions: why => `질문을 못 받았어요 (${why})`,
  nothingToAsk: '더 물을 것이 없어요',
  refining: '다듬는 중…',
  noRefine: why => `다듬지 못했어요 (${why})`,
  tooShort: '다듬기엔 초안이 너무 짧아요',
  notADraft: '다듬은 초안이 아닌 답이 왔어요',
  templateEmpty: '골격이 비어 있어요',
  template: '골격',
  ask: '빠진 것 묻기',
  refine: '다듬기',
  undo: '되돌리기',
  settings: '설정',
  directionOn: '원하는 방식 적용 중',
  blank: n => `[Clarify] 질문 ${n}개에 답이 비어 있어요. 그대로 보내려면 다시 Enter를 누르세요.`,
  usage: (label, input, cached, output) => `${label}: 입력 ${input} + 캐시 ${cached}, 출력 ${output} 토큰`,
  askCommand: '적은 초안에 빠진 것을 묻는다 (입력창을 직접 그리는 앱용)',
  refineCommand: '적은 초안을 다듬는다 (입력창을 직접 그리는 앱용)',
  settingsCommand: 'prompt-coach 설정을 연다',
  copied: '(클립보드에 복사했어요.)',
  settingsOpened: 'prompt-coach 설정을 열었어요.',
  paneTitle: 'prompt-coach 설정',
  tabs: { general: '일반', ask: '빠진 것 묻기', refine: '다듬기', template: '골격', about: '정보' },
  on: '켜기',
  off: '끄기',
  save: '저장',
  apply: '적용',
  saved: '저장했어요',
  close: '닫기',
  none: '(없음)',
  mobileText: '글자 칸은 모바일 앱에서 고칠 수 없어요.',
  language: '언어',
  languageHint: '자동은 Claude Code의 언어 설정을 따라요.',
  auto: '자동',
  buttonsLabel: '띠에 보일 버튼',
  buttonsHint: '끈 버튼은 띠에서 사라져요. 설정 버튼은 늘 보여요.',
  hotkeysLabel: '단축키',
  hotkeysHint: '자동은 터미널에서만 키를 켜요. 데스크톱에서 켜면 버튼 옆에 키 상자가 함께 붙어요.',
  always: '항상',
  warnBlankLabel: '보내기 전 빈칸 경고',
  warnBlankHint: '[Clarify] 답이 빈 채로 Enter를 누르면 한 번 멈춰요.',
  usageLabel: '토큰 표시',
  usageHint: '누를 때마다 쓴 토큰을 알림으로 보여 줘요. 추가 비용은 없어요.',
  noteLabel: '이번 세션 원하는 방식',
  noteHint: '적용을 누르면 지울 때까지 묻기와 다듬기에 함께 붙어요. 저장되지 않아요.',
  notePlaceholder: '예: 존댓말로',
  maxQuestionsLabel: '질문 수',
  maxQuestionsHint: '빠진 것 묻기가 붙이는 질문의 최대 개수예요.',
  askStyleLabel: '묻기 스타일',
  askStyleHint: '빠진 것 묻기에 늘 붙는 지시예요.',
  askStylePlaceholder: '예: 범위부터 물어봐',
  askModelLabel: '모델',
  askModelHint: model => `세션 모델(${model})을 그대로 써요. 대화 캐시를 다시 쓰기 때문에 바꿀 수 없어요.`,
  refineModelLabel: '모델',
  refineModelHint: '다듬기는 대화 없이 초안만 보내서 작은 모델로도 충분해요.',
  sessionModel: '세션 모델',
  effortLabel: 'Effort',
  effortHint: 'effort가 높을수록 오래 생각하고 비용이 늘어요.',
  effortHaiku: 'haiku는 effort를 쓰지 않아요.',
  refineStyleLabel: '다듬기 스타일',
  refineStyleHint: '다듬기에 늘 붙는 지시예요.',
  refineStylePlaceholder: '예: 조건은 목록으로',
  minDraftLabel: '짧은 초안 건너뛰기',
  minDraftHint: '공백을 뺀 글자 수가 이보다 적으면 다듬지 않아요.',
  chars: n => (n === 0 ? '건너뛰지 않음' : `${n}자 미만`),
  templateLabel: '골격',
  templateHint: '골격 버튼이 넣는 틀이에요. 입력창이 비어 있으면 틀로 채우고, 쓰던 내용이 있으면 끝에 붙여요. 줄에서 Enter나 저장을 누르면 고친 내용이 남아요.',
  templateBuiltIn: '기본 골격',
  templateCustom: '직접 만든 골격',
  linePlaceholder: '빈 줄',
  addLine: '줄 추가',
  removeLine: '삭제',
  templateReset: '기본 골격으로',
  templateSaved: '골격을 저장했어요',
  templateUnchanged: '바뀐 것이 없어요',
  versionLabel: '버전',
  commandsLabel: '슬래시 명령',
  commandsHint: '/coach-ask <초안>, /coach-refine <초안>은 결과를 보여 주고 클립보드에 복사해요. /coach-settings는 이 창을 열어요.',
  promptsLabel: '지시문 파일',
  promptsHint: '고치면 다음 누를 때부터 반영돼요. 플러그인을 업데이트하면 원래대로 돌아가요.',
  copyPath: '경로 복사',
  pathCopied: '경로를 복사했어요',
  repoLabel: '저장소',
  reset: '모든 설정 초기화',
  resetAsk: '저장한 스타일, 골격, 모델 설정이 모두 지워져요.',
  resetConfirm: '초기화',
  cancel: '취소',
  resetDone: '설정을 기본값으로 돌렸어요',
}

type Strings = typeof EN

const STRINGS: Record<'en' | 'ko', Strings> = { en: EN, ko: KO }

// settings.json 의 language. session.start 가 읽고, 언어 설정이 auto 일 때 쓴다.
let systemLanguage: 'en' | 'ko' = 'en'

const readSystemLanguage = async ($: EngineInterface) => {
  const { language } = await $.settings.read()

  systemLanguage = typeof language === 'string' && /^(ko|korean)|한국/i.test(language.trim()) ? 'ko' : 'en'
}

const oneOf = <T extends string | number>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.find(one => one === value) ?? fallback

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

const words = (value: unknown) => (typeof value === 'string' ? value : '')

const lineList = (value: unknown) =>
  Array.isArray(value) && value.every(one => typeof one === 'string')
    ? (value as string[]).slice(0, TEMPLATE_MAX_LINES)
    : undefined

// 저장값을 검사해 기본값 위에 얹는다. 모르는 값이나 범위 밖 값은 기본값으로 둔다.
const settingsOf = (p: Prefs): Settings => {
  const shown: unknown = p.buttons
  const button = (id: ButtonId) =>
    flag(typeof shown === 'object' && shown !== null ? (shown as Record<string, unknown>)[id] : undefined, true)

  return {
    language: oneOf(LANGUAGES, p.language, DEFAULTS.language),
    buttons: { template: button('template'), ask: button('ask'), refine: button('refine'), undo: button('undo') },
    hotkeys: oneOf(HOTKEY_MODES, p.hotkeys, DEFAULTS.hotkeys),
    warnBlank: flag(p.warnBlank, DEFAULTS.warnBlank),
    showUsage: flag(p.showUsage, DEFAULTS.showUsage),
    askStyle: words(p.askStyle),
    maxQuestions: oneOf(QUESTION_COUNTS, p.maxQuestions, DEFAULTS.maxQuestions),
    refineStyle: words(p.refineStyle),
    refineModel: oneOf(MODELS, p.refineModel, DEFAULTS.refineModel),
    refineEffort: oneOf(EFFORTS, p.refineEffort, DEFAULTS.refineEffort),
    minDraft: oneOf(MIN_DRAFTS, p.minDraft, DEFAULTS.minDraft),
    template: lineList(p.template),
  }
}

const current = async ($: EngineInterface) => settingsOf(await read($, prefs))

const textsOf = (settings: Settings) => STRINGS[settings.language === 'auto' ? systemLanguage : settings.language]

// 단축키는 띠와 패널의 버튼에 붙는다. 데스크톱은 키를 버튼 옆 상자로 그려서, 자동이면 터미널에만 붙인다.
const showsKeys = (settings: Settings, surface: RenderSurface) =>
  settings.hotkeys === 'on' || (settings.hotkeys === 'auto' && surface === 'terminal')

const storedPrefs = async ($: EngineInterface): Promise<Prefs> => {
  const stored = await $.store.get('prefs')

  return stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Prefs) : {}
}

// 들어온 순서대로 하나씩 처리하는 줄. 앞의 일이 끝나기 전에 다음 일이 값을 읽으면 앞의 변경이 사라진다.
// 한 줄 안의 일은 같은 줄에 다시 넣지 않는다. 넣으면 앞의 일을 기다리다 멈춘다.
const queue = () => {
  let last: Promise<unknown> = Promise.resolve()

  return <T,>(work: () => Promise<T>): Promise<T> => {
    const run = last.then(work, work)

    last = run.catch(() => {})

    return run
  }
}

// 설정을 읽고 쓰는 일은 모두 이 줄에서 돈다.
const prefsQueue = queue()

// 다른 세션에서 바꾼 설정을 가져온다. 값이 같으면 쓰지 않아서 띠와 패널을 다시 그리지 않는다.
// 설정 줄에서 돈다. 줄 밖에서 읽으면 진행 중인 저장보다 늦게 써서 방금 저장한 값을 옛 값으로 되돌린다.
const loadPrefs = ($: EngineInterface) =>
  prefsQueue(async () => {
    const stored = await storedPrefs($)

    if (JSON.stringify(stored) !== JSON.stringify(await read($, prefs))) {
      await update($, prefs, () => stored)
    }
  })

// 버튼은 누른 순간의 설정으로 일한다. 다른 세션에서 바꾼 값도 여기서 반영된다.
const fresh = async ($: EngineInterface) => {
  await loadPrefs($)

  return current($)
}

// 바꾸는 값은 저장소의 최신 값에서 계산한다. 이 세션이 읽어 둔 값에서 계산하면 다른 세션이 저장한 값을 지운다.
const savePrefs = ($: EngineInterface, change: (all: Prefs) => Prefs) =>
  prefsQueue(async () => {
    const next = change(await storedPrefs($))

    await $.store.set('prefs', next)
    await update($, prefs, () => next)

    return next
  })

const registerCommands = async ($: EngineInterface, t: Strings) => {
  // 입력창을 직접 그리는 화면에서도 쓸 수 있는 길. 초안을 인자로 받는다.
  await $.command.register({ name: 'coach-ask', description: t.askCommand, argumentHint: '<draft>' })
  await $.command.register({ name: 'coach-refine', description: t.refineCommand, argumentHint: '<draft>' })
  await $.command.register({ name: 'coach-settings', description: t.settingsCommand })
}

const traced: string[] = []

const trace = ($: EngineInterface, line: string) => {
  if (!TRACE || traced.length >= TRACE_MAX) {
    return
  }

  traced.push(`${new Date().toISOString()} ${line}`)
  void $.fs.write(`${$.plugin.root}/trace.log`, traced.join('\n') + '\n').catch(() => {})
}

// 기본 지시문은 prompts/*.md 에 있고 누를 때마다 새로 읽는다.
// {{style}} 에는 저장한 스타일과 이번 세션 요청이, {{draft}} 에는 초안이, {{max}} 에는 질문 수가 들어간다.
const promptFile = async ($: EngineInterface, name: 'ask' | 'refine', settings: Settings, draft = '') => {
  const saved = name === 'ask' ? settings.askStyle : settings.refineStyle
  const lines = [saved.trim(), (await read($, note)).trim()].filter(one => one !== '')
  const style =
    lines.length === 0
      ? ''
      : [
          "The user's own direction for this step, to follow unless it would drop or change what they wrote:",
          '',
          '<style>',
          ...lines,
          '</style>',
          '',
        ].join('\n')
  const body = await $.fs.read(`${$.plugin.root}/prompts/${name}.md`)
  const values: Record<string, string> = { style, draft, max: String(settings.maxQuestions) }

  // 한 번에 바꾼다. 차례로 바꾸면 초안에 든 '{{max}}' 같은 글자가 다시 바뀐다.
  return body.replace(/\{\{(style|draft|max)\}\}/g, (_, key: string) => values[key] ?? '')
}

const modelFor = async ($: EngineInterface, settings: Settings) =>
  settings.refineModel === 'session' ? await $.session.model() : settings.refineModel

// 설정에서 켜면 호출마다 쓴 토큰을 토스트로 보여 준다. 결과에 실려 오는 값이라 추가 비용이 없다.
const reportUsage = ($: EngineInterface, settings: Settings, label: string, usage: ModelUsage | undefined) => {
  if (!settings.showUsage || usage === undefined) {
    return
  }

  const t = textsOf(settings)

  $.ui.toast(t.usage(label, usage.input_tokens + usage.cache_creation_input_tokens, usage.cache_read_input_tokens, usage.output_tokens), {
    timeoutMs: 8000,
  })
}

// 모델이 일하는 동안 사용자가 입력창을 고쳤으면 덮어쓰지 않는다.
const fillIfUnchanged = async ($: EngineInterface, t: Strings, draft: string, value: string, mode: 'replace' | 'append') => {
  const now = await $.prompt.read()

  if (now.text !== draft) {
    $.ui.toast(t.changed)

    return false
  }

  const filled = await $.prompt.fill({ text: value, mode })

  trace($, `fill mode=${mode} isFilled=${filled.isFilled} refusal=${filled.refusal ?? '-'}`)

  if (!filled.isFilled) {
    $.ui.toast(t.notFilled(filled.refusal ?? t.unknown))
  }

  return filled.isFilled
}

const readDraft = async ($: EngineInterface, t: Strings, surface: string) => {
  const box = await $.prompt.read()

  trace($, `read surface=${surface} length=${box.text.length}`)

  if (box.text.trim() === '') {
    $.ui.toast(t.empty)

    return undefined
  }

  return box.text
}

// 버튼과 슬래시 명령이 함께 쓰는 핵심. 성공하면 결과, 실패하면 보여 줄 문구를 돌려준다.
type Outcome = { text: string; isDone: boolean }

// 엔진이 보내기를 거절한 호출(막힌 모델 등)이나 지시문 파일을 못 읽은 경우는 결과가 아니라 예외로 온다.
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

const clarifyBlock = async ($: EngineInterface, draft: string, settings: Settings): Promise<Outcome> => {
  const t = textsOf(settings)
  let r: ModelForkResult

  try {
    r = await $.model.fork({ prompt: await promptFile($, 'ask', settings, draft) })
  } catch (error) {
    return { isDone: false, text: t.noQuestions(reasonOf(error)) }
  }

  trace($, `fork answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)
  reportUsage($, settings, t.ask, 'usage' in r ? r.usage : undefined)

  if (!r.isAnswered) {
    return { isDone: false, text: r.reason === 'nothing-to-fork' ? t.noHistory : t.noQuestions(r.reason) }
  }

  const questions = r.text
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(line => line !== '' && line.toUpperCase() !== 'NONE')
    .slice(0, settings.maxQuestions)

  return questions.length === 0
    ? { isDone: false, text: t.nothingToAsk }
    : { isDone: true, text: `${HEADER}\n${questions.map(q => `- ${q}\n  → `).join('\n')}` }
}

const refined = async ($: EngineInterface, draft: string, settings: Settings): Promise<Outcome> => {
  const t = textsOf(settings)

  if (draft.replace(/\s/g, '').length < settings.minDraft) {
    return { isDone: false, text: t.tooShort }
  }

  const model = await modelFor($, settings)
  let r: ModelCompleteResult

  try {
    r = await $.model.complete({
      model,
      system: await promptFile($, 'refine', settings),
      prompt: `<draft>\n${draft}\n</draft>`,
      effort: settings.refineEffort,
      maxTokens: 16000,
    })
  } catch (error) {
    return { isDone: false, text: t.noRefine(reasonOf(error)) }
  }

  trace($, `complete model=${model} answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)
  reportUsage($, settings, t.refine, r.usage)

  if (!r.isAnswered) {
    return { isDone: false, text: t.noRefine(r.reason) }
  }

  // 태그 안의 결과만 받는다. 태그가 없으면 초안 대신 대화로 답한 것이라 입력창에 넣지 않는다.
  const body = /<refined>([\s\S]*?)<\/refined>/.exec(r.text)?.[1]?.trim() ?? ''

  return body === '' ? { isDone: false, text: t.noRefine(t.notADraft) } : { isDone: true, text: body }
}

const askGaps = async ($: EngineInterface, surface: string) => {
  const settings = await fresh($)
  const t = textsOf(settings)
  const draft = await readDraft($, t, surface)

  if (draft === undefined) {
    return
  }

  await update($, busy, () => t.asking)

  try {
    const r = await clarifyBlock($, draft, settings)

    if (!r.isDone) {
      $.ui.toast(r.text)

      return
    }

    await update($, original, () => draft)
    await fillIfUnchanged($, t, draft, `\n\n${r.text}`, 'append')
  } finally {
    await update($, busy, () => null)
  }
}

const refine = async ($: EngineInterface, surface: string) => {
  const settings = await fresh($)
  const t = textsOf(settings)
  const draft = await readDraft($, t, surface)

  if (draft === undefined) {
    return
  }

  await update($, busy, () => t.refining)

  try {
    const r = await refined($, draft, settings)

    if (!r.isDone) {
      $.ui.toast(r.text)

      return
    }

    // 묻기 전 원문이 이미 있으면 그것을 되돌릴 자리로 둔다.
    const kept = await read($, original)

    if (kept === null || !draft.startsWith(kept)) {
      await update($, original, () => draft)
    }

    await fillIfUnchanged($, t, draft, r.text, 'replace')
  } finally {
    await update($, busy, () => null)
  }
}

// [Clarify] 목록에서 화살표 뒤가 빈 줄의 수.
const blankAnswers = (draft: string) => {
  const at = draft.lastIndexOf(HEADER)

  return at < 0 ? 0 : draft.slice(at).split('\n').filter(line => /^\s*→\s*$/.test(line)).length
}

// 기본 골격은 templates/ 에 있다. 한국어 화면이면 default.ko.md 를 먼저 찾는다.
const builtInTemplate = async ($: EngineInterface, settings: Settings) => {
  const root = `${$.plugin.root}/templates`
  const localized = `${root}/default.${textsOf(settings) === KO ? 'ko' : 'en'}.md`
  const body = (await $.fs.exists(localized)) ? await $.fs.read(localized) : await $.fs.read(`${root}/default.md`)

  return body.replace(/\r\n/g, '\n').trimEnd().split('\n')
}

const templateLines = async ($: EngineInterface, settings: Settings) => settings.template ?? (await builtInTemplate($, settings))

const insertTemplate = async ($: EngineInterface) => {
  const settings = await fresh($)
  const t = textsOf(settings)
  const body = (await templateLines($, settings)).join('\n')

  if (body.trim() === '') {
    $.ui.toast(t.templateEmpty)

    return
  }

  const box = await $.prompt.read()
  const filled =
    box.text.trim() === ''
      ? await $.prompt.fill({ text: body, mode: 'replace' })
      : await $.prompt.fill({ text: `\n\n${body}`, mode: 'append' })

  trace($, `template isFilled=${filled.isFilled} refusal=${filled.refusal ?? '-'}`)

  if (!filled.isFilled) {
    $.ui.toast(t.notFilled(filled.refusal ?? t.unknown))
  }
}

const restore = async ($: EngineInterface) => {
  const kept = await read($, original)

  if (kept === null) {
    return
  }

  const filled = await $.prompt.fill({ text: kept, mode: 'replace' })

  if (filled.isFilled) {
    await update($, original, () => null)
  }
}

// 탭을 떠나거나 패널을 다시 열면 골격 칸이 새로 그려져 친 글이 화면에서 사라진다. 보이지 않는 글이 저장되지 않게 함께 비운다.
const openSettings = async ($: EngineInterface) => {
  typedLines.clear()
  await update($, resetArmed, () => false)
  await $.ui.open({ id: SETTINGS, title: textsOf(await fresh($)).paneTitle, focus: true, closeOnEscape: true, rows: 30 })
}

const selectTab = async ($: EngineInterface, id: SettingsTab) => {
  typedLines.clear()
  await update($, tab, () => id)
  await update($, resetArmed, () => false)
}

// 언어를 바꾸면 슬래시 명령 설명과 패널 제목도 그 언어로 다시 건다.
const setLanguage = async ($: EngineInterface, value: Settings['language']) => {
  const t = textsOf(settingsOf(await savePrefs($, all => ({ ...all, language: value }))))

  await registerCommands($, t)
  await $.ui.open({ id: SETTINGS, title: t.paneTitle })
}

// 목표값은 누른 화면에 보인 값의 반대다. 저장소 값을 뒤집으면 다른 세션이 바꾼 값까지 뒤집혀 보인 것과 반대로 저장된다.
const setButton = async ($: EngineInterface, id: ButtonId, isShown: boolean) => {
  await savePrefs($, all => ({ ...all, buttons: { ...settingsOf(all).buttons, [id]: isShown } }))
}

const saveText = async ($: EngineInterface, field: 'askStyle' | 'refineStyle', value: string) => {
  const next = await savePrefs($, all => ({ ...all, [field]: value }))

  $.ui.toast(textsOf(settingsOf(next)).saved)
}

// 친 글을 지금 골격에 얹고 바꾼 결과를 저장한다. 줄 추가·삭제도 친 글을 먼저 얹어서 칸과 줄이 어긋나지 않는다.
const editTemplate = async ($: EngineInterface, change: (lines: string[]) => string[]) => {
  const builtIn = await builtInTemplate($, await current($))
  let isChanged = false

  await savePrefs($, all => {
    const before = settingsOf(all).template ?? builtIn
    const after = change(before.map((line, at) => typedLines.get(at) ?? line)).slice(0, TEMPLATE_MAX_LINES)

    // 바뀐 것이 없으면 그대로 둔다. 기본 골격이 '직접 만든 골격'으로 바뀌지 않게 한다.
    isChanged = JSON.stringify(after) !== JSON.stringify(before)

    return isChanged ? { ...all, template: after } : all
  })
  typedLines.clear()

  return isChanged
}

const saveTemplate = async ($: EngineInterface) => {
  const t = textsOf(await current($))

  $.ui.toast((await editTemplate($, lines => lines)) ? t.templateSaved : t.templateUnchanged)
}

const resetTemplate = async ($: EngineInterface) => {
  typedLines.clear()
  await savePrefs($, ({ template: _, ...rest }) => rest)
}

const copyPath = async ($: EngineInterface, surface: RenderSurface, path: string) => {
  const copied = await $.ui.copy({ text: path, surface })

  if (copied.isCopied) {
    $.ui.toast(textsOf(await current($)).pathCopied)
  }
}

// 초기화는 확인 버튼을 따로 눌러야 한다. 확인 버튼은 초기화 버튼과 다른 자리에 나와서 두 번 클릭으로는 지워지지 않는다.
const armReset = ($: EngineInterface) => update($, resetArmed, () => true)

const resetAll = async ($: EngineInterface) => {
  if (!(await read($, resetArmed))) {
    return
  }

  await prefsQueue(async () => {
    await $.store.delete('prefs')
    await update($, prefs, () => ({}))
  })
  await update($, note, () => '')
  typedLines.clear()
  await update($, resetArmed, () => false)

  const t = textsOf(settingsOf({}))

  await registerCommands($, t)
  await $.ui.open({ id: SETTINGS, title: t.paneTitle })
  $.ui.toast(t.resetDone)
}

const pluginVersion = async ($: EngineInterface) => {
  const manifest: unknown = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))

  return typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string'
    ? manifest.version
    : '?'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await readSystemLanguage($)
    await loadPrefs($)
    trace($, `start surfaces=${JSON.stringify(await $.session.surfaces())}`)
    await registerCommands($, textsOf(await current($)))

    return next(e)
  })

  on('command.run', { command: 'coach-ask' }, async ($, e) => {
    const settings = await fresh($)
    const t = textsOf(settings)
    const draft = e.args.trim()

    if (draft === '') {
      return { text: t.empty }
    }

    const r = await clarifyBlock($, draft, settings)

    if (!r.isDone) {
      return { text: r.text }
    }

    const full = `${draft}\n\n${r.text}`
    const copied = await $.ui.copy({ text: full })

    return { text: `${full}\n\n${copied.isCopied ? t.copied : ''}`.trimEnd() }
  })

  on('command.run', { command: 'coach-refine' }, async ($, e) => {
    const settings = await fresh($)
    const t = textsOf(settings)
    const draft = e.args.trim()

    if (draft === '') {
      return { text: t.empty }
    }

    const r = await refined($, draft, settings)

    if (!r.isDone) {
      return { text: r.text }
    }

    const copied = await $.ui.copy({ text: r.text })

    return { text: `${r.text}\n\n${copied.isCopied ? t.copied : ''}`.trimEnd() }
  })

  on('command.run', { command: 'coach-settings' }, async $ => {
    await openSettings($)

    return { text: textsOf(await current($)).settingsOpened }
  })

  // 보낸 뒤에는 되돌릴 원문이 의미가 없다.
  on('prompt.submit', async ($, e, next) => {
    const settings = await fresh($)
    const blanks = settings.warnBlank && e.origin.kind === 'composer' ? blankAnswers(e.text) : 0

    if (blanks > 0 && (await read($, warned)) !== e.text) {
      await update($, warned, () => e.text)
      // 막힌 초안이 입력창에서 사라지지 않게 다시 넣는다.
      void $.prompt.fill({ text: e.text, mode: 'replace' })

      return { drop: textsOf(settings).blank(blanks) }
    }

    await update($, original, () => null)
    await update($, warned, () => null)

    return next(e)
  })

  // 입력창 위 띠. 데스크톱은 claude.ai 의 보조 버튼을 그대로 쓰고, 터미널은 한 줄에 낮게 둔다.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // 설문이 띠를 쓰는 동안에는 비켜 준다.
    if (e.props.hasSurvey || e.surface === 'mobile') {
      return next(e)
    }

    const settings = await current($)
    const t = textsOf(settings)
    const working = await read($, busy)
    const kept = await read($, original)
    const direction = await read($, note)
    const isTerminal = e.surface === 'terminal'
    const keys = showsKeys(settings, e.surface)
    const { Box, Button, Text } = $.ui.resolve(e)
    // 터미널은 꾸밈 없는 흐린 글자 버튼, 데스크톱은 테두리와 바탕이 있는 앱 기본 버튼이다.
    const look = isTerminal ? { plain: true as const, dimColor: true } : {}

    trace($, `band surface=${e.surface}`)

    if (working !== null) {
      return (
        <Box gap={1} alignItems="center">
          <Text color={BRAND}>✻</Text>
          <Text color={HINT}>{working}</Text>
        </Box>
      )
    }

    const actions: { key: ButtonId; label: string; hotkey: string; run: () => void }[] = [
      { key: 'template', label: t.template, hotkey: 't', run: () => void insertTemplate($) },
      { key: 'ask', label: t.ask, hotkey: 'q', run: () => void askGaps($, e.surface) },
      { key: 'refine', label: t.refine, hotkey: 'r', run: () => void refine($, e.surface) },
      { key: 'undo', label: t.undo, hotkey: 'u', run: () => void restore($) },
    ]
    const shown = actions.filter(one => settings.buttons[one.key] && (one.key !== 'undo' || kept !== null))

    return (
      <Box gap={isTerminal ? 2 : 1} alignItems="center" flexWrap="wrap">
        <Text color={BRAND}>✻</Text>
        {shown.map(one => (
          <Button key={one.key} label={one.label} {...look} {...(keys ? { hotkey: one.hotkey } : {})} onPress={one.run} />
        ))}
        <Box flexGrow={1} />
        {direction.trim() === '' ? null : <Text color={HINT}>{t.directionOn}</Text>}
        <Button
          key="settings"
          label={t.settings}
          plain
          dimColor
          {...(keys ? { hotkey: 's' } : {})}
          onPress={() => void openSettings($)}
        />
      </Box>
    )
  })

  // 설정 패널. claude.ai 설정 화면처럼 탭으로 나누고, 항목마다 굵은 제목, 흐린 안내, 고르는 버튼을 둔다.
  // 글자 칸이 없는 모바일 앱에서도 고르는 항목은 바꿀 수 있다.
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const settings = await current($)
    const t = textsOf(settings)
    const active = await read($, tab)
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    // 모바일 앱에 건네는 표에도 Input 이름은 있지만 아무것도 그리지 않는다. 그래서 화면 이름으로 가른다.
    const Input = e.surface === 'mobile' ? undefined : $.ui.resolve(e).Input
    const isTerminal = e.surface === 'terminal'
    const keys = showsKeys(settings, e.surface)
    // 고른 것은 바탕과 테두리가 있는 버튼, 나머지는 흐린 글자 버튼으로 그린다. 탭 줄도 같은 모양이다.
    const picked = (isPicked: boolean) => (isPicked ? {} : { plain: true as const, dimColor: true })

    const choice = <V extends string | number>(
      name: string,
      value: V,
      options: readonly { value: V; label: string }[],
      pick: (next: V) => Promise<unknown>,
    ) => (
      <Box key={`${name}-choices`} gap={1} flexWrap="wrap" alignItems="center">
        {options.map(option => (
          <Button
            key={`${name}-${option.value}`}
            label={option.label}
            {...picked(option.value === value)}
            onPress={() => void pick(option.value)}
          />
        ))}
      </Box>
    )

    const onOff = (name: string, value: boolean, pick: (next: boolean) => Promise<unknown>) =>
      choice(
        name,
        value ? 'on' : 'off',
        [
          { value: 'on', label: t.on },
          { value: 'off', label: t.off },
        ],
        next => pick(next === 'on'),
      )

    // 글자 칸. 칠 때는 상태를 쓰지 않고, 저장(적용)이나 Enter 에서만 쓴다. 쓰면 칸이 새로 그려져 한글 조합이 끊긴다.
    // 다시 그려도 그린 값이 그대로면 앱이 친 글을 살려 둔다. 모바일 앱에는 칸이 없어서 지금 값을 글로 보여 준다.
    const field = (name: string, value: string, placeholder: string, submitLabel: string, save: (next: string) => Promise<unknown>) =>
      Input === undefined ? (
        <Box key={`${name}-value`}>
          <Text color={HINT}>
            {value.trim() === '' ? t.none : value} · {t.mobileText}
          </Text>
        </Box>
      ) : (
        <Input
          key={name}
          value={value}
          placeholder={placeholder}
          submitLabel={submitLabel}
          onSubmit={(next: string) => void save(next.trim())}
        />
      )

    const block = (name: string, title: string, hint: string | undefined, control: RenderElement | null) => (
      <Box key={name} flexDirection="column">
        <Text bold>{title}</Text>
        {hint === undefined ? null : <Text color={HINT}>{hint}</Text>}
        {control === null ? null : (
          <Box key={`${name}-control`} marginTop={isTerminal ? 0 : 1}>
            {control}
          </Box>
        )}
      </Box>
    )

    let body: RenderElement[]

    if (active === 'ask') {
      body = [
        block(
          'maxQuestions',
          t.maxQuestionsLabel,
          t.maxQuestionsHint,
          choice(
            'maxQuestions',
            settings.maxQuestions,
            QUESTION_COUNTS.map(value => ({ value, label: String(value) })),
            value => savePrefs($, all => ({ ...all, maxQuestions: value })),
          ),
        ),
        block(
          'askStyle',
          t.askStyleLabel,
          t.askStyleHint,
          field('askStyle', settings.askStyle, t.askStylePlaceholder, t.save, value => saveText($, 'askStyle', value)),
        ),
        block('askModel', t.askModelLabel, t.askModelHint(await $.session.model()), null),
      ]
    } else if (active === 'refine') {
      body = [
        block(
          'refineModel',
          t.refineModelLabel,
          t.refineModelHint,
          choice(
            'refineModel',
            settings.refineModel,
            MODELS.map(value => ({ value, label: value === 'session' ? t.sessionModel : value })),
            value => savePrefs($, all => ({ ...all, refineModel: value })),
          ),
        ),
        block(
          'refineEffort',
          t.effortLabel,
          settings.refineModel === 'haiku' ? t.effortHaiku : t.effortHint,
          choice(
            'refineEffort',
            settings.refineEffort,
            EFFORTS.map(value => ({ value, label: value })),
            value => savePrefs($, all => ({ ...all, refineEffort: value })),
          ),
        ),
        block(
          'refineStyle',
          t.refineStyleLabel,
          t.refineStyleHint,
          field('refineStyle', settings.refineStyle, t.refineStylePlaceholder, t.save, value => saveText($, 'refineStyle', value)),
        ),
        block(
          'minDraft',
          t.minDraftLabel,
          t.minDraftHint,
          choice(
            'minDraft',
            settings.minDraft,
            MIN_DRAFTS.map(value => ({ value, label: t.chars(value) })),
            value => savePrefs($, all => ({ ...all, minDraft: value })),
          ),
        ),
      ]
    } else if (active === 'template') {
      const lines = await templateLines($, settings)
      const state = settings.template === undefined ? t.templateBuiltIn : t.templateCustom

      body = [
        block('template', t.templateLabel, t.templateHint, <Text color={HINT}>{state}</Text>),
        <Box key="tpl-lines" flexDirection="column" gap={isTerminal ? 0 : 1}>
          {lines.map((line, index) =>
            Input === undefined ? (
              <Box key={`tpl-text-${index}`}>
                <Text>{line === '' ? ' ' : line}</Text>
              </Box>
            ) : (
              <Box key={`tpl-row-${index}`} gap={1} alignItems="center">
                <Input
                  key={`tpl-line-${index}`}
                  value={line}
                  placeholder={t.linePlaceholder}
                  onInput={(next: string) => void typedLines.set(index, next)}
                  onSubmit={(next: string) => {
                    typedLines.set(index, next)
                    void saveTemplate($)
                  }}
                />
                <Button
                  key={`tpl-remove-${index}`}
                  label={t.removeLine}
                  plain
                  dimColor
                  onPress={() => void editTemplate($, all => all.filter((_, at) => at !== index))}
                />
              </Box>
            ),
          )}
        </Box>,
        <Box key="tpl-actions" gap={1} flexWrap="wrap">
          {Input === undefined ? null : <Button key="tpl-save" label={t.save} variant="primary" onPress={() => void saveTemplate($)} />}
          {Input === undefined || lines.length >= TEMPLATE_MAX_LINES ? null : (
            <Button key="tpl-add" label={t.addLine} variant="secondary" onPress={() => void editTemplate($, all => [...all, ''])} />
          )}
          {settings.template === undefined ? null : (
            <Button key="tpl-reset" label={t.templateReset} plain dimColor onPress={() => void resetTemplate($)} />
          )}
        </Box>,
      ]
    } else if (active === 'about') {
      // Windows 경로는 역슬래시로 이어 붙인다. 복사한 경로가 한 가지 구분자만 쓰게 한다.
      const separator = $.plugin.root.includes('\\') ? '\\' : '/'
      const prompts = `${$.plugin.root}${separator}prompts`
      const isArmed = await read($, resetArmed)

      body = [
        block('version', t.versionLabel, `prompt-coach ${await pluginVersion($)}`, null),
        block('commands', t.commandsLabel, t.commandsHint, null),
        block(
          'prompts',
          t.promptsLabel,
          t.promptsHint,
          <Box key="prompts-path" gap={1} flexWrap="wrap" alignItems="center">
            <Text color={HINT}>{prompts}</Text>
            <Button key="copy-path" label={t.copyPath} variant="secondary" onPress={press => void copyPath($, press.surface, prompts)} />
          </Box>,
        ),
        block('repo', t.repoLabel, undefined, <Link href={REPO} label="github.com/yuk7392/prompt-coach" />),
        block(
          'reset',
          t.reset,
          isArmed ? t.resetAsk : undefined,
          <Box key="reset-row" gap={1} flexWrap="wrap" alignItems="center">
            <Button key="reset" label={t.reset} variant="secondary" onPress={() => void armReset($)} />
            {isArmed ? <Button key="reset-confirm" label={t.resetConfirm} variant="primary" onPress={() => void resetAll($)} /> : null}
            {isArmed ? (
              <Button key="reset-cancel" label={t.cancel} plain dimColor onPress={() => void update($, resetArmed, () => false)} />
            ) : null}
          </Box>,
        ),
      ]
    } else {
      body = [
        block(
          'language',
          t.language,
          t.languageHint,
          choice(
            'language',
            settings.language,
            LANGUAGES.map(value => ({ value, label: value === 'auto' ? t.auto : value === 'en' ? 'English' : '한국어' })),
            value => setLanguage($, value),
          ),
        ),
        block(
          'buttons',
          t.buttonsLabel,
          t.buttonsHint,
          <Box key="buttons-choices" gap={1} flexWrap="wrap" alignItems="center">
            {BUTTON_IDS.map(id => (
              <Button
                key={`button-${id}`}
                label={settings.buttons[id] ? `✓ ${t[id]}` : t[id]}
                {...picked(settings.buttons[id])}
                onPress={() => void setButton($, id, !settings.buttons[id])}
              />
            ))}
          </Box>,
        ),
        block(
          'hotkeys',
          t.hotkeysLabel,
          t.hotkeysHint,
          choice(
            'hotkeys',
            settings.hotkeys,
            HOTKEY_MODES.map(value => ({ value, label: value === 'auto' ? t.auto : value === 'on' ? t.always : t.off })),
            value => savePrefs($, all => ({ ...all, hotkeys: value })),
          ),
        ),
        block(
          'warnBlank',
          t.warnBlankLabel,
          t.warnBlankHint,
          onOff('warnBlank', settings.warnBlank, value => savePrefs($, all => ({ ...all, warnBlank: value }))),
        ),
        block(
          'showUsage',
          t.usageLabel,
          t.usageHint,
          onOff('showUsage', settings.showUsage, value => savePrefs($, all => ({ ...all, showUsage: value }))),
        ),
        block(
          'note',
          t.noteLabel,
          t.noteHint,
          field(
            'note',
            await read($, note),
            t.notePlaceholder,
            t.apply,
            value => update($, note, () => value),
          ),
        ),
      ]
    }

    return (
      <Box flexDirection="column" gap={isTerminal ? 1 : 2}>
        {/* 터미널은 패널이 하나면 제목을 그리지 않는다. 데스크톱은 창 머리에 제목이 있다. */}
        {isTerminal ? (
          <Box key="head" gap={1}>
            <Text color={BRAND} bold>
              ✻
            </Text>
            <Text bold>{t.paneTitle}</Text>
          </Box>
        ) : null}
        <Box key="tabs" gap={1} flexWrap="wrap" alignItems="center">
          {TABS.map((id, index) => (
            <Button
              key={`tab-${id}`}
              label={t.tabs[id]}
              {...picked(id === active)}
              {...(keys ? { hotkey: String(index + 1) } : {})}
              onPress={() => void selectTab($, id)}
            />
          ))}
        </Box>
        {body}
        {/* 데스크톱은 창 머리에 닫기 표시가 있다. 다른 화면에만 닫기 버튼을 둔다. */}
        {e.surface === 'desktop' ? null : (
          <Box key="footer">
            <Box flexGrow={1} />
            <Button key="close" label={t.close} plain dimColor onPress={() => void $.ui.close({ id: SETTINGS })} />
          </Box>
        )}
      </Box>
    )
  })
}
