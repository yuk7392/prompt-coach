export type Draft = string | null

declare module 'claude-code' {
  interface PluginState {
    'prompt-coach': { busy: Draft; original: Draft }
  }
}
