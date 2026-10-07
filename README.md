# claude-clip-command

A small plugin ("mod") for Claude Code's terminal UI that copies the command Claude asks you to run and places it in the prompt input.
When a reply ends with a command for you to run (a code block starting with `! `), you normally select it, copy it and paste it by hand.
This plugin copies that block to the clipboard and, if the input is empty, places it there. Press Enter on it and the plugin runs it and feeds the output back to the model.

日本語の説明は [README.ja.md](README.ja.md) にあります。

In-app messages are in Japanese.

## When to use

- When Claude keeps ending replies with a command for you to run and you copy and paste it by hand each time.
- When you want the output of that command to go back to the model without pasting it yourself.
- When Claude suggests a one-line slash command such as `/rename my-session` and you want it ready in the input instead of retyping it.

Not for you if you are on Windows (untested), run Claude non-interactively (`claude -p`, where there is no prompt input to fill), or do not want a command written by the model to run when you press Enter.

## What it looks like

Before: a reply ends with a code block starting with `! `. You select the text, copy it, paste it into the input and press Enter.

After: a toast reads `⌨️ 実行するコマンドを入力欄に置きました（Enter で実行）: …` and the same text is already in the input. Press Enter and the plugin runs it; the submitted text is replaced with `[MOD clip-command] ran: $ …` followed by the exit code, seconds, stdout and stderr, so the model reads the output. If you were typing something, the toast reads `📋 実行するコマンドをクリップボードへ入れました（Cmd+V → Enter）: …` instead and your draft is left alone.

## Requirements

- Built on Claude Code's plugin hooks ("mods") API, which is in early access and may change between versions.
- Developed and tested with Claude Code 2.1.287 to 2.1.289 on macOS.
- **Windows is untested.** The plugin falls back to sending the text as a normal message when it cannot start a shell.

## Install

From the marketplace in this repository:

```
claude plugin marketplace add i-noma-ru/claude-clip-command
claude plugin install clip-command@claude-clip-command
```

Or for one session only, from a clone:

```
claude --plugin-dir /path/to/claude-clip-command
```

To load a clone in every session, place this folder inside a directory listed in the `CLAUDE_CODE_PLUGIN_DIRS` environment variable. That variable worked in 2.1.288 but does not appear in `claude --help`, so treat it as subject to change.

## How it works

At the end of each turn the plugin looks for the first fenced code block whose body starts with `! ` (the same prefix as Claude Code's shell mode). If there is none, it takes the first block that is a single-line slash command such as `/rename my-session`.

- It copies the text to the clipboard.
- If the prompt input is empty, it also places the text there as a draft. Text you are typing is never overwritten.
- A toast tells you which of the two happened.

Blocks with a non-shell language tag (for example `diff`), multi-line slash blocks, and paths such as `/tmp/x` are ignored.

To make this useful, tell the model (for example in `CLAUDE.md`) to write commands that the user must run in a code block starting with `! `.

### Running the placed command

Text placed by `prompt.fill` is plain text; Claude Code does not switch to shell mode for it. So the plugin runs it itself:

- **Only when** the submitted text is exactly the `! ` command the plugin placed in the input, **and** the submit came from the user pressing Enter in the prompt input.
- It runs `$SHELL -lc "<command without the leading ! >"` in the session's working directory, with a 10-minute timeout.
- The submitted text is replaced with the result (`[MOD clip-command] ran: $ …`, exit code, seconds, stdout, stderr), so the model reads the output.
- The same text is never run twice. Anything you paste or type yourself, slash commands, and submits from other sources go through unchanged.

**Security note:** the command text is written by the model. The plugin never runs anything on its own; it runs the command only after you see it in the input and press Enter. Read the command before pressing Enter, the same as you would before pasting a command into a terminal. If you do not want this behaviour, do not install this plugin, or clear the input instead of pressing Enter.

## What the plugin reads, writes, runs, and submits

This section lists everything the plugin touches, for review. Nothing leaves the machine, and the plugin never calls the model.

**What it reads:** the text of the reply that just finished (`turn.complete`), to find a code block starting with `! `; the current text of the prompt input, to check that it is empty; the text of a submitted prompt and where the submit came from; and the environment variable `SHELL`.

**What it writes:** the found command to the system clipboard (through Claude Code's `$.ui.copy`), and the same command into the prompt input, only when the input is empty (`$.prompt.fill`). Both are visible to you before anything else happens.

**What it runs:** `$SHELL -lc "<the command without the leading ! >"` in the session's working directory, with a 10-minute timeout. This happens only when the submitted text is exactly the command the plugin placed in the input and the submit came from you pressing Enter in the prompt input. The same text is never run twice. The command text comes from the model's reply, so read it before pressing Enter.

**What it submits:** when it runs a command, it replaces the text you submitted with the result, so the model reads the output instead of the command. The replacement is: a heading `[MOD clip-command] ran: $ <command>`, the exit code, seconds, and working directory, then stdout and stderr in fenced blocks (each truncated at 4 MiB). Nothing else is ever submitted or added to a prompt.

## Tests

```
claude plugin validate .
claude plugin test .
```

## Notes

- Written with AI assistance (Claude Code).
- This plugin comes from the author's own setup. The source comments and test names are in Japanese.
- Companion plugin: [claude-ask-choice](https://github.com/i-noma-ru/claude-ask-choice). The two are independent.

## License

MIT. See [LICENSE](LICENSE).
