export type Draft = string | null

export type ButtonId = 'template' | 'ask' | 'refine' | 'undo'

export type HotkeyMode = 'auto' | 'on' | 'off'

export type SettingsTab = 'general' | 'ask' | 'refine' | 'template' | 'about'

export type Prefs = {
  language?: 'auto' | 'en' | 'ko'
  buttons?: Partial<Record<ButtonId, boolean>>
  hotkeys?: HotkeyMode
  warnBlank?: boolean
  showUsage?: boolean
  askStyle?: string
  maxQuestions?: number
  refineStyle?: string
  refineModel?: string
  refineEffort?: string
  minDraft?: number
  template?: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-coach': {
      busy: Draft
      original: Draft
      note: string
      warned: Draft
      prefs: Prefs
      tab: SettingsTab
      resetArmed: boolean
    }
  }
}
