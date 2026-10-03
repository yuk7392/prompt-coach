import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

// 개발 중 확인용: 어느 화면에서 입력창을 읽고 채울 수 있는지 trace.log에 남긴다.
const TRACE = true
const TRACE_MAX = 200

const busy = atom({ plugin: 'prompt-coach', key: 'busy' } as const, null)
const original = atom({ plugin: 'prompt-coach', key: 'original' } as const, null)
// 띠의 입력칸에 적은 이번 세션용 요청. 지울 때까지 두 버튼 모두에 붙는다.
const note = atom({ plugin: 'prompt-coach', key: 'note' } as const, '')

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
  },
}

let t = STRINGS.en

const pickLanguage = async ($: EngineInterface) => {
  const { language } = await $.settings.read()

  t = typeof language === 'string' && /^(ko|korean)|한국/i.test(language.trim()) ? STRINGS.ko : STRINGS.en
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

const askGaps = async ($: EngineInterface, surface: string, options: PluginOptions) => {
  const draft = await readDraft($, surface)

  if (draft === undefined) {
    return
  }

  await update($, busy, () => t.asking)

  try {
    const r = await $.model.fork({ prompt: await promptFile($, 'ask', options, draft) })

    trace($, `fork answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)

    if (!r.isAnswered) {
      $.ui.toast(r.reason === 'nothing-to-fork' ? t.noHistory : t.noQuestions(r.reason))

      return
    }

    const questions = r.text
      .split('\n')
      .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(line => line !== '' && line.toUpperCase() !== 'NONE')
      .slice(0, 3)

    if (questions.length === 0) {
      $.ui.toast(t.nothingToAsk)

      return
    }

    const block = `\n\n${HEADER}\n${questions.map(q => `- ${q}\n  → `).join('\n')}`

    await update($, original, () => draft)
    await fillIfUnchanged($, draft, block, 'append')
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
    const model = await modelFor($, options)
    const r = await $.model.complete({
      model,
      system: await promptFile($, 'refine', options),
      prompt: draft,
      effort: 'low',
      maxTokens: 16000,
    })

    trace($, `complete model=${model} answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)

    if (!r.isAnswered || r.text.trim() === '') {
      $.ui.toast(t.noRefine(r.isAnswered ? t.emptyReply : r.reason))

      return
    }

    // 묻기 전 원문이 이미 있으면 그것을 되돌릴 자리로 둔다.
    const kept = await read($, original)

    if (kept === null || !draft.startsWith(kept)) {
      await update($, original, () => draft)
    }

    await fillIfUnchanged($, draft, r.text.trim(), 'replace')
  } finally {
    await update($, busy, () => null)
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

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await pickLanguage($)
    trace($, `start surfaces=${JSON.stringify(await $.session.surfaces())}`)

    return next(e)
  })

  // 보낸 뒤에는 되돌릴 원문이 의미가 없다.
  on('prompt.submit', async ($, e, next) => {
    await update($, original, () => null)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // 모바일 화면에는 입력칸이 없다.
    if (e.props.hasSurvey || e.surface === 'mobile') {
      return next(e)
    }

    const working = await read($, busy)
    const kept = await read($, original)
    const direction = await read($, note)
    const { Box, Button, Input, Text } = $.ui.resolve(e)

    trace($, `band surface=${e.surface}`)

    if (working !== null) {
      return (
        <Box>
          <Text dimColor>{working}</Text>
        </Box>
      )
    }

    return (
      <Box gap={1}>
        <Input
          key="note"
          placeholder={t.placeholder}
          value={direction}
          submitLabel={t.save}
          onInput={(value: string) => void update($, note, () => value)}
          onSubmit={(value: string) => void update($, note, () => value.trim())}
        />
        <Button key="ask" label={t.ask} hotkey="q" onPress={() => void askGaps($, e.surface, options)} />
        <Button key="refine" label={t.refine} hotkey="r" onPress={() => void refine($, e.surface, options)} />
        {kept !== null && <Button key="undo" label={t.undo} hotkey="u" onPress={() => void restore($)} />}
      </Box>
    )
  })
}
