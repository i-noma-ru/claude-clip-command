const SHELL_LANGS = ['bash', 'sh', 'zsh', 'shell', 'console', 'text']

/**
 * 中身が「! 」で始まる最初のコードブロックの中身を返す。
 * それが無ければ、1 行のスラッシュコマンド（/rename … など）の最初のブロックを返す。どちらも無ければ ''。
 */
export function findUserCommand(text: string): string {
  let slash = ''

  for (const block of text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)) {
    // 待機表示は ```diff の中に「! 【〜待ち…】」と書く決まりなので、シェル以外の言語指定は対象外にする
    const lang = (block[1] ?? '').trim().toLowerCase()

    if (lang && !SHELL_LANGS.includes(lang)) {
      continue
    }

    const body = (block[2] ?? '').replace(/\s+$/, '')

    if (/^! \S/.test(body) && !body.startsWith('! 【')) {
      return body
    }

    // /Users/… のようなパスは「/」のあとに 2 つ目の「/」が続くので、コマンド名の形だけを通す
    if (slash === '' && !body.includes('\n') && /^\/[a-z][a-z0-9-]*(\s|$)/.test(body)) {
      slash = body
    }
  }

  return slash
}
