import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, PluginOptions, Register } from 'claude-code'

import type { Prefs } from '../types'

// 개발 중 확인용: 어느 화면에서 입력창을 읽고 채울 수 있는지 trace.log에 남긴다.
const TRACE = false
const TRACE_MAX = 200

const busy = atom({ plugin: 'prompt-coach', key: 'busy' } as const, null)
const original = atom({ plugin: 'prompt-coach', key: 'original' } as const, null)
// 띠의 입력칸에 적은 이번 세션용 요청. 지울 때까지 두 버튼 모두에 붙는다.
const note = atom({ plugin: 'prompt-coach', key: 'note' } as const, '')
// 빈 답 경고를 한 번 보여 준 초안. 같은 초안을 다시 보내면 그대로 보낸다.
const warned = atom({ plugin: 'prompt-coach', key: 'warned' } as const, null)
// 설정 패널에서 바꾼 값. $.store 에 저장해 세션을 넘어 유지하고, 매니페스트 기본값 위에 얹는다.
const prefs = atom({ plugin: 'prompt-coach', key: 'prefs' } as const, {})

const HEADER = '[Clarify]'

// 화면 문구. settings.json 의 language 가 한국어면 ko, 그 밖에는 en.
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
    emptyReply: 'empty reply',
    placeholder: 'How you want it (e.g. formal tone, conditions as a list)',
    save: 'save',
    ask: 'Ask what is missing',
    refine: 'Refine',
    undo: 'Undo',
    template: 'Template',
    blank: (n: number) => `${n} [Clarify] question(s) have no answer. Press Enter again to send anyway.`,
    askCommand: 'Ask what the given draft is missing (for apps that draw their own prompt box)',
    refineCommand: 'Refine the given draft (for apps that draw their own prompt box)',
    copied: '(Copied to the clipboard.)',
    settings: 'Settings',
    settingsOpened: 'prompt-coach settings opened.',
    noSettingsHere: 'Settings need an app with text fields.',
    directionOn: 'direction on',
    noteLabel: 'How you want it',
    askStyleLabel: 'Ask style',
    askStylePlaceholder: 'e.g. ask about scope and test range first',
    refineStyleLabel: 'Refine style',
    refineStylePlaceholder: 'e.g. list conditions as bullets',
    modelLabel: 'Refine model',
    sessionModel: 'session model',
    close: 'Close',
    saved: 'Saved',
    notSaved: (why: string) => `Not saved (${why})`,
    effortLabel: 'Refine effort',
    effortHint: 'haiku takes no effort setting, so this applies to sonnet and the session model',
    sessionSection: 'This session',
    savedSection: 'Saved',
    tooShort: 'The draft is too short to refine',
    notADraft: 'the reply was not a refined draft',
    usageLabel: 'Tokens per press',
    on: 'on',
    off: 'off',
    usage: (label: string, input: number, cached: number, output: number) =>
      `${label}: input ${input} + cache ${cached}, output ${output} tokens`,
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
    emptyReply: '빈 답',
    placeholder: '원하는 방식 (예: 존댓말로, 조건은 목록으로)',
    save: '저장',
    ask: '빠진 것 묻기',
    refine: '다듬기',
    undo: '되돌리기',
    template: '골격',
    blank: (n: number) => `[Clarify] 질문 ${n}개에 답이 비어 있어요. 그대로 보내려면 다시 Enter를 누르세요.`,
    askCommand: '적은 초안에 빠진 것을 묻는다 (입력창을 직접 그리는 앱용)',
    refineCommand: '적은 초안을 다듬는다 (입력창을 직접 그리는 앱용)',
    copied: '(클립보드에 복사했어요.)',
    settings: '설정',
    settingsOpened: 'prompt-coach 설정을 열었어요.',
    noSettingsHere: '설정은 입력칸이 있는 앱에서만 바꿀 수 있어요.',
    directionOn: '원하는 방식 적용 중',
    noteLabel: '원하는 방식',
    askStyleLabel: '묻기 스타일',
    askStylePlaceholder: '예: 범위와 테스트 범위를 먼저 물어봐',
    refineStyleLabel: '다듬기 스타일',
    refineStylePlaceholder: '예: 조건은 목록으로',
    modelLabel: '다듬기 모델',
    sessionModel: '세션 모델',
    close: '닫기',
    saved: '저장했어요',
    notSaved: (why: string) => `저장하지 못했어요 (${why})`,
    effortLabel: '다듬기 effort',
    effortHint: 'haiku는 effort를 쓰지 않아서 sonnet과 세션 모델에만 적용돼요',
    sessionSection: '이번 세션',
    savedSection: '저장',
    tooShort: '다듬기엔 초안이 너무 짧아요',
    notADraft: '다듬은 초안이 아닌 답이 왔어요',
    usageLabel: '토큰 표시',
    on: '켜기',
    off: '끄기',
    usage: (label: string, input: number, cached: number, output: number) =>
      `${label}: 입력 ${input} + 캐시 ${cached}, 출력 ${output} 토큰`,
  },
}

let t = STRINGS.en
let lang: 'en' | 'ko' = 'en'

const pickLanguage = async ($: EngineInterface) => {
  const { language } = await $.settings.read()

  lang = typeof language === 'string' && /^(ko|korean)|한국/i.test(language.trim()) ? 'ko' : 'en'
  t = STRINGS[lang]
}

// 기본 지시문은 prompts/*.md 에 있다. 사용자가 고칠 수 있게 버튼을 누를 때마다 새로 읽는다.
// {{style}} 자리에는 설정에 저장한 스타일과 띠에 적은 요청이 들어간다.
const promptFile = async ($: EngineInterface, name: 'ask' | 'refine', options: PluginOptions, draft = '') => {
  const saved = name === 'ask' ? options.askStyle : options.refineStyle
  const lines = [typeof saved === 'string' ? saved.trim() : '', (await read($, note)).trim()].filter(one => one !== '')
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
  const text = await $.fs.read(`${$.plugin.root}/prompts/${name}.md`)

  return text.replace('{{style}}', () => style).replace('{{draft}}', () => draft)
}

const traced: string[] = []

const trace = ($: EngineInterface, line: string) => {
  if (!TRACE || traced.length >= TRACE_MAX) {
    return
  }

  traced.push(`${new Date().toISOString()} ${line}`)
  void $.fs.write(`${$.plugin.root}/trace.log`, traced.join('\n') + '\n').catch(() => {})
}

const modelFor = async ($: EngineInterface, options: PluginOptions) => {
  const chosen = options.refineModel

  return chosen === 'haiku' || chosen === 'sonnet' ? chosen : await $.session.model()
}

// 모델이 일하는 동안 사용자가 입력창을 고쳤으면 덮어쓰지 않는다.
const fillIfUnchanged = async ($: EngineInterface, draft: string, text: string, mode: 'replace' | 'append') => {
  const now = await $.prompt.read()

  if (now.text !== draft) {
    $.ui.toast(t.changed)

    return false
  }

  const filled = await $.prompt.fill({ text, mode })

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
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

const effortFor = (options: PluginOptions) => {
  const chosen = options.refineEffort

  return EFFORTS.find(one => one === chosen) ?? 'low'
}

// 설정에서 켜면 호출마다 쓴 토큰을 토스트로 보여 준다. 결과에 실려 오는 값이라 추가 비용이 없다.
const reportUsage = ($: EngineInterface, options: PluginOptions, label: string, usage: ModelUsage | undefined) => {
  if (options.showUsage !== true || usage === undefined) {
    return
  }

  $.ui.toast(t.usage(label, usage.input_tokens + usage.cache_creation_input_tokens, usage.cache_read_input_tokens, usage.output_tokens), {
    timeoutMs: 8000,
  })
}

type Outcome = { text: string; isDone: true } | { text: string; isDone: false }

const clarifyBlock = async ($: EngineInterface, draft: string, options: PluginOptions): Promise<Outcome> => {
  const r = await $.model.fork({ prompt: await promptFile($, 'ask', options, draft) })

  trace($, `fork answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)
  reportUsage($, options, t.ask, 'usage' in r ? r.usage : undefined)

  if (!r.isAnswered) {
    return { isDone: false, text: r.reason === 'nothing-to-fork' ? t.noHistory : t.noQuestions(r.reason) }
  }

  const questions = r.text
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(line => line !== '' && line.toUpperCase() !== 'NONE')
    .slice(0, 3)

  return questions.length === 0
    ? { isDone: false, text: t.nothingToAsk }
    : { isDone: true, text: `${HEADER}\n${questions.map(q => `- ${q}\n  → `).join('\n')}` }
}

// 이보다 짧은 초안은 다듬을 거리가 없어서 호출하지 않는다.
const MIN_DRAFT = 12

const refined = async ($: EngineInterface, draft: string, options: PluginOptions): Promise<Outcome> => {
  if (draft.replace(/\s/g, '').length < MIN_DRAFT) {
    return { isDone: false, text: t.tooShort }
  }

  const model = await modelFor($, options)
  const r = await $.model.complete({
    model,
    system: await promptFile($, 'refine', options),
    prompt: `<draft>\n${draft}\n</draft>`,
    effort: effortFor(options),
    maxTokens: 16000,
  })

  trace($, `complete model=${model} answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)
  reportUsage($, options, t.refine, r.usage)

  if (!r.isAnswered) {
    return { isDone: false, text: t.noRefine(r.reason) }
  }

  // 태그 안의 결과만 받는다. 태그가 없으면 초안 대신 대화로 답한 것이라 입력창에 넣지 않는다.
  const body = /<refined>([\s\S]*?)<\/refined>/.exec(r.text)?.[1]?.trim() ?? ''

  return body === '' ? { isDone: false, text: t.noRefine(t.notADraft) } : { isDone: true, text: body }
}

const askGaps = async ($: EngineInterface, surface: string, options: PluginOptions) => {
  const draft = await readDraft($, surface)

  if (draft === undefined) {
    return
  }

  await update($, busy, () => t.asking)

  try {
    const r = await clarifyBlock($, draft, options)

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

const refine = async ($: EngineInterface, surface: string, options: PluginOptions) => {
  const draft = await readDraft($, surface)

  if (draft === undefined) {
    return
  }

  await update($, busy, () => t.refining)

  try {
    const r = await refined($, draft, options)

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
const blankAnswers = (text: string) => {
  const at = text.lastIndexOf(HEADER)

  return at < 0 ? 0 : text.slice(at).split('\n').filter(line => /^\s*→\s*$/.test(line)).length
}

// 골격은 templates/ 에 있다. 한국어 화면이면 default.ko.md 를 먼저 찾는다.
const insertTemplate = async ($: EngineInterface) => {
  const root = `${$.plugin.root}/templates`
  const localized = `${root}/default.${lang}.md`
  const text = (await $.fs.exists(localized)) ? await $.fs.read(localized) : await $.fs.read(`${root}/default.md`)
  const box = await $.prompt.read()
  const filled =
    box.text.trim() === ''
      ? await $.prompt.fill({ text: text.trimEnd(), mode: 'replace' })
      : await $.prompt.fill({ text: `\n\n${text.trimEnd()}`, mode: 'append' })

  trace($, `template isFilled=${filled.isFilled} refusal=${filled.refusal ?? '-'}`)
}

const SETTINGS = 'coach-settings'

const effective = async ($: EngineInterface, manifest: PluginOptions): Promise<PluginOptions> => ({
  ...manifest,
  ...(await read($, prefs)),
})

const loadPrefs = async ($: EngineInterface) => {
  const stored = await $.store.get('prefs')

  if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
    await update($, prefs, () => stored as Prefs)
  }
}

const openSettings = async ($: EngineInterface) => {
  await $.ui.open({ id: SETTINGS, title: t.settings, focus: true, closeOnEscape: true })
}

const saveSetting = async ($: EngineInterface, field: keyof Prefs, value: string | boolean) => {
  const next = await update($, prefs, all => ({ ...all, [field]: value }))

  await $.store.set('prefs', next)
  $.ui.toast(t.saved)
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
    trace($, `start surfaces=${JSON.stringify(await $.session.surfaces())}`)
    // 입력창을 직접 그리는 화면(데스크톱 등)에서도 쓸 수 있는 길. 초안을 인자로 받는다.
    await $.command.register({ name: 'coach-ask', description: t.askCommand, argumentHint: '<draft>' })
    await $.command.register({ name: 'coach-refine', description: t.refineCommand, argumentHint: '<draft>' })
    await $.command.register({ name: 'coach-settings', description: t.settings })

    return next(e)
  })

  on('command.run', { command: 'coach-ask' }, async ($, e) => {
    const options = await effective($, manifest)
    const draft = e.args.trim()

    if (draft === '') {
      return { text: t.empty }
    }

    const r = await clarifyBlock($, draft, options)

    if (!r.isDone) {
      return { text: r.text }
    }

    const full = `${draft}\n\n${r.text}`
    const copied = await $.ui.copy({ text: full })

    return { text: `${full}\n\n${copied.isCopied ? t.copied : ''}`.trimEnd() }
  })

  on('command.run', { command: 'coach-refine' }, async ($, e) => {
    const options = await effective($, manifest)
    const draft = e.args.trim()

    if (draft === '') {
      return { text: t.empty }
    }

    const r = await refined($, draft, options)

    if (!r.isDone) {
      return { text: r.text }
    }

    const copied = await $.ui.copy({ text: r.text })

    return { text: `${r.text}\n\n${copied.isCopied ? t.copied : ''}`.trimEnd() }
  })

  // 보낸 뒤에는 되돌릴 원문이 의미가 없다.
  on('prompt.submit', async ($, e, next) => {
    const blanks = e.origin.kind === 'composer' ? blankAnswers(e.text) : 0

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // 모바일 화면에는 입력칸이 없다.
    if (e.props.hasSurvey || e.surface === 'mobile') {
      return next(e)
    }

    const options = await effective($, manifest)
    const working = await read($, busy)
    const kept = await read($, original)
    const direction = await read($, note)
    const { Box, Button, Text } = $.ui.resolve(e)

    trace($, `band surface=${e.surface}`)

    // 전사 화면처럼 꾸밈 없이 한 줄로: 흐린 글씨, 대괄호 없는 버튼, 가운뎃점 구분.
    if (working !== null) {
      return (
        <Box>
          <Text dimColor>⎿  {working}</Text>
        </Box>
      )
    }

    const actions = [
      { key: 'template', label: t.template, hotkey: 't', run: () => void insertTemplate($) },
      { key: 'ask', label: t.ask, hotkey: 'q', run: () => void askGaps($, e.surface, options) },
      { key: 'refine', label: t.refine, hotkey: 'r', run: () => void refine($, e.surface, options) },
      ...(kept === null ? [] : [{ key: 'undo', label: t.undo, hotkey: 'u', run: () => void restore($) }]),
      { key: 'settings', label: t.settings, hotkey: 's', run: () => void openSettings($) },
    ]

    return (
      <Box>
        <Text dimColor>⎿  </Text>
        {actions.map((one, index) => (
          <Box key={`slot-${one.key}`}>
            {index > 0 && <Text dimColor> · </Text>}
            <Button key={one.key} label={one.label} hotkey={one.hotkey} plain dimColor onPress={one.run} />
          </Box>
        ))}
        {direction.trim() !== '' && <Text dimColor>  ({t.directionOn})</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'coach-settings' }, async $ => {
    await openSettings($)

    return { text: t.settingsOpened }
  })

  // 설정 패널. 이번 세션 요청은 상태에, 늘 쓰는 스타일과 모델은 플러그인 설정에 저장한다.
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text dimColor>{t.noSettingsHere}</Text>
    }

    const direction = await read($, note)
    const options = await effective($, manifest)
    const { Box, Button, Input, Select, Text } = $.ui.resolve(e)
    const saved = (field: string) => {
      const value = options[field]

      return typeof value === 'string' ? value : ''
    }

    const model = saved('refineModel') || 'haiku'

    // 전사 화면처럼: 흐린 라벨과 값이 한 줄씩, 굵은 제목이나 테두리 없이.
    return (
      <Box flexDirection="column">
        <Text dimColor>{t.sessionSection}</Text>
        <Input
          key="note"
          label={`  ${t.noteLabel}  `}
          placeholder={t.placeholder}
          value={direction}
          submitLabel={t.save}
          autoFocus
          onInput={(value: string) => void update($, note, () => value)}
          onSubmit={(value: string) => void update($, note, () => value.trim())}
        />
        <Text dimColor> </Text>
        <Text dimColor>{t.savedSection}</Text>
        <Input
          key="askStyle"
          label={`  ${t.askStyleLabel}  `}
          placeholder={t.askStylePlaceholder}
          value={saved('askStyle')}
          submitLabel={t.save}
          onSubmit={(value: string) => void saveSetting($, 'askStyle', value.trim())}
        />
        <Input
          key="refineStyle"
          label={`  ${t.refineStyleLabel}  `}
          placeholder={t.refineStylePlaceholder}
          value={saved('refineStyle')}
          submitLabel={t.save}
          onSubmit={(value: string) => void saveSetting($, 'refineStyle', value.trim())}
        />
        <Select
          key="refineModel"
          label={`  ${t.modelLabel}  `}
          value={model}
          options={[
            { value: 'haiku', label: 'haiku' },
            { value: 'sonnet', label: 'sonnet' },
            { value: 'session', label: t.sessionModel },
          ]}
          onSelect={(value: string) => void saveSetting($, 'refineModel', value)}
        />
        <Select
          key="refineEffort"
          label={`  ${t.effortLabel}  `}
          value={effortFor(options)}
          options={EFFORTS.map(one => ({ value: one, label: one }))}
          onSelect={(value: string) => void saveSetting($, 'refineEffort', value)}
        />
        {model === 'haiku' && <Text dimColor>    ⎿  {t.effortHint}</Text>}
        <Select
          key="showUsage"
          label={`  ${t.usageLabel}  `}
          value={options.showUsage === true ? 'on' : 'off'}
          options={[
            { value: 'off', label: t.off },
            { value: 'on', label: t.on },
          ]}
          onSelect={(value: string) => void saveSetting($, 'showUsage', value === 'on')}
        />
        <Text dimColor> </Text>
        <Button key="close" label={t.close} role="dismiss" plain dimColor onPress={() => void $.ui.close({ id: SETTINGS })} />
      </Box>
    )
  })
}
