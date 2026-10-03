# prompt-coach

A Claude Code mod (a function-hook plugin) that puts three buttons above the prompt box.

- **Ask what's missing** (`q`): reads the conversation so far and the draft you are typing, and appends up to three questions the model would have asked before starting, under a `[Clarify]` list with a blank after each. It forks the session's own conversation, so it runs on the session model and reuses the prompt cache.
- **Refine** (`r`): keeps every fact and condition you wrote and rewrites the draft in plain, ASD-STE100-style sentences (one instruction per sentence, active voice, one term per concept), folding answered `[Clarify]` items into the body and dropping unanswered ones. The model is the `refineModel` setting (`session`, `haiku`, `sonnet`).
- **Undo** (`u`): restores the draft from before the last ask or refine. Sending the prompt clears it.

If you edit the draft while the model is working, the result is not written over your edit.

Tell the buttons how you want it in two ways:

- **One-off**: type a direction in the field at the start of the band (e.g. "formal tone, conditions as a list"). It applies to both buttons until you clear it, for this session only.
- **Standing**: set `askStyle` and `refineStyle` in the plugin's settings. Both are added to the instructions as the user's own direction, never overriding what the draft says.

The band speaks Korean when `language` in settings.json is Korean, and English otherwise. Questions and refined text always follow the draft's language.

The instructions for both buttons live in `prompts/ask.md` and `prompts/refine.md` and are read on every press, so edits take effect at once. `{{draft}}` in `ask.md` is replaced by the draft, and `{{style}}` in both by your direction. Both tell the model to answer in the draft's language.

## Use

```bash
claude --plugin-dir /path/to/prompt-coach
```

Click the band above the prompt, or press ctrl+x tab, then press a button's key.

## Status

- Passes `claude plugin validate` and `tsc` on Claude Code 2.1.286.
- Not yet tried in a live session: the buttons have not been pressed end to end.
- Claude Code Desktop draws its own prompt box, where the plugin API may refuse `$.prompt.fill`; checking with `trace.log`.
