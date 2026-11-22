import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deleteFileAt, editFileAt, parseContent, parseEdit, writeFileAt } from './file-edits.js'

const APP_SOURCE = [
  'import express from "express"',
  '',
  'const app = express()',
  '',
  'app.get("/", (req, res) => res.send("hello"))',
  'app.get("/health", (req, res) => res.send("ok"))',
  '',
  'app.listen(3000)',
  '',
].join('\n')

let base
let worktree

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'soporti-file-edits-'))
  worktree = join(base, 'worktree')
  await mkdir(join(worktree, 'src'), { recursive: true })
  await writeFile(join(worktree, 'src', 'app.js'), APP_SOURCE)
  await writeFile(join(base, 'outside.txt'), 'untouched\n')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('parseEdit', () => {
  it('returns the edit with replaceAll defaulting to false', () => {
    expect(parseEdit({ oldText: 'a', newText: 'b' })).toEqual({ oldText: 'a', newText: 'b', replaceAll: false })
    expect(parseEdit({ oldText: 'a', newText: '', replaceAll: true })).toEqual({
      oldText: 'a',
      newText: '',
      replaceAll: true,
    })
  })

  it.each([
    { kind: 'an empty oldText', edit: { oldText: '', newText: 'b' }, message: 'oldText must be the exact, non-empty' },
    { kind: 'a missing oldText', edit: { newText: 'b' }, message: 'oldText must be the exact, non-empty' },
    { kind: 'a missing newText', edit: { oldText: 'a' }, message: 'newText must be a string' },
    { kind: 'an edit that changes nothing', edit: { oldText: 'a', newText: 'a' }, message: 'identical' },
    { kind: 'no edit at all', edit: undefined, message: 'oldText must be the exact, non-empty' },
  ])('refuses $kind', ({ edit, message }) => {
    expect(() => parseEdit(edit)).toThrow(message)
  })
})

describe('parseContent', () => {
  it('accepts a string, even an empty one', () => {
    expect(parseContent('')).toBe('')
  })

  it('refuses anything that is not a string', () => {
    expect(() => parseContent({ text: 'x' })).toThrow('content must be the full text of the file.')
  })
})

describe('editFileAt', () => {
  it('replaces a unique snippet and previews the numbered lines around it', async () => {
    const result = await editFileAt(worktree, 'src/app.js', {
      oldText: 'res.send("ok")',
      newText: 'res.json({ status: "ok" })',
      replaceAll: false,
    })

    expect(result).toEqual({
      path: 'src/app.js',
      replacements: 1,
      preview: [
        '3\tconst app = express()',
        '4\t',
        '5\tapp.get("/", (req, res) => res.send("hello"))',
        '6\tapp.get("/health", (req, res) => res.json({ status: "ok" }))',
        '7\t',
        '8\tapp.listen(3000)',
        '9\t',
      ].join('\n'),
    })
    expect(await readFile(join(worktree, 'src', 'app.js'), 'utf8')).toBe(
      APP_SOURCE.replace('res.send("ok")', 'res.json({ status: "ok" })')
    )
  })

  it('keeps dollar signs in the new text literally', async () => {
    await editFileAt(worktree, 'src/app.js', { oldText: '3000', newText: "$& + '$1'", replaceAll: false })

    expect(await readFile(join(worktree, 'src', 'app.js'), 'utf8')).toContain("app.listen($& + '$1')")
  })

  it('caps the preview of a long replacement', async () => {
    const block = Array.from({ length: 50 }, (_, index) => `// line ${index}`).join('\n')

    const { preview } = await editFileAt(worktree, 'src/app.js', { oldText: 'app.listen(3000)', newText: block })

    expect(preview.split('\n')).toHaveLength(30)
    expect(preview.split('\n')[0]).toBe('5\tapp.get("/", (req, res) => res.send("hello"))')
  })

  it('replaces every occurrence when replaceAll is set', async () => {
    const result = await editFileAt(worktree, 'src/app.js', {
      oldText: 'app.get',
      newText: 'app.post',
      replaceAll: true,
    })

    const content = await readFile(join(worktree, 'src', 'app.js'), 'utf8')
    expect(result.replacements).toBe(2)
    expect(content).not.toContain('app.get')
    expect(content.match(/app\.post/g)).toHaveLength(2)
  })

  it('asks for more context when the snippet is not unique', async () => {
    const failure = await editFileAt(worktree, 'src/app.js', {
      oldText: 'app.get',
      newText: 'app.post',
      replaceAll: false,
    }).catch(err => err)

    expect(failure.message).toBe(
      'oldText appears 2 times in "src/app.js". Include more surrounding lines to make it unique, or set replaceAll to replace every occurrence.'
    )
    expect(await readFile(join(worktree, 'src', 'app.js'), 'utf8')).toBe(APP_SOURCE)
  })

  it('asks to re-read the file when the snippet is not there', async () => {
    const failure = await editFileAt(worktree, 'src/app.js', {
      oldText: 'app.listen(8080)',
      newText: 'app.listen(3000)',
      replaceAll: false,
    }).catch(err => err)

    expect(failure.message).toBe(
      'oldText was not found in "src/app.js". Re-read the file and copy the exact text, whitespace included.'
    )
  })

  it('refuses a missing file', async () => {
    await expect(editFileAt(worktree, 'src/missing.js', { oldText: 'a', newText: 'b' })).rejects.toThrow(
      '"src/missing.js" does not exist in this repository. Find it with search_code or find_files.'
    )
  })

  it('refuses a folder', async () => {
    await expect(editFileAt(worktree, 'src', { oldText: 'a', newText: 'b' })).rejects.toThrow(
      '"src" is not a regular file.'
    )
  })

  it('refuses a binary file', async () => {
    await writeFile(join(worktree, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x47]))

    await expect(editFileAt(worktree, 'logo.png', { oldText: 'P', newText: 'Q' })).rejects.toThrow(
      '"logo.png" looks like a binary file'
    )
  })
})

describe('writeFileAt', () => {
  it('creates a new file and its parent folders', async () => {
    const result = await writeFileAt(worktree, 'src/routes/health.js', 'export default {}\n')

    expect(result).toEqual({ path: 'src/routes/health.js', created: true })
    expect(await readFile(join(worktree, 'src', 'routes', 'health.js'), 'utf8')).toBe('export default {}\n')
  })

  it('overwrites an existing file', async () => {
    const result = await writeFileAt(worktree, 'src/app.js', 'replaced\n')

    expect(result).toEqual({ path: 'src/app.js', created: false })
    expect(await readFile(join(worktree, 'src', 'app.js'), 'utf8')).toBe('replaced\n')
  })

  it('keeps the mode of an existing executable file', async () => {
    await writeFile(join(worktree, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 })

    await writeFileAt(worktree, 'run.sh', '#!/bin/sh\necho hi\n')

    expect((await stat(join(worktree, 'run.sh'))).mode & 0o777).toBe(0o755)
  })

  it('refuses to overwrite a folder', async () => {
    await expect(writeFileAt(worktree, 'src', 'x')).rejects.toThrow('"src" is not a regular file.')
  })

  it('never writes through a symbolic link', async () => {
    await symlink(join(base, 'outside.txt'), join(worktree, 'notes.txt'))

    await expect(writeFileAt(worktree, 'notes.txt', 'pwned\n')).rejects.toThrow('"notes.txt" is a symbolic link')
    expect(await readFile(join(base, 'outside.txt'), 'utf8')).toBe('untouched\n')
  })
})

describe('deleteFileAt', () => {
  it('deletes an existing file', async () => {
    const result = await deleteFileAt(worktree, 'src/app.js')

    expect(result).toEqual({ path: 'src/app.js' })
    await expect(stat(join(worktree, 'src', 'app.js'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses a missing file', async () => {
    await expect(deleteFileAt(worktree, 'src/gone.js')).rejects.toThrow(
      '"src/gone.js" does not exist in this repository'
    )
  })

  it('refuses a folder', async () => {
    await expect(deleteFileAt(worktree, 'src')).rejects.toThrow('"src" is not a regular file.')
    expect((await stat(join(worktree, 'src'))).isDirectory()).toBe(true)
  })

  it('refuses a symbolic link', async () => {
    await symlink(join(base, 'outside.txt'), join(worktree, 'notes.txt'))

    await expect(deleteFileAt(worktree, 'notes.txt')).rejects.toThrow('"notes.txt" is a symbolic link')
    expect(await readFile(join(base, 'outside.txt'), 'utf8')).toBe('untouched\n')
  })
})
