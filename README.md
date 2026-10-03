# prompt-coach

English | [한국어](README.ko.md)

A Claude Code mod (a function-hook plugin) that puts buttons above the prompt box.

- **Ask what's missing** (`q`): reads the conversation so far and the draft you are typing, and appends the questions the model would have asked before starting (3 at most by default), under a `[Clarify]` list with a blank after each. It forks the session's own conversation, so it runs on the session model and reuses the prompt cache.
- **Refine** (`r`): keeps every fact and condition you wrote and rewrites the draft in plain, ASD-STE100-style sentences (one instruction per sentence, active voice, one term per concept), folding answered `[Clarify]` items into the body and dropping unanswered ones. It sends only the draft, on `haiku` by default.
- **Template** (`t`): inserts a prompt skeleton into an empty box, or after the draft. The skeleton is yours if you saved one in Settings, else `templates/default.md` (`default.ko.md` when the band is in Korean). No model call.
- **Undo** (`u`): restores the draft from before the last ask or refine. Sending the prompt clears it.
- **Settings** (`s`): opens the panel that manages every feature (below). `/coach-settings` opens it too.

If you send a draft whose `[Clarify]` list still has an empty answer, the first Enter is stopped with a notice and the draft stays in the box; a second Enter on the same draft sends it. No model call.

If you edit the draft while the model is working, the result is not written over your edit.

## Look

The band and the panel take their colors from the app's theme, so they follow light and dark mode. Claude Code Desktop draws the buttons with its own (claude.ai) button style; the terminal keeps the band on one line. Hotkeys are on in the terminal only by default: on the desktop a hotkey always comes with a key box beside its button, so turning them on there is your choice in Settings.

## Settings

Every feature is managed in the Settings panel, in five tabs. A choice applies as soon as you press it. A text field applies when you press Save (Apply for the session direction) or Enter; typing alone changes nothing, so input methods such as Korean keep composing. Settings are kept in the plugin's own store, shared by all sessions, and each press uses the latest saved settings.

| Tab | What you set |
|---|---|
| General | Language (auto, English, Korean); which band buttons show (Template, Ask, Refine, Undo); hotkeys (auto: terminal only, always, off); warn about blank `[Clarify]` answers; show the tokens each press used; a direction for this session only |
| Ask | Questions at most (1 to 5); a saved style. The model is the session model and cannot change, because Ask reuses the conversation cache |
| Refine | Model (`haiku`, `sonnet`, `opus`, or the session model); effort (`low` to `max`; `haiku` takes none); a saved style; skip drafts shorter than N characters |
| Template | Edit lines (Enter or Save keeps them), add and remove lines; go back to the built-in template |
| About | Version; slash commands; where the instruction files are, with a copy button; repository; reset all settings (behind a separate confirm button) |

The session direction and the saved styles are added to the instructions as the user's own direction, never overriding what the draft says. With the language on auto, the band speaks Korean when `language` in settings.json is Korean, and English otherwise. Questions and refined text always follow the draft's language.

The instructions for both buttons live in `prompts/ask.md` and `prompts/refine.md` and are read on every press, so edits take effect at once; an update of the plugin puts them back. `{{draft}}` and `{{max}}` in `ask.md` are replaced by the draft and the question limit, and `{{style}}` in both by your direction.

## Where the band does not show

Two slash commands take the draft as an argument, show the result, and copy it to the clipboard:

```
/coach-ask <your draft>
/coach-refine <your draft>
```

## Install

This repository is also a plugin marketplace. In Claude Code:

```
/plugin marketplace add yuk7392/prompt-coach
/plugin install prompt-coach@prompt-coach
```

To update:

```
/plugin marketplace update prompt-coach
/plugin update prompt-coach@prompt-coach
/reload-plugins
```

To try a local checkout instead:

```bash
claude --plugin-dir /path/to/prompt-coach
```

## Use

Click a button in the band above the prompt. In the terminal you can also press ctrl+x tab to focus the band, then a button's key.

## Status

- Passes `claude plugin validate`, `tsc`, and `claude plugin test .` (the tests in `tests/`, drawn on the terminal, desktop, VS Code, and mobile surfaces) on Claude Code 2.1.286.
- In Claude Code Desktop the band shows and Refine fills the prompt box. Set `TRACE` to `true` in `hooks/register.tsx` to log reads and fills to `trace.log`.

## License

MIT. See `LICENSE`.
