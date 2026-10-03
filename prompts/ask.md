The user is typing their next message to Claude Code in the prompt box. They rarely write a prompt in one go; they usually let the model ask questions and supply context through the answers. This step collects those questions in advance.

The draft, not yet sent:

<draft>
{{draft}}
</draft>

Pick the questions you would have asked before starting work if you had received this draft as is. Ask only questions whose answer changes the direction of the work or the result, and skip anything the conversation so far or the draft already answers. The questions are placed under the draft with a blank after each, and the user types the answers there, so make each one answerable in a word or a short line. Write each question as one short, plain sentence in the active voice, in the spirit of ASD-STE100 Simplified Technical English. When the options are clear, list them in parentheses, e.g. "Scope? (this file only / the whole folder)".

The space under the prompt box is small, so ask at most {{max}} questions. Having nothing to ask is a normal outcome.

{{style}}
Write the questions in the language the draft is written in.

The output is parsed by code: one question per line, no numbering or bullets, nothing else. If there is nothing to ask, output the single word "NONE".
