import { expect, test } from 'claude-code/testing'

import { findUserCommand } from '../hooks/find'

const ASK = '次を実行してください。\n\n```\n! node scripts/deploy.js --apply\n```\n'

test('「! 」で始まる最初のコードブロックを拾う', () => {
  expect(findUserCommand(ASK)).toBe('! node scripts/deploy.js --apply')
  expect(findUserCommand('```bash\n! ls\n```\n```\n! pwd\n```')).toBe('! ls')
})

test('対象外のブロックは拾わない', () => {
  expect(findUserCommand('```\nnode a.js\n```')).toBe('')
  expect(findUserCommand('```diff\n! 【Codex 待ち…】\n```')).toBe('')
  expect(findUserCommand('```\n! 【待ち】\n```')).toBe('')
  expect(findUserCommand('本文に ! ls と書いただけ')).toBe('')
})

test('「! 」のブロックが無いときは、スラッシュコマンドのブロックを拾う', () => {
  expect(findUserCommand('次を打ってください。\n\n```\n/rename 🌐 my-laptop-project-23\n```\n')).toBe(
    '/rename 🌐 my-laptop-project-23',
  )
  expect(findUserCommand('```\n/remote-control\n```')).toBe('/remote-control')
  // 両方あるときは「! 」が先（並び順によらない）
  expect(findUserCommand('```\n/rename x\n```\n```\n! node a.js\n```')).toBe('! node a.js')
})

test('パスや複数行のブロックはスラッシュコマンドとして拾わない', () => {
  expect(findUserCommand('```\n/Users/me/.claude/scripts/tool.js\n```')).toBe('')
  expect(findUserCommand('```\n/tmp/x\n```')).toBe('')
  expect(findUserCommand('```\n/rename a\n/color\n```')).toBe('')
  expect(findUserCommand('```diff\n/rename a\n```')).toBe('')
  expect(findUserCommand('本文に /rename a と書いただけ')).toBe('')
})

test('同じコマンドが続いたら、入力欄には毎回置き、クリップボードは上書きしない', async ($, on) => {
  const copied: string[] = []
  const filled: string[] = []
  const notices: string[] = []

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.copy', ($, e) => {
    copied.push(e.text)

    return { value: { isCopied: true } }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($, e) => {
    filled.push(`${e.mode}:${e.text}`)

    return { isFilled: true }
  })
  on('ui.toast', ($, e) => {
    notices.push(e.text)

    return { value: undefined }
  })

  const turn = { durationMs: 1, isAborted: false, reason: 'answer' } as const

  await $.turn.complete({ ...turn, answer: ASK, turnId: 't1' })
  await $.turn.complete({ ...turn, answer: ASK, turnId: 't2' })

  expect(copied).toEqual(['! node scripts/deploy.js --apply'])
  expect(filled).toEqual(['replace:! node scripts/deploy.js --apply', 'replace:! node scripts/deploy.js --apply'])
  expect(notices).toEqual([
    '⌨️ 実行するコマンドを入力欄に置きました（Enter で実行）: ! node scripts/deploy.js --apply',
    '⌨️ 実行するコマンドを入力欄に置きました（Enter で実行）: ! node scripts/deploy.js --apply',
  ])
})

test('同じコマンドの 2 回目で入力欄に書きかけがあれば、何も上書きせず知らせもしない', async ($, on) => {
  const copied: string[] = []
  const filled: string[] = []
  const notices: string[] = []
  let box = ''

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.copy', ($, e) => {
    copied.push(e.text)

    return { value: { isCopied: true } }
  })
  on('prompt.read', () => ({ value: { text: box, cursor: 0 } }))
  on('prompt.fill', ($, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  on('ui.toast', ($, e) => {
    notices.push(e.text)

    return { value: undefined }
  })

  const turn = { durationMs: 1, isAborted: false, reason: 'answer' } as const

  await $.turn.complete({ ...turn, answer: ASK, turnId: 't1' })
  box = '書きかけ'
  await $.turn.complete({ ...turn, answer: ASK, turnId: 't2' })

  expect(copied.length).toBe(1)
  expect(filled.length).toBe(1)
  expect(notices.length).toBe(1)
})

test('入力欄に書きかけの文があるときは上書きせず、クリップボードの知らせにする', async ($, on) => {
  const filled: string[] = []
  const notices: string[] = []

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('prompt.read', () => ({ value: { text: '書きかけ', cursor: 4 } }))
  on('prompt.fill', ($, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  on('ui.toast', ($, e) => {
    notices.push(e.text)

    return { value: undefined }
  })

  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })

  expect(filled).toEqual([])
  expect(notices).toEqual([
    '📋 実行するコマンドをクリップボードへ入れました（Cmd+V → Enter）: ! node scripts/deploy.js --apply',
  ])
})

test('入力欄が受け取らなかった（ダイアログ中など）ときもクリップボードの知らせにする', async ($, on) => {
  const notices: string[] = []

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', () => ({ isFilled: false, refusal: 'dialog' as const }))
  on('ui.toast', ($, e) => {
    notices.push(e.text)

    return { value: undefined }
  })

  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })

  expect(notices).toEqual([
    '📋 実行するコマンドをクリップボードへ入れました（Cmd+V → Enter）: ! node scripts/deploy.js --apply',
  ])
})

test('コマンドが無い返答とサブエージェントの返答ではコピーしない', async ($, on) => {
  const copied: string[] = []

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.copy', ($, e) => {
    copied.push(e.text)

    return { value: { isCopied: true } }
  })

  const turn = { durationMs: 1, isAborted: false, reason: 'answer' } as const

  await $.turn.complete({ ...turn, answer: '完了しました。', turnId: 't1' })
  await $.turn.complete({ ...turn, answer: ASK, turnId: 't2', agentId: 'agent-1' })

  expect(copied).toEqual([])
})

test('コピーも入力欄も使えないときは知らせない', async ($, on) => {
  const notices: string[] = []

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.copy', () => ({ value: { isCopied: false, reason: 'no-surface' } }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', () => ({ isFilled: false, refusal: 'no_composer' as const }))
  on('ui.toast', ($, e) => {
    notices.push(e.text)

    return { value: undefined }
  })

  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })

  expect(notices).toEqual([])
})

// ---- 置いたコマンドを Enter で実行する ----

const PLACED = '! node scripts/deploy.js --apply'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stageRun(on: any, ran: string[], sent: string[], filled = true, seen: { copied?: string[]; box?: () => string } = {}) {
  on('turn.complete', ($: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('ui.copy', ($: unknown, e: { text: string }) => {
    seen.copied?.push(e.text)

    return { value: { isCopied: true } }
  })
  on('prompt.read', () => ({ value: { text: seen.box?.() ?? '', cursor: 0 } }))
  on('prompt.fill', () => (filled ? { isFilled: true } : { isFilled: false, refusal: 'dialog' }))
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', () => ({ value: '/bin/zsh' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('clock.now', () => ({ value: 1000 }))
  on('process.run', ($: unknown, e: { argv: string[] }) => {
    ran.push(e.argv.join(' '))

    return { value: { exitCode: 0, stdout: 'applied=7\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.submit', ($: unknown, e: { text: string }) => {
    sent.push(e.text)

    return { text: e.text }
  })
}

test('置いたコマンドそのものが Enter で来たら実行し、結果を送信文にする', async ($, on) => {
  const ran: string[] = []
  const sent: string[] = []

  stageRun(on, ran, sent)

  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })
  await $.prompt.submit({ text: PLACED })

  expect(ran).toEqual(['/bin/zsh -lc node scripts/deploy.js --apply'])
  expect(sent.length).toBe(1)
  expect(sent[0]).toStartWith('[MOD clip-command] ran: $ node scripts/deploy.js --apply\nexit 0 · 0s · cwd /work\n```stdout\napplied=7\n```')
})

test('同じ文の 2 回目・違う文・置いていないときは実行せず、そのまま通す', async ($, on) => {
  const ran: string[] = []
  const sent: string[] = []

  stageRun(on, ran, sent)

  // 置く前
  await $.prompt.submit({ text: PLACED })
  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })
  // 違う文
  await $.prompt.submit({ text: '! ls' })
  await $.prompt.submit({ text: 'ありがとう' })
  // 置いた文（実行）→ 同じ文の 2 回目（通す）
  await $.prompt.submit({ text: PLACED })
  await $.prompt.submit({ text: PLACED })

  expect(ran.length).toBe(1)
  expect(sent).toEqual([PLACED, '! ls', 'ありがとう', sent[3], PLACED])
  expect(sent[3]).toStartWith('[MOD clip-command] ran: ')
})

test('MOD が実行し終えた同じコマンドがまた来たら、置き直して 2 回目も実行できる', async ($, on) => {
  const ran: string[] = []
  const sent: string[] = []
  const copied: string[] = []

  stageRun(on, ran, sent, true, { copied })

  const turn = { durationMs: 1, isAborted: false, reason: 'answer' } as const

  await $.turn.complete({ ...turn, answer: ASK, turnId: 't1' })
  await $.prompt.submit({ text: PLACED })
  await $.turn.complete({ ...turn, answer: ASK, turnId: 't2' })
  await $.prompt.submit({ text: PLACED })

  expect(ran.length).toBe(2)
  // 実行済みなら次は新しい依頼なので、クリップボードにも入れ直す
  expect(copied).toEqual([PLACED, PLACED])
})

test('置いたコマンドが入力欄に残ったまま同じ返答が来ても、Enter で実行できる', async ($, on) => {
  const ran: string[] = []
  const sent: string[] = []
  let box = ''

  stageRun(on, ran, sent, true, { box: () => box })

  const turn = { durationMs: 1, isAborted: false, reason: 'answer' } as const

  await $.turn.complete({ ...turn, answer: ASK, turnId: 't1' })
  box = PLACED
  await $.turn.complete({ ...turn, answer: ASK, turnId: 't2' })
  await $.prompt.submit({ text: PLACED })

  expect(ran.length).toBe(1)
})

test('利用者以外の送信（別セッション・通知）は実行しない', async ($, on) => {
  const ran: string[] = []
  const sent: string[] = []

  stageRun(on, ran, sent)

  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })
  await $.prompt.submit({ text: PLACED, origin: { kind: 'peer', sessionId: 's2' } as never })

  expect(ran).toEqual([])
  expect(sent).toEqual([PLACED])
})

test('シェルを起動できなかったときは文として通す', async ($, on) => {
  const sent: string[] = []
  const notices: string[] = []

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('ui.toast', ($, e) => {
    notices.push(e.text)

    return { value: undefined }
  })
  on('env.get', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('clock.now', () => ({ value: 1000 }))
  on('process.run', () => {
    throw new Error('spawn ENOENT')
  })
  on('prompt.submit', ($, e) => {
    sent.push(e.text)

    return { text: e.text }
  })

  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })
  await $.prompt.submit({ text: PLACED })

  expect(sent).toEqual([PLACED])
  expect(notices[1]).toStartWith('⚠️ 実行できなかったので文として送ります')
})

test('クリップボードだけで置けなかったときは、Enter が来ても実行しない', async ($, on) => {
  const ran: string[] = []
  const sent: string[] = []

  stageRun(on, ran, sent, false)

  await $.turn.complete({ durationMs: 1, isAborted: false, reason: 'answer', answer: ASK, turnId: 't1' })
  await $.prompt.submit({ text: PLACED })

  expect(ran).toEqual([])
  expect(sent).toEqual([PLACED])
})
