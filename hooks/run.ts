export type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
  isStdoutTruncated: boolean
  isStderrTruncated: boolean
}

/**
 * 実行結果を、利用者が「! 」モードで実行したときと同じ読み方ができる 1 つの文にする。
 * モデルはこれを利用者の送信として読む。見出しは、利用者の発言と見分けがつくように印つきの英語（2026-10-04）。
 */
export function formatRun(command: string, ran: RunResult, seconds: number, cwd: string): string {
  const lines = [`[MOD clip-command] ran: $ ${command}`, `exit ${ran.exitCode} · ${seconds}s · cwd ${cwd}`]

  const out = ran.stdout.replace(/\s+$/, '')
  const err = ran.stderr.replace(/\s+$/, '')

  lines.push('```stdout', out === '' ? '(no output)' : out, '```')

  if (ran.isStdoutTruncated) {
    lines.push('⚠️ stdout truncated at 4 MiB')
  }

  if (err !== '') {
    lines.push('```stderr', err, '```')
  }

  if (ran.isStderrTruncated) {
    lines.push('⚠️ stderr truncated at 4 MiB')
  }

  return lines.join('\n')
}
