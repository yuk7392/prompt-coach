import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

// 개발 중 확인용: 어느 화면에서 입력창을 읽고 채울 수 있는지 trace.log에 남긴다.
const TRACE = true
const TRACE_MAX = 200

const busy = atom({ plugin: 'prompt-coach', key: 'busy' } as const, null)
const original = atom({ plugin: 'prompt-coach', key: 'original' } as const, null)

const HEADER = '[Clarify]'

// 기본 지시문은 prompts/*.md 에 있다. 사용자가 고칠 수 있게 버튼을 누를 때마다 새로 읽는다.
const promptFile = async ($: EngineInterface, name: 'ask' | 'refine') =>
  await $.fs.read(`${$.plugin.root}/prompts/${name}.md`)

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
    $.ui.toast('그 사이 입력이 바뀌어서 반영하지 않았어요')

    return false
  }

  const filled = await $.prompt.fill({ text, mode })

  trace($, `fill mode=${mode} isFilled=${filled.isFilled} refusal=${filled.refusal ?? '-'}`)

  if (!filled.isFilled) {
    $.ui.toast(`입력창에 넣지 못했어요 (${filled.refusal ?? '이유 모름'})`)
  }

  return filled.isFilled
}

const readDraft = async ($: EngineInterface, surface: string) => {
  const box = await $.prompt.read()

  trace($, `read surface=${surface} length=${box.text.length}`)

  if (box.text.trim() === '') {
    $.ui.toast('입력 중인 내용이 없어요')

    return undefined
  }

  return box.text
}

const askGaps = async ($: EngineInterface, surface: string) => {
  const draft = await readDraft($, surface)

  if (draft === undefined) {
    return
  }

  await update($, busy, () => '빠진 것 찾는 중…')

  try {
    const r = await $.model.fork({ prompt: (await promptFile($, 'ask')).replace('{{draft}}', () => draft) })

    trace($, `fork answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)

    if (!r.isAnswered) {
      $.ui.toast(r.reason === 'nothing-to-fork' ? '대화가 아직 없어서 물을 근거가 없어요' : `질문을 못 받았어요 (${r.reason})`)

      return
    }

    const questions = r.text
      .split('\n')
      .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(line => line !== '' && line.toUpperCase() !== 'NONE')
      .slice(0, 3)

    if (questions.length === 0) {
      $.ui.toast('더 물을 것이 없어요')

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

  await update($, busy, () => '다듬는 중…')

  try {
    const model = await modelFor($, options)
    const r = await $.model.complete({
      model,
      system: await promptFile($, 'refine'),
      prompt: draft,
      effort: 'low',
      maxTokens: 16000,
    })

    trace($, `complete model=${model} answered=${r.isAnswered}${r.isAnswered ? '' : ` reason=${r.reason}`}`)

    if (!r.isAnswered || r.text.trim() === '') {
      $.ui.toast(`다듬지 못했어요 (${r.isAnswered ? '빈 답' : r.reason})`)

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
    trace($, `start surfaces=${JSON.stringify(await $.session.surfaces())}`)

    return next(e)
  })

  // 보낸 뒤에는 되돌릴 원문이 의미가 없다.
  on('prompt.submit', async ($, e, next) => {
    await update($, original, () => null)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const working = await read($, busy)
    const kept = await read($, original)
    const { Box, Button, Text } = $.ui.resolve(e)

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
        <Button key="ask" label="빠진 것 묻기" hotkey="q" onPress={() => void askGaps($, e.surface)} />
        <Button key="refine" label="다듬기" hotkey="r" onPress={() => void refine($, e.surface, options)} />
        {kept !== null && <Button key="undo" label="되돌리기" hotkey="u" onPress={() => void restore($)} />}
      </Box>
    )
  })
}
