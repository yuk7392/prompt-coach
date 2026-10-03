export type Draft = string | null

export type Prefs = {
  askStyle?: string
  refineStyle?: string
  refineModel?: string
  refineEffort?: string
  showUsage?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-coach': { busy: Draft; original: Draft; note: string; warned: Draft; prefs: Prefs }
  }
}
