# AGENTS.md

## Shell and Node Toolchain

- Use `PowerShell` for shell commands in this workspace.
- `Node.js` is managed by `fnm`.
- `pnpm` is installed independently, but Node-related commands should still run only after `fnm` has been applied in the current shell.

## Required Command Pattern

- Do not rely on the PowerShell profile for `fnm` initialization in Codex.
- In this environment, loading the profile may fail because `fnm env --use-on-cd` tries to create entries under `%LOCALAPPDATA%\fnm_multishells`, which can be blocked in sandboxed sessions.
- For any command that needs `node`, `npm`, `npx`, `pnpm`, `pnpm exec`, `next`, or other Node-based CLIs:
  - Run the shell with `login: false`.
  - Apply `fnm` manually in the same command before running the real command.

Use this PowerShell prefix:

```powershell
& ([ScriptBlock]::Create((fnm env --shell powershell --use-on-cd | Out-String)))
```

Then run the target command in the same shell process, for example:

```powershell
& ([ScriptBlock]::Create((fnm env --shell powershell --use-on-cd | Out-String))); node -v
& ([ScriptBlock]::Create((fnm env --shell powershell --use-on-cd | Out-String))); pnpm -v
& ([ScriptBlock]::Create((fnm env --shell powershell --use-on-cd | Out-String))); pnpm install
& ([ScriptBlock]::Create((fnm env --shell powershell --use-on-cd | Out-String))); pnpm exec node -v
```