export type Draft = string | null

export type ButtonId = 'template' | 'ask' | 'refine' | 'undo'

export type Prefs = {
  language?: 'auto' | 'en' | 'ko'
  buttons?: Partial<Record<ButtonId, boolean>>
  askStyle?: string
  maxQuestions?: number
  refineStyle?: string
  refineModel?: string
  refineEffort?: string
  minDraft?: number
  warnBlank?: boolean
  showUsage?: boolean
  template?: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-coach': { busy: Draft; original: Draft; note: string; warned: Draft; prefs: Prefs }
  }
}
