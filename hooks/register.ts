import type { Register } from 'claude-code'

import { findUserCommand } from './find'
import { formatRun } from './run'

export const register: Register = on => {
  // クリップボードへ最後に入れたコマンド。同じ文では上書きしない（利用者が別の物をコピーしたあとに壊さないため）。
  // 入力欄はこの決まりの対象外で、空なら毎回置く（書きかけを壊さない守りは「空のときだけ」が担う）。
  // MOD が実行し終えたら消す（実行済みの文がまた来たら、それは新しい依頼）
  let last = ''
  // 入力欄に置いた「! 」コマンド。利用者がそのまま Enter したときだけ MOD が実行する
  let placed = ''
  // 同じターンの途中の返答で最後に見たコマンドと、そのターンの id。
  // Stop フック（番犬）の差し戻しでターンが続くと、ブロックを書いた返答は「最後の返答」でなくなるので、ここで覚えておく
  let stepCommand = ''
  let stepTurn = ''

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    // サブエージェントの返答は利用者への依頼ではない
    if (e.agentId === undefined) {
      if (e.turnId !== stepTurn) {
        stepTurn = e.turnId
        stepCommand = ''
      }

      const found = findUserCommand(result.answer)

      if (found !== '') {
        stepCommand = found
      }
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    // サブエージェントの返答は利用者への依頼ではない
    if (e.agentId !== undefined) {
      return done
    }

    try {
      // 最後の返答を優先し、無ければ同じターンの途中の返答で見たものを使う（別のターンのものは使わない）
      let command = findUserCommand(e.answer)

      if (command === '' && e.turnId === stepTurn) {
        command = stepCommand
      }

      stepCommand = ''
      stepTurn = ''

      if (command !== '') {
        const isCopied = command !== last && (await $.ui.copy({ text: command })).isCopied

        // 入力欄が空のときだけ下書きとして置く（書きかけの文は上書きしない）
        let filled = false

        try {
          const box = await $.prompt.read()

          if (box.text.trim() === '') {
            filled = (await $.prompt.fill({ text: command, mode: 'replace' })).isFilled
          }
        } catch {
          // 入力欄の無い環境（-p・ダイアログ中）ではクリップボードだけ
        }

        if (isCopied) {
          last = command
        }

        if (isCopied || filled) {
          // 本体は fill のたびに入力欄を通常モードへ戻すので「! 」は文字のまま。Enter で来たら下の prompt.submit が実行する。
          // 置けなかったときは前に置いた文を消す。ただし同じ文が入力欄に残っているだけなら、そのまま Enter で実行できるように保つ
          if (filled) {
            placed = command.startsWith('! ') ? command : ''
          } else if (command !== placed) {
            placed = ''
          }

          const first = command.split('\n')[0] ?? ''
          const shown = first.length > 60 ? `${first.slice(0, 60)}…` : first

          // 利用者にだけ知らせる（モデルは読まない）
          const notice = filled
            ? `⌨️ 実行するコマンドを入力欄に置きました（Enter で実行）: ${shown}`
            : `📋 実行するコマンドをクリップボードへ入れました（Cmd+V → Enter）: ${shown}`

          $.ui.toast(notice, { timeoutMs: 8000 })
        }
      }
    } catch {
      // コピーの故障で返答を止めない
    }

    return done
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    // 置いた文と完全一致し、利用者自身の Enter（origin 無し＝利用者・composer）のときだけ
    const isUser = e.origin === undefined || e.origin.kind === 'composer'

    if (placed === '' || text !== placed || !isUser) {
      return next(e)
    }

    // 同じ文を二度は実行しない。実行済みなので、次に同じ文が来たらクリップボードにも入れ直す
    placed = ''
    last = ''

    const command = text.slice(2)

    try {
      const shell = (await $.env.get('SHELL')) ?? '/bin/zsh'
      const cwd = await $.session.cwd()
      const started = await $.clock.now()
      const ran = await $.process.run([shell, '-lc', command], { cwd, timeoutMs: 600_000 })
      const seconds = Math.round((await $.clock.now()) - started) / 1000

      $.ui.toast(`⌨️ 実行しました（終了コード ${ran.exitCode}・${seconds} 秒）`, { timeoutMs: 8000 })

      return next({ ...e, text: formatRun(command, ran, seconds, cwd) })
    } catch (error) {
      // シェルが無い（Windows など）・起動に失敗したときは、そのまま文として通す
      $.ui.toast(`⚠️ 実行できなかったので文として送ります: ${error instanceof Error ? error.message : String(error)}`, {
        timeoutMs: 8000,
      })

      return next(e)
    }
  })
}
