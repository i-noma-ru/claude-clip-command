const SHELL_LANGS = ['bash', 'sh', 'zsh', 'shell', 'console', 'text']

/**
 * 「! 」のあとがコマンドではなく日本語の依頼文か。1 行目（引用符の中を除く）に依頼の語があるか「。」で終わる、
 * または先頭の語（コマンド名の位置）がかな・漢字で始まるときに true。
 * 日本語のパスや引数を含むコマンド（/Users/…/資料フォルダ/x・node 資料フォルダ/…・git commit -m "…お願いします"）は、どちらにも当たらない。
 */
function isRequestText(body: string): boolean {
  const first = body.slice(2).split('\n')[0] ?? ''

  // 引用符の中（commit -m "…お願いします。" など）は引数なので見ない
  const bare = first.replace(/"[^"]*"|'[^']*'/g, '')

  if (/ください|下さい|お願いします|お願いいたします/.test(bare) || /。\s*$/.test(bare)) {
    return true
  }

  const head = first.split(/\s/)[0] ?? ''

  // パス（/Users/…/資料フォルダ/scripts/x・資料フォルダ/scripts/x）で始まるコマンドは「/」を含むので当てない
  return /^[぀-ヿ一-鿿]/.test(head) && !head.includes('/')
}

/**
 * 中身が「! 」で始まる最初のコードブロックの中身を返す（日本語の依頼文のブロックは飛ばす）。
 * それが無ければ、1 行のスラッシュコマンド（/rename … など・「! /doctor」は「! 」を外す）の最初のブロックを返す。どちらも無ければ ''。
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

    // 「! /doctor」のように「! 」の直後がスラッシュコマンドなら、シェルではなくスラッシュコマンドとして扱う（2026-10-29 実発生）
    if (!body.includes('\n') && /^! \/[a-z][a-z0-9-]*(\s|$)/.test(body)) {
      if (slash === '') {
        slash = body.slice(2)
      }

      continue
    }

    if (/^! \S/.test(body) && !body.startsWith('! 【')) {
      // 依頼文は置かない: 置くと Enter でシェルの実行に回る（2026-11-12 実発生）
      if (isRequestText(body)) {
        continue
      }

      return body
    }

    // /Users/… のようなパスは「/」のあとに 2 つ目の「/」が続くので、コマンド名の形だけを通す
    if (slash === '' && !body.includes('\n') && /^\/[a-z][a-z0-9-]*(\s|$)/.test(body)) {
      slash = body
    }
  }

  return slash
}
