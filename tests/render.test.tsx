import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// 테스트 환경에는 파일이 없으니 기본 골격 파일만 흉내 낸다.
const files = (on: On) => {
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: 'Goal: \nContext: \n' }))
  on('store.set', () => ({ value: undefined }))
}

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

test('the band and the settings panel draw on terminal and desktop', async ($, on) => {
  files(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ key: 'refine' })).toBeDefined()
    expect(await band.find({ key: 'settings' })).toBeDefined()
    await band.unmount()

    const pane = await $.ui.mount({ ...PANE, surface })
    for (const key of ['language', 'showUsage', 'note', 'button-template', 'button-ask', 'button-refine', 'button-undo',
      'askStyle', 'maxQuestions', 'refineStyle', 'refineModel', 'refineEffort', 'minDraft', 'tpl-add', 'tpl-reset', 'warnBlank', 'reset', 'close']) {
      expect(await pane.find({ key })).toBeDefined()
    }
    await pane.unmount()
  }
})

test('turning a button off in settings hides it from the band', async ($, on) => {
  files(on)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.select({ key: 'button-template', value: 'off' })
  await pane.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ key: 'template' })).toBeUndefined()
  expect(await band.find({ key: 'ask' })).toBeDefined()
  await band.unmount()
})
