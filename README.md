# prompt-coach

English | [한국어](README.ko.md)

A Claude Code mod (a function-hook plugin) that puts buttons above the prompt box.

- **Ask what's missing** (`q`): reads the conversation so far and the draft you are typing, and appends up to three questions the model would have asked before starting, under a `[Clarify]` list with a blank after each. It forks the session's own conversation, so it runs on the session model and reuses the prompt cache.
- **Refine** (`r`): keeps every fact and condition you wrote and rewrites the draft in plain, ASD-STE100-style sentences (one instruction per sentence, active voice, one term per concept), folding answered `[Clarify]` items into the body and dropping unanswered ones. The model is the `refineModel` setting (`haiku` by default, `sonnet`, or `session`).
- **Template** (`t`): inserts a prompt skeleton from `templates/default.md` (`default.ko.md` when the band is in Korean), into an empty box or after the draft. No model call.
- **Undo** (`u`): restores the draft from before the last ask or refine. Sending the prompt clears it.
- **Settings** (`s`): opens a panel for how you want it (see below), the Refine model and effort, and a switch that shows the tokens each press used. `/coach-settings` opens it too.

If you send a draft whose `[Clarify]` list still has an empty answer, the first Enter is stopped with a notice and the draft stays in the box; a second Enter on the same draft sends it. No model call.

If you edit the draft while the model is working, the result is not written over your edit.

Tell the buttons how you want it in two ways:

- **This session only**: type a direction in the Settings panel (e.g. "formal tone, conditions as a list"). It applies to both buttons until you clear it. The band shows when one is on.
- **Saved**: set the Ask style and Refine style in the same panel. Panel choices are kept in the plugin's own store across sessions; the `userConfig` fields in `plugin.json` are only the defaults.

Both are added to the instructions as the user's own direction, never overriding what the draft says.

The band speaks Korean when `language` in settings.json is Korean, and English otherwise. Questions and refined text always follow the draft's language.

The instructions for both buttons live in `prompts/ask.md` and `prompts/refine.md` and are read on every press, so edits take effect at once. `{{draft}}` in `ask.md` is replaced by the draft, and `{{style}}` in both by your direction. Both tell the model to answer in the draft's language.

## Apps that draw their own prompt box

Claude Code Desktop draws its own prompt box, so the band and the box-editing buttons may not work there. Two slash commands take the draft as an argument instead, show the result, and copy it to the clipboard:

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

To try a local checkout instead:

```bash
claude --plugin-dir /path/to/prompt-coach
```

## Use

Click the band above the prompt, or press ctrl+x tab, then press a button's key.

## Status

- Passes `claude plugin validate` and `tsc` on Claude Code 2.1.286.
- Not yet tried in a live session: the buttons have not been pressed end to end.
- Claude Code Desktop draws its own prompt box, where the plugin API may refuse `$.prompt.fill`; not yet confirmed either way. Set `TRACE` to `true` in `hooks/register.tsx` to log reads and fills to `trace.log`.

## License

MIT. See `LICENSE`.
