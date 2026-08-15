// The package's invariant companion reserves its name and installs nothing.
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, inject, name } from '../src/invariant.ts'

describe('omdsh-justchat invariant companion', () => {
  it('reserves the package under the invariant service', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Context

    expect(name).toBe('omdsh-justchat-invariant')
    expect(inject).toEqual(['invariants'])
    await expect(apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@omdsh-plugins/omdsh-justchat', expect.any(Function))

    // The installer is deliberately empty: the host half's setups are
    // asserted directly, and the browser half owns no cross-plugin state.
    const [[, install]] = register.mock.calls as unknown as [[string, (ctx: Context) => void]]
    expect(install({} as Context)).toBeUndefined()
  })
})
