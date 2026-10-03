import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// 테스트에는 파일, 저장소, 입력창, 모델이 없다. 아래 가짜가 그 자리를 대신하고 무엇이 불렸는지 남긴다.
type World = {
  box: string
  stored: unknown
  fork: string
  complete: string
  fills: { text: string; mode: string }[]
  toasts: string[]
  forks: { prompt: string }[]
  completes: { model: string; effort?: string; system?: string; prompt: string }[]
  copies: string[]
  commands: { name: string; description: string }[]
  deleted: string[]
  refuse: boolean
}

const world = (stored?: unknown): World => ({
  box: '',
  stored,
  fork: 'Which file?\nWhich browser?\nWhat counts as done?\nNONE',
  complete: '<refined>Fix the login bug in auth.ts.</refined>',
  fills: [],
  toasts: [],
  forks: [],
  completes: [],
  copies: [],
  commands: [],
  deleted: [],
  refuse: false,
})

const fake = (on: On, w: World) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: { language: 'korean' } as never }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', ($, e) => {
    w.commands.push({ name: e.name, description: e.description })
    return { value: { command: e.name } }
  })
  on('fs.exists', ($, e) => ({ value: e.path.endsWith('default.ko.md') }))
  on('fs.read', ($, e) => {
    if (e.path.endsWith('ask.md')) return { value: 'ASK {{draft}} max={{max}}\n{{style}}' }
    if (e.path.endsWith('refine.md')) return { value: 'REFINE\n{{style}}' }
    if (e.path.endsWith('plugin.json')) return { value: '{"version":"9.9.9"}' }
    if (e.path.endsWith('default.ko.md')) return { value: '목표: \n조건: \n' }
    return { value: 'Goal: \nContext: \n' }
  })
  on('store.get', () => ({ value: w.stored }))
  on('store.set', ($, e) => {
    w.stored = e.value
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    w.deleted.push(e.key)
    w.stored = undefined
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: w.box, cursor: w.box.length } }))
  on('prompt.fill', ($, e) => {
    w.fills.push({ text: e.text, mode: e.mode })
    w.box = e.mode === 'append' ? w.box + e.text : e.text
    return { isFilled: true }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.toast', ($, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', ($, e) => {
    w.copies.push(e.text)
    return { value: { isCopied: true } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 }
  on('model.fork', ($, e) => {
    w.forks.push({ prompt: e.prompt })
    return { value: { isAnswered: true, text: w.fork, usage } }
  })
  on('model.complete', ($, e) => {
    // 막힌 모델처럼 엔진이 보내기를 거절하면 결과가 아니라 예외가 난다.
    if (w.refuse) throw new Error('model not allowed')
    w.completes.push({ model: e.model ?? '', effort: e.effort, system: e.system, prompt: e.prompt })
    return { value: { isAnswered: true, text: w.complete, usage } }
  })
}

const start = { cwd: 'C:/work', surface: 'terminal', isInteractive: true } as const

const BAND = {
  plugin: 'prompt-coach',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

const PANE = {
  plugin: 'prompt-coach',
  component: 'Pane',
  requestId: 'coach-settings',
  props: { title: 'Settings', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const TABS = ['general', 'ask', 'refine', 'template', 'about'] as const

// 탭마다 있어야 하는 조작 요소. 기능 목록과 설정 패널을 대조하는 표이기도 하다.
const CONTROLS: Record<(typeof TABS)[number], string[]> = {
  general: ['language-auto', 'language-en', 'language-ko', 'button-template', 'button-ask', 'button-refine', 'button-undo',
    'hotkeys-auto', 'hotkeys-on', 'hotkeys-off', 'warnBlank-on', 'warnBlank-off', 'showUsage-on', 'showUsage-off', 'note'],
  ask: ['maxQuestions-1', 'maxQuestions-5', 'askStyle'],
  refine: ['refineModel-haiku', 'refineModel-sonnet', 'refineModel-opus', 'refineModel-session', 'refineEffort-low',
    'refineEffort-max', 'refineStyle', 'minDraft-0', 'minDraft-60'],
  template: ['tpl-line-0', 'tpl-remove-0', 'tpl-add'],
  about: ['copy-path', 'reset'],
}

test('the band and every settings tab draw on every surface', async ($, on) => {
  fake(on, world())
  await $.session.start(start)
  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    for (const key of ['template', 'ask', 'refine', 'settings']) {
      expect(await band.find({ key })).toBeDefined()
    }
    await band.unmount()

    const pane = await $.ui.mount({ ...PANE, surface })
    for (const id of TABS) {
      await pane.press({ key: `tab-${id}` })
      for (const key of CONTROLS[id]) {
        expect(await pane.find({ key }), `${surface} ${id} ${key}`).toBeDefined()
      }
    }
    await pane.press({ key: 'tab-general' })
    await pane.unmount()
  }

  // 모바일 앱에는 글자 칸이 없다. 고르는 버튼은 그려지고, 글자 칸 자리에는 지금 값이 글로 나온다.
  const mobile = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await mobile.find({ key: 'language-en' })).toBeDefined()
  expect(await mobile.find({ key: 'note-value' })).toBeDefined()
  for (const id of TABS) {
    await mobile.press({ key: `tab-${id}` })
    expect(await mobile.drawn()).toMatchObject({ type: 'Box' })
  }
  await mobile.press({ key: 'tab-template' })
  expect(await mobile.find({ key: 'tpl-text-0' })).toBeDefined()
  expect(await mobile.find({ key: 'tpl-add' })).toBeUndefined()
  await mobile.unmount()
})

test('desktop hides hotkeys by default, the terminal shows them, and the setting overrides both', async ($, on) => {
  fake(on, world())
  await $.session.start(start)
  const keysOf = async (surface: 'terminal' | 'desktop') => {
    const band = await $.ui.mount({ ...BAND, surface })
    const found = await band.find({ key: 'refine' })
    await band.unmount()
    return JSON.stringify(found)
  }
  expect(await keysOf('terminal')).toContain('"hotkey":"r"')
  expect(await keysOf('desktop')).not.toContain('hotkey')

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'hotkeys-on' })
  expect(await keysOf('desktop')).toContain('"hotkey":"r"')
  await pane.press({ key: 'hotkeys-off' })
  expect(await keysOf('terminal')).not.toContain('hotkey')
  await pane.unmount()
})

test('band buttons turn off and on again', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await pane.press({ key: 'button-template' })
  await pane.press({ key: 'button-ask' })
  expect(await band.find({ key: 'template' })).toBeUndefined()
  expect(await band.find({ key: 'ask' })).toBeUndefined()
  expect(await band.find({ key: 'refine' })).toBeDefined()
  expect(w.stored).toEqual({ buttons: { template: false, ask: false, refine: true, undo: true } })

  await pane.press({ key: 'button-template' })
  expect(await band.find({ key: 'template' })).toBeDefined()
  expect(await band.find({ key: 'settings' })).toBeDefined()
  await band.unmount()
  await pane.unmount()
})

test('language follows settings.json on auto and can be forced', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(JSON.stringify(await band.find({ key: 'refine' }))).toContain('다듬기')

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'language-en' })
  expect(JSON.stringify(await band.find({ key: 'refine' }))).toContain('Refine')
  expect(w.commands.at(-1)?.description).toBe('Open prompt-coach settings')
  expect(JSON.stringify(await pane.find({ key: 'tab-general' }))).toContain('General')

  await pane.press({ key: 'language-auto' })
  expect(JSON.stringify(await band.find({ key: 'refine' }))).toContain('다듬기')
  await pane.unmount()
  await band.unmount()
})

test('Ask uses the question count and the saved style; usage toasts only when on', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await pane.press({ key: 'tab-ask' })
  await pane.press({ key: 'maxQuestions-1' })
  await pane.input({ key: 'askStyle', text: '  scope first  ' })
  expect(w.toasts.at(-1)).toBe('저장했어요')

  w.box = 'Fix the login bug in auth.ts'
  await band.press({ key: 'ask' })
  expect(w.forks.at(-1)?.prompt).toContain('max=1')
  expect(w.forks.at(-1)?.prompt).toContain('<style>\nscope first\n</style>')
  expect(w.fills.at(-1)).toEqual({ text: '\n\n[Clarify]\n- Which file?\n  → ', mode: 'append' })
  expect(w.toasts.filter(one => one.includes('토큰'))).toHaveLength(0)

  await pane.press({ key: 'tab-general' })
  await pane.press({ key: 'showUsage-on' })
  w.box = 'Fix the login bug in auth.ts'
  await band.press({ key: 'ask' })
  expect(w.toasts.at(-1)).toBe('빠진 것 묻기: 입력 11 + 캐시 100, 출력 5 토큰')
  await band.unmount()
  await pane.unmount()
})

test('Refine uses the chosen model, effort, style and minimum length', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await pane.press({ key: 'tab-refine' })

  w.box = 'short one'
  await band.press({ key: 'refine' })
  expect(w.completes).toHaveLength(0)
  expect(w.toasts.at(-1)).toBe('다듬기엔 초안이 너무 짧아요')

  await pane.press({ key: 'minDraft-0' })
  await pane.press({ key: 'refineModel-opus' })
  await pane.press({ key: 'refineEffort-high' })
  await pane.input({ key: 'refineStyle', text: 'bullets' })
  await band.press({ key: 'refine' })
  expect(w.completes.at(-1)).toMatchObject({ model: 'opus', effort: 'high' })
  expect(w.completes.at(-1)?.system).toContain('<style>\nbullets\n</style>')
  expect(w.box).toBe('Fix the login bug in auth.ts.')

  await pane.press({ key: 'refineModel-session' })
  w.box = 'Another draft that is long enough'
  await band.press({ key: 'refine' })
  expect(w.completes.at(-1)?.model).toBe('claude-opus-5-5')

  await pane.press({ key: 'minDraft-60' })
  w.box = 'Another draft that is long enough'
  await band.press({ key: 'refine' })
  expect(w.completes).toHaveLength(2)
  await band.unmount()
  await pane.unmount()
})

test('the blank-answer warning can be turned off', async ($, on) => {
  fake(on, world())
  await $.session.start(start)
  const blank = 'Do it\n\n[Clarify]\n- Which file?\n  → '
  const composer = { kind: 'composer' } as const

  expect(await $.prompt.submit({ text: blank, wait: false, origin: composer })).toHaveProperty('drop')
  expect(await $.prompt.submit({ text: blank, wait: false, origin: composer })).toEqual({ text: blank })

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'warnBlank-off' })
  await pane.unmount()
  const other = `${blank}\n- Scope?\n  → `
  expect(await $.prompt.submit({ text: other, wait: false, origin: composer })).toEqual({ text: other })
})

test('the session direction applies on Apply and reaches both buttons', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  // 치는 동안에는 적용하지 않는다.
  await pane.input({ key: 'note', text: 'formal', kind: 'change' })
  expect(JSON.stringify(await band.drawn())).not.toContain('원하는 방식 적용 중')

  await pane.input({ key: 'note', text: 'formal' })
  expect(JSON.stringify(await band.drawn())).toContain('원하는 방식 적용 중')
  w.box = 'Fix the login bug in auth.ts'
  await band.press({ key: 'refine' })
  expect(w.completes.at(-1)?.system).toContain('<style>\nformal\n</style>')

  await pane.input({ key: 'note', text: '   ' })
  expect(JSON.stringify(await band.drawn())).not.toContain('원하는 방식 적용 중')
  await band.unmount()
  await pane.unmount()
})

test('the template is edited, saved, inserted, and put back', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await pane.press({ key: 'tab-template' })
  expect(JSON.stringify(await pane.drawn())).toContain('기본 골격')

  // 치기만 하면 저장하지 않는다. 줄 추가·삭제는 친 글을 먼저 얹고 저장한다.
  await pane.input({ key: 'tpl-line-0', text: '목표: 로그인', kind: 'change' })
  expect(w.stored).toBeUndefined()
  await pane.press({ key: 'tpl-add' })
  expect(w.stored).toEqual({ template: ['목표: 로그인', '조건:', ''] })
  await pane.input({ key: 'tpl-line-2', text: '끝: 테스트 통과', kind: 'change' })
  await pane.press({ key: 'tpl-remove-1' })
  expect(w.stored).toEqual({ template: ['목표: 로그인', '끝: 테스트 통과'] })
  expect(JSON.stringify(await pane.drawn())).toContain('직접 만든 골격')

  w.box = ''
  await band.press({ key: 'template' })
  expect(w.fills.at(-1)).toEqual({ text: '목표: 로그인\n끝: 테스트 통과', mode: 'replace' })
  await band.press({ key: 'template' })
  expect(w.fills.at(-1)).toEqual({ text: '\n\n목표: 로그인\n끝: 테스트 통과', mode: 'append' })

  // Enter 와 저장 버튼으로 저장한다. 바뀐 것이 없으면 저장하지 않고 알린다.
  await pane.input({ key: 'tpl-line-1', text: '끝: 빌드 통과' })
  expect(w.stored).toEqual({ template: ['목표: 로그인', '끝: 빌드 통과'] })
  expect(w.toasts.at(-1)).toBe('골격을 저장했어요')
  await pane.input({ key: 'tpl-line-0', text: '목표: 회원가입', kind: 'change' })
  await pane.press({ key: 'tpl-save' })
  expect(w.stored).toEqual({ template: ['목표: 회원가입', '끝: 빌드 통과'] })
  await pane.press({ key: 'tpl-save' })
  expect(w.toasts.at(-1)).toBe('바뀐 것이 없어요')

  // 탭을 떠나면 화면에서 사라진 글은 저장하지 않는다.
  await pane.input({ key: 'tpl-line-0', text: '사라질 글', kind: 'change' })
  await pane.press({ key: 'tab-general' })
  await pane.press({ key: 'tab-template' })
  await pane.press({ key: 'tpl-save' })
  expect(w.stored).toEqual({ template: ['목표: 회원가입', '끝: 빌드 통과'] })

  await pane.press({ key: 'tpl-reset' })
  expect(w.stored).toEqual({})
  w.box = ''
  await band.press({ key: 'template' })
  expect(w.fills.at(-1)).toEqual({ text: '목표: \n조건:', mode: 'replace' })

  // 줄을 모두 지운 골격은 넣지 않고 알린다.
  await pane.press({ key: 'tpl-remove-0' })
  await pane.press({ key: 'tpl-remove-0' })
  expect(w.stored).toEqual({ template: [] })
  const fills = w.fills.length
  await band.press({ key: 'template' })
  expect(w.fills).toHaveLength(fills)
  expect(w.toasts.at(-1)).toBe('골격이 비어 있어요')
  await band.unmount()
  await pane.unmount()
})

test('reset needs a separate confirm press, so a double click does not reset', async ($, on) => {
  const w = world({ language: 'en', maxQuestions: 5, askStyle: 'x', template: ['a'] })
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.input({ key: 'note', text: 'formal' })
  await pane.press({ key: 'tab-about' })

  // 같은 자리를 두 번 눌러도(더블클릭) 지워지지 않는다.
  await pane.press({ key: 'reset' })
  await pane.press({ key: 'reset' })
  expect(w.deleted).toHaveLength(0)
  expect(await pane.find({ key: 'reset-confirm' })).toBeDefined()

  // 취소하거나 다른 탭에 다녀오면 확인 버튼이 사라진다.
  await pane.press({ key: 'reset-cancel' })
  expect(await pane.find({ key: 'reset-confirm' })).toBeUndefined()
  await pane.press({ key: 'reset' })
  await pane.press({ key: 'tab-general' })
  await pane.press({ key: 'tab-about' })
  expect(await pane.find({ key: 'reset-confirm' })).toBeUndefined()

  await pane.press({ key: 'reset' })
  await pane.press({ key: 'reset-confirm' })
  expect(w.deleted).toEqual(['prefs'])
  expect(w.toasts.at(-1)).toBe('설정을 기본값으로 돌렸어요')

  await pane.press({ key: 'tab-general' })
  expect(JSON.stringify(await pane.find({ key: 'note' }))).not.toContain('formal')
  expect(JSON.stringify(await pane.find({ key: 'tab-general' }))).toContain('일반')
  await pane.unmount()
})

test('a save keeps what another session saved meanwhile', async ($, on) => {
  const w = world({ refineModel: 'sonnet' })
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // 다른 세션이 이 세션이 읽은 뒤에 값을 저장했다.
  w.stored = { refineModel: 'opus', askStyle: 'from B' }
  await pane.press({ key: 'tab-ask' })
  await pane.press({ key: 'maxQuestions-5' })
  expect(w.stored).toEqual({ refineModel: 'opus', askStyle: 'from B', maxQuestions: 5 })

  // 다른 세션이 초기화했으면, 이 세션의 다음 저장이 지워진 값을 되살리지 않는다.
  w.stored = undefined
  await pane.press({ key: 'maxQuestions-2' })
  expect(w.stored).toEqual({ maxQuestions: 2 })

  // 버튼을 누를 때 다른 세션이 바꾼 값을 따른다.
  w.stored = { refineModel: 'sonnet' }
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  w.box = 'Fix the login bug in auth.ts'
  await band.press({ key: 'refine' })
  expect(w.completes.at(-1)?.model).toBe('sonnet')
  await band.unmount()
  await pane.unmount()
})

test('a draft that contains a placeholder is sent as written', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  w.box = 'Change {{max}} and {{style}} in ask.md'
  await band.press({ key: 'ask' })
  expect(w.forks.at(-1)?.prompt).toBe('ASK Change {{max}} and {{style}} in ask.md max=3\n')
  await band.unmount()
})

test('a model call the engine refuses shows a notice and frees the band', async ($, on) => {
  const w = world({ refineModel: 'opus' })
  w.refuse = true
  fake(on, w)
  await $.session.start(start)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  w.box = 'Fix the login bug in auth.ts'
  await band.press({ key: 'refine' })
  // 시험 키트는 던진 훅을 건너뛰고 '구현 없음'으로 거절한다. 실제 세션에서는 엔진의 거절 이유가 괄호 안에 들어간다.
  expect(w.toasts.at(-1)).toMatch(/^다듬지 못했어요 \(.+\)$/)
  expect(await band.find({ key: 'refine' })).toBeDefined()
  await band.unmount()
})

test('text fields write nothing while typing; Enter or Save writes', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-refine' })
  await pane.input({ key: 'refineStyle', text: '조건은 목록으로', kind: 'change' })
  await pane.press({ key: 'minDraft-30' })
  expect(w.stored).toEqual({ minDraft: 30 })
  await pane.input({ key: 'refineStyle', text: '조건은 목록으로' })
  expect(w.stored).toEqual({ minDraft: 30, refineStyle: '조건은 목록으로' })
  expect(w.toasts.at(-1)).toBe('저장했어요')
  await pane.unmount()
})

test('a band button toggle saves what the screen showed, not the opposite of the store', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // 다른 세션이 이미 '빠진 것 묻기'를 껐지만 이 화면에는 아직 켜짐으로 보인다. 끄려고 누른다.
  w.stored = { buttons: { template: true, ask: false, refine: true, undo: true } }
  await pane.press({ key: 'button-ask' })
  expect(w.stored).toEqual({ buttons: { template: true, ask: false, refine: true, undo: true } })
  await pane.unmount()
})

test('stored settings load at start, and bad values fall back to the defaults', async ($, on) => {
  const w = world({ buttons: 'all', maxQuestions: 99, refineModel: 'gpt', minDraft: 7, template: 'x', hotkeys: 'on' })
  fake(on, w)
  await $.session.start(start)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  for (const key of ['template', 'ask', 'refine']) {
    expect(JSON.stringify(await band.find({ key }))).toContain('hotkey')
  }
  w.box = 'Fix the login bug in auth.ts'
  await band.press({ key: 'ask' })
  expect(w.forks.at(-1)?.prompt).toContain('max=3')
  await band.press({ key: 'refine' })
  expect(w.completes.at(-1)?.model).toBe('haiku')
  await band.press({ key: 'template' })
  expect(w.fills.at(-1)?.text).toContain('목표:')
  await band.unmount()
})

test('About shows the version and copies the instruction folder', async ($, on) => {
  const w = world()
  fake(on, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-about' })
  expect(JSON.stringify(await pane.drawn())).toContain('prompt-coach 9.9.9')
  await pane.press({ key: 'copy-path' })
  expect(w.copies.at(-1)).toMatch(/prompts$/)
  expect(w.toasts.at(-1)).toBe('경로를 복사했어요')
  await pane.unmount()
})
