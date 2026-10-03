import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, PluginOptions, Register } from 'claude-code'

import type { ButtonId, Prefs } from '../types'

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

const HEADER = '[Clarify]'
const SETTINGS = 'coach-settings'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const MODELS = ['haiku', 'sonnet', 'session'] as const
const LANGUAGES = ['auto', 'en', 'ko'] as const
const BUTTON_IDS: readonly ButtonId[] = ['template', 'ask', 'refine', 'undo']

// claude.ai 의 따뜻한 중립색과 클레이 강조색.
const CLAY = '#D97757'
const MUTED = '#87867F'
const LINE = '#DEDCD1'

// 모든 기능의 설정값. 매니페스트 userConfig 와 설정 패널 값이 이 위에 얹힌다.
type Settings = {
  language: (typeof LANGUAGES)[number]
  buttons: Record<ButtonId, boolean>
  askStyle: string
  maxQuestions: number
  refineStyle: string
  refineModel: (typeof MODELS)[number]
  refineEffort: (typeof EFFORTS)[number]
  minDraft: number
  warnBlank: boolean
  showUsage: boolean
  template: string[] | undefined
}

const DEFAULTS: Settings = {
  language: 'auto',
  buttons: { template: true, ask: true, refine: true, undo: true },
  askStyle: '',
  maxQuestions: 3,
  refineStyle: '',
  refineModel: 'haiku',
  refineEffort: 'low',
  minDraft: 12,
  warnBlank: true,
  showUsage: false,
  template: undefined,
}

// 화면 문구. 설정의 언어가 auto 면 settings.json 의 language 로 고른다.
const STRINGS = {
  en: {
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
    ask: 'Ask what is missing',
    refine: 'Refine',
    undo: 'Undo',
    template: 'Template',
    settings: 'Settings',
    blank: (n: number) => `${n} [Clarify] question(s) have no answer. Press Enter again to send anyway.`,
    askCommand: 'Ask what the given draft is missing (for apps that draw their own prompt box)',
    refineCommand: 'Refine the given draft (for apps that draw their own prompt box)',
    settingsCommand: 'Open prompt-coach settings',
    copied: '(Copied to the clipboard.)',
    settingsOpened: 'prompt-coach settings opened.',
    noSettingsHere: 'Settings need an app with text fields.',
    directionOn: 'direction on',
    saved: 'Saved',
    usage: (label: string, input: number, cached: number, output: number) =>
      `${label}: input ${input} + cache ${cached}, output ${output} tokens`,
    on: 'On',
    off: 'Off',
    close: 'Close',
    reset: 'Reset all to defaults',
    resetDone: 'Settings reset',
    title: 'prompt-coach',
    subtitle: 'Everything the buttons do is set here.',
    secGeneral: 'General',
    secSession: 'This session',
    secButtons: 'Buttons',
    secAsk: 'Ask what is missing',
    secRefine: 'Refine',
    secTemplate: 'Template',
    secSend: 'Sending',
    language: 'Language',
    languageAuto: 'Follow settings.json',
    usageLabel: 'Show tokens per press',
    noteLabel: 'How you want it',
    noteHint: 'Applies to Ask and Refine until you clear it. Not saved.',
    placeholder: 'e.g. formal tone, conditions as a list',
    save: 'Save',
    styleLabel: 'Style',
    askStylePlaceholder: 'e.g. ask about scope and test range first',
    maxQuestionsLabel: 'Questions at most',
    askModelHint: 'Uses the session model, so it can reuse the conversation cache.',
    refineStylePlaceholder: 'e.g. list conditions as bullets',
    modelLabel: 'Model',
    sessionModel: 'Session model',
    effortLabel: 'Effort',
    effortHint: 'haiku takes no effort setting.',
    minDraftLabel: 'Skip drafts shorter than',
    chars: (n: number) => (n === 0 ? 'never skip' : `${n} characters`),
    templateHint: 'Inserted by the Template button. Edit a line and press Enter.',
    addLine: 'Add line',
    removeLine: 'Remove',
    templateReset: 'Use the built-in template',
    warnBlankLabel: 'Stop once if a [Clarify] answer is empty',
    commandsHint: '/coach-ask, /coach-refine and /coach-settings work in every app.',
  },
  ko: {
    changed: '그 사이 입력이 바뀌어서 반영하지 않았어요',
    notFilled: (why: string) => `입력창에 넣지 못했어요 (${why})`,
    unknown: '이유 모름',
    empty: '입력 중인 내용이 없어요',
    asking: '빠진 것 찾는 중…',
    noHistory: '대화가 아직 없어서 물을 근거가 없어요',
    noQuestions: (why: string) => `질문을 못 받았어요 (${why})`,
    nothingToAsk: '더 물을 것이 없어요',
    refining: '다듬는 중…',
    noRefine: (why: string) => `다듬지 못했어요 (${why})`,
    tooShort: '다듬기엔 초안이 너무 짧아요',
    notADraft: '다듬은 초안이 아닌 답이 왔어요',
    ask: '빠진 것 묻기',
    refine: '다듬기',
    undo: '되돌리기',
    template: '골격',
    settings: '설정',
    blank: (n: number) => `[Clarify] 질문 ${n}개에 답이 비어 있어요. 그대로 보내려면 다시 Enter를 누르세요.`,
    askCommand: '적은 초안에 빠진 것을 묻는다 (입력창을 직접 그리는 앱용)',
    refineCommand: '적은 초안을 다듬는다 (입력창을 직접 그리는 앱용)',
    settingsCommand: 'prompt-coach 설정을 연다',
    copied: '(클립보드에 복사했어요.)',
    settingsOpened: 'prompt-coach 설정을 열었어요.',
    noSettingsHere: '설정은 입력칸이 있는 앱에서만 바꿀 수 있어요.',
    directionOn: '원하는 방식 적용 중',
    saved: '저장했어요',
    usage: (label: string, input: number, cached: number, output: number) =>
      `${label}: 입력 ${input} + 캐시 ${cached}, 출력 ${output} 토큰`,
    on: '켜기',
    off: '끄기',
    close: '닫기',
    reset: '모두 기본값으로',
    resetDone: '설정을 기본값으로 돌렸어요',
    title: 'prompt-coach',
    subtitle: '버튼이 하는 일은 모두 여기서 정해요.',
    secGeneral: '일반',
    secSession: '이번 세션',
    secButtons: '버튼',
    secAsk: '빠진 것 묻기',
    secRefine: '다듬기',
    secTemplate: '골격',
    secSend: '보내기',
    language: '언어',
    languageAuto: 'settings.json 따르기',
    usageLabel: '누를 때마다 토큰 표시',
    noteLabel: '원하는 방식',
    noteHint: '지울 때까지 묻기와 다듬기에 붙어요. 저장되지 않아요.',
    placeholder: '예: 존댓말로, 조건은 목록으로',
    save: '저장',
    styleLabel: '스타일',
    askStylePlaceholder: '예: 범위와 테스트 범위를 먼저 물어봐',
    maxQuestionsLabel: '질문 최대 개수',
    askModelHint: '세션 모델로 돌아서 대화 캐시를 다시 써요.',
    refineStylePlaceholder: '예: 조건은 목록으로',
    modelLabel: '모델',
    sessionModel: '세션 모델',
    effortLabel: 'Effort',
    effortHint: 'haiku는 effort를 쓰지 않아요.',
    minDraftLabel: '이보다 짧으면 건너뛰기',
    chars: (n: number) => (n === 0 ? '건너뛰지 않음' : `${n}자`),
    templateHint: '골격 버튼이 넣는 틀이에요. 줄을 고치고 Enter를 누르세요.',
    addLine: '줄 추가',
    removeLine: '삭제',
    templateReset: '기본 골격 쓰기',
    warnBlankLabel: '[Clarify] 답이 비었으면 한 번 멈추기',
    commandsHint: '/coach-ask, /coach-refine, /coach-settings는 어느 앱에서나 돼요.',
  },
}

type Strings = (typeof STRINGS)['en']

let t: Strings = STRINGS.en
let lang: 'en' | 'ko' = 'en'
let systemLang: 'en' | 'ko' = 'en'

const pickLanguage = async ($: EngineInterface) => {
  const { language } = await $.settings.read()

  systemLang = typeof language === 'string' && /^(ko|korean)|한국/i.test(language.trim()) ? 'ko' : 'en'
}

const applyLanguage = (choice: Settings['language']) => {
  lang = choice === 'auto' ? systemLang : choice
  t = STRINGS[lang]
}

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.find(one => one === value) ?? fallback

const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)

// 기본값 위에 매니페스트 값, 그 위에 설정 패널 값을 얹는다. 화면 언어도 여기서 정한다.
const effective = async ($: EngineInterface, manifest: PluginOptions): Promise<Settings> => {
  const p: Prefs = await read($, prefs)
  const settings: Settings = {
    language: pick(LANGUAGES, p.language, DEFAULTS.language),
    buttons: { ...DEFAULTS.buttons, ...p.buttons },
    askStyle: text(p.askStyle, text(manifest.askStyle, DEFAULTS.askStyle)),
    maxQuestions: typeof p.maxQuestions === 'number' ? p.maxQuestions : DEFAULTS.maxQuestions,
    refineStyle: text(p.refineStyle, text(manifest.refineStyle, DEFAULTS.refineStyle)),
    refineModel: pick(MODELS, p.refineModel ?? manifest.refineModel, DEFAULTS.refineModel),
    refineEffort: pick(EFFORTS, p.refineEffort ?? manifest.refineEffort, DEFAULTS.refineEffort),
    minDraft: typeof p.minDraft === 'number' ? p.minDraft : DEFAULTS.minDraft,
    warnBlank: typeof p.warnBlank === 'boolean' ? p.warnBlank : DEFAULTS.warnBlank,
    showUsage: typeof p.showUsage === 'boolean' ? p.showUsage : manifest.showUsage === true,
    template: Array.isArray(p.template) ? p.template : undefined,
  }

  applyLanguage(settings.language)

  return settings
}

const loadPrefs = async ($: EngineInterface) => {
  const stored = await $.store.get('prefs')

  if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
    await update($, prefs, () => stored as Prefs)
  }
}

const savePrefs = async ($: EngineInterface, change: (all: Prefs) => Prefs, message?: string) => {
  const next = await update($, prefs, change)

  await $.store.set('prefs', next)
  $.ui.toast(message ?? t.saved)
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

  return body
    .replace('{{style}}', () => style)
    .replace('{{draft}}', () => draft)
    .replace('{{max}}', () => String(settings.maxQuestions))
}

const modelFor = async ($: EngineInterface, settings: Settings) =>
  settings.refineModel === 'session' ? await $.session.model() : settings.refineModel

// 설정에서 켜면 호출마다 쓴 토큰을 토스트로 보여 준다. 결과에 실려 오는 값이라 추가 비용이 없다.
const reportUsage = ($: EngineInterface, settings: Settings, label: string, usage: ModelUsage | undefined) => {
  if (!settings.showUsage || usage === undefined) {
    return
  }

  $.ui.toast(t.usage(label, usage.input_tokens + usage.cache_creation_input_tokens, usage.cache_read_input_tokens, usage.output_tokens), {
    timeoutMs: 8000,
  })
}

// 모델이 일하는 동안 사용자가 입력창을 고쳤으면 덮어쓰지 않는다.
const fillIfUnchanged = async ($: EngineInterface, draft: string, value: string, mode: 'replace' | 'append') => {
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

const readDraft = async ($: EngineInterface, surface: string) => {
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

const clarifyBlock = async ($: EngineInterface, draft: string, settings: Settings): Promise<Outcome> => {
  const r = await $.model.fork({ prompt: await promptFile($, 'ask', settings, draft) })

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
  if (draft.replace(/\s/g, '').length < settings.minDraft) {
    return { isDone: false, text: t.tooShort }
  }

  const model = await modelFor($, settings)
  const r = await $.model.complete({
    model,
    system: await promptFile($, 'refine', settings),
    prompt: `<draft>\n${draft}\n</draft>`,
    effort: settings.refineEffort,
    maxTokens: 16000,
  })

  trace($, `complete model=${model} answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)
  reportUsage($, settings, t.refine, r.usage)

  if (!r.isAnswered) {
    return { isDone: false, text: t.noRefine(r.reason) }
  }

  // 태그 안의 결과만 받는다. 태그가 없으면 초안 대신 대화로 답한 것이라 입력창에 넣지 않는다.
  const body = /<refined>([\s\S]*?)<\/refined>/.exec(r.text)?.[1]?.trim() ?? ''

  return body === '' ? { isDone: false, text: t.noRefine(t.notADraft) } : { isDone: true, text: body }
}

const askGaps = async ($: EngineInterface, surface: string, settings: Settings) => {
  const draft = await readDraft($, surface)

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
    await fillIfUnchanged($, draft, `\n\n${r.text}`, 'append')
  } finally {
    await update($, busy, () => null)
  }
}

const refine = async ($: EngineInterface, surface: string, settings: Settings) => {
  const draft = await readDraft($, surface)

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

    await fillIfUnchanged($, draft, r.text, 'replace')
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
const builtInTemplate = async ($: EngineInterface) => {
  const root = `${$.plugin.root}/templates`
  const localized = `${root}/default.${lang}.md`
  const body = (await $.fs.exists(localized)) ? await $.fs.read(localized) : await $.fs.read(`${root}/default.md`)

  return body.replace(/\r\n/g, '\n').trimEnd().split('\n')
}

const templateLines = async ($: EngineInterface, settings: Settings) => settings.template ?? (await builtInTemplate($))

const insertTemplate = async ($: EngineInterface, settings: Settings) => {
  const body = (await templateLines($, settings)).join('\n')
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

const openSettings = async ($: EngineInterface) => {
  await $.ui.open({ id: SETTINGS, title: t.settings, focus: true, closeOnEscape: true, rows: 40 })
}

// 골격 줄을 바꿀 때는 지금 보이는 줄 목록(기본 골격일 수도 있다)을 기준으로 바꿔 저장한다.
const editTemplate = async ($: EngineInterface, settings: Settings, change: (lines: string[]) => string[]) => {
  const lines = await templateLines($, settings)

  await savePrefs($, all => ({ ...all, template: change([...lines]) }))
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

export const register: Register = (on, manifest) => {
  on('session.start', async ($, e, next) => {
    await pickLanguage($)
    await loadPrefs($)
    await effective($, manifest)
    trace($, `start surfaces=${JSON.stringify(await $.session.surfaces())}`)
    // 입력창을 직접 그리는 화면에서도 쓸 수 있는 길. 초안을 인자로 받는다.
    await $.command.register({ name: 'coach-ask', description: t.askCommand, argumentHint: '<draft>' })
    await $.command.register({ name: 'coach-refine', description: t.refineCommand, argumentHint: '<draft>' })
    await $.command.register({ name: 'coach-settings', description: t.settingsCommand })

    return next(e)
  })

  on('command.run', { command: 'coach-ask' }, async ($, e) => {
    const settings = await effective($, manifest)
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
    const settings = await effective($, manifest)
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
    await effective($, manifest)
    await openSettings($)

    return { text: t.settingsOpened }
  })

  // 보낸 뒤에는 되돌릴 원문이 의미가 없다.
  on('prompt.submit', async ($, e, next) => {
    const settings = await effective($, manifest)
    const blanks = settings.warnBlank && e.origin.kind === 'composer' ? blankAnswers(e.text) : 0

    if (blanks > 0 && (await read($, warned)) !== e.text) {
      await update($, warned, () => e.text)
      // 막힌 초안이 입력창에서 사라지지 않게 다시 넣는다.
      void $.prompt.fill({ text: e.text, mode: 'replace' })

      return { drop: t.blank(blanks) }
    }

    await update($, original, () => null)
    await update($, warned, () => null)

    return next(e)
  })

  // 입력창 위 띠: claude.ai 처럼 둥근 테두리 안에 클레이색 표식과 버튼을 한 줄로 둔다.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // 모바일 화면에는 입력칸이 없다.
    if (e.props.hasSurvey || e.surface === 'mobile') {
      return next(e)
    }

    const settings = await effective($, manifest)
    const working = await read($, busy)
    const kept = await read($, original)
    const direction = await read($, note)
    const { Box, Button, Text } = $.ui.resolve(e)

    trace($, `band surface=${e.surface}`)

    if (working !== null) {
      return (
        <Box borderStyle="round" borderColor={LINE} paddingX={1}>
          <Text color={CLAY}>✻ </Text>
          <Text color={MUTED}>{working}</Text>
        </Box>
      )
    }

    const actions: { key: ButtonId; label: string; hotkey: string; isPrimary: boolean; run: () => void }[] = [
      { key: 'template', label: t.template, hotkey: 't', isPrimary: false, run: () => void insertTemplate($, settings) },
      { key: 'ask', label: t.ask, hotkey: 'q', isPrimary: false, run: () => void askGaps($, e.surface, settings) },
      { key: 'refine', label: t.refine, hotkey: 'r', isPrimary: true, run: () => void refine($, e.surface, settings) },
      { key: 'undo', label: t.undo, hotkey: 'u', isPrimary: false, run: () => void restore($) },
    ]
    const shown = actions.filter(one => settings.buttons[one.key] && (one.key !== 'undo' || kept !== null))

    return (
      <Box borderStyle="round" borderColor={LINE} paddingX={1} gap={1} alignItems="center">
        <Text color={CLAY}>✻</Text>
        {shown.map(one => (
          <Button
            key={one.key}
            label={one.label}
            hotkey={one.hotkey}
            variant={one.isPrimary ? 'primary' : 'secondary'}
            onPress={one.run}
          />
        ))}
        <Box flexGrow={1} />
        {direction.trim() !== '' && <Text color={MUTED}>{t.directionOn}</Text>}
        <Button key="settings" label={t.settings} hotkey="s" variant="secondary" onPress={() => void openSettings($)} />
      </Box>
    )
  })

  // 설정 패널: 모든 기능을 여기서 관리한다. claude.ai 설정 화면처럼 제목, 섹션 카드, 흐린 안내문.
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text color={MUTED}>{t.noSettingsHere}</Text>
    }

    const settings = await effective($, manifest)
    const direction = await read($, note)
    const lines = await templateLines($, settings)
    const { Box, Button, Input, Select, Text } = $.ui.resolve(e)
    const onOff = [
      { value: 'on', label: t.on },
      { value: 'off', label: t.off },
    ]
    const setPref = (change: (all: Prefs) => Prefs) => void savePrefs($, change)

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={CLAY} bold>
            ✻{' '}
          </Text>
          <Text bold>{t.title}</Text>
        </Box>
        <Text color={MUTED}>{t.subtitle}</Text>

        <Box key="general" flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} marginTop={1}>
          <Text bold>{t.secGeneral}</Text>
          <Select
            key="language"
            label={`${t.language}  `}
            value={settings.language}
            options={[
              { value: 'auto', label: t.languageAuto },
              { value: 'en', label: 'English' },
              { value: 'ko', label: '한국어' },
            ]}
            onSelect={(value: string) => setPref(all => ({ ...all, language: pick(LANGUAGES, value, 'auto') }))}
          />
          <Select
            key="showUsage"
            label={`${t.usageLabel}  `}
            value={settings.showUsage ? 'on' : 'off'}
            options={onOff}
            onSelect={(value: string) => setPref(all => ({ ...all, showUsage: value === 'on' }))}
          />
          <Text color={MUTED}>{t.commandsHint}</Text>
        </Box>

        <Box key="session" flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} marginTop={1}>
          <Text bold>{t.secSession}</Text>
          <Input
            key="note"
            label={`${t.noteLabel}  `}
            placeholder={t.placeholder}
            value={direction}
            submitLabel={t.save}
            autoFocus
            onInput={(value: string) => void update($, note, () => value)}
            onSubmit={(value: string) => void update($, note, () => value.trim())}
          />
          <Text color={MUTED}>{t.noteHint}</Text>
        </Box>

        <Box key="buttons" flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} marginTop={1}>
          <Text bold>{t.secButtons}</Text>
          {BUTTON_IDS.map(id => (
            <Select
              key={`button-${id}`}
              label={`${t[id]}  `}
              value={settings.buttons[id] ? 'on' : 'off'}
              options={onOff}
              onSelect={(value: string) => setPref(all => ({ ...all, buttons: { ...all.buttons, [id]: value === 'on' } }))}
            />
          ))}
        </Box>

        <Box key="ask" flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} marginTop={1}>
          <Text bold>{t.secAsk}</Text>
          <Input
            key="askStyle"
            label={`${t.styleLabel}  `}
            placeholder={t.askStylePlaceholder}
            value={settings.askStyle}
            submitLabel={t.save}
            onSubmit={(value: string) => setPref(all => ({ ...all, askStyle: value.trim() }))}
          />
          <Select
            key="maxQuestions"
            label={`${t.maxQuestionsLabel}  `}
            value={String(settings.maxQuestions)}
            options={['1', '2', '3', '4', '5'].map(value => ({ value, label: value }))}
            onSelect={(value: string) => setPref(all => ({ ...all, maxQuestions: Number(value) }))}
          />
          <Text color={MUTED}>{t.askModelHint}</Text>
        </Box>

        <Box key="refine" flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} marginTop={1}>
          <Text bold>{t.secRefine}</Text>
          <Input
            key="refineStyle"
            label={`${t.styleLabel}  `}
            placeholder={t.refineStylePlaceholder}
            value={settings.refineStyle}
            submitLabel={t.save}
            onSubmit={(value: string) => setPref(all => ({ ...all, refineStyle: value.trim() }))}
          />
          <Select
            key="refineModel"
            label={`${t.modelLabel}  `}
            value={settings.refineModel}
            options={[
              { value: 'haiku', label: 'haiku' },
              { value: 'sonnet', label: 'sonnet' },
              { value: 'session', label: t.sessionModel },
            ]}
            onSelect={(value: string) => setPref(all => ({ ...all, refineModel: value }))}
          />
          <Select
            key="refineEffort"
            label={`${t.effortLabel}  `}
            value={settings.refineEffort}
            options={EFFORTS.map(value => ({ value, label: value }))}
            onSelect={(value: string) => setPref(all => ({ ...all, refineEffort: value }))}
          />
          {settings.refineModel === 'haiku' && <Text color={MUTED}>{t.effortHint}</Text>}
          <Select
            key="minDraft"
            label={`${t.minDraftLabel}  `}
            value={String(settings.minDraft)}
            options={['0', '12', '30', '60'].map(value => ({ value, label: t.chars(Number(value)) }))}
            onSelect={(value: string) => setPref(all => ({ ...all, minDraft: Number(value) }))}
          />
        </Box>

        <Box key="template" flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} marginTop={1}>
          <Text bold>{t.secTemplate}</Text>
          <Text color={MUTED}>{t.templateHint}</Text>
          {lines.map((line, index) => (
            <Box key={`tpl-${index}`} gap={1}>
              <Input
                key={`tpl-line-${index}`}
                value={line}
                submitLabel={t.save}
                onSubmit={(value: string) =>
                  void editTemplate($, settings, all => all.map((one, at) => (at === index ? value : one)))
                }
              />
              <Button
                key={`tpl-remove-${index}`}
                label={t.removeLine}
                variant="secondary"
                onPress={() => void editTemplate($, settings, all => all.filter((_, at) => at !== index))}
              />
            </Box>
          ))}
          <Box key="tpl-actions" gap={1}>
            <Button
              key="tpl-add"
              label={t.addLine}
              variant="secondary"
              onPress={() => void editTemplate($, settings, all => [...all, ''])}
            />
            <Button
              key="tpl-reset"
              label={t.templateReset}
              variant="secondary"
              onPress={() => setPref(({ template: _, ...rest }) => rest)}
            />
          </Box>
        </Box>

        <Box key="send" flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} marginTop={1}>
          <Text bold>{t.secSend}</Text>
          <Select
            key="warnBlank"
            label={`${t.warnBlankLabel}  `}
            value={settings.warnBlank ? 'on' : 'off'}
            options={onOff}
            onSelect={(value: string) => setPref(all => ({ ...all, warnBlank: value === 'on' }))}
          />
        </Box>

        <Box key="footer" gap={1} marginTop={1}>
          <Button key="reset" label={t.reset} variant="secondary" onPress={() => void savePrefs($, () => ({}), t.resetDone)} />
          <Box flexGrow={1} />
          <Button key="close" label={t.close} variant="primary" role="dismiss" onPress={() => void $.ui.close({ id: SETTINGS })} />
        </Box>
      </Box>
    )
  })
}
