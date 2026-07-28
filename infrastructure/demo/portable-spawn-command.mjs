export function resolvePortableSpawnCommand(
  command,
  args,
  {
    platform = process.platform,
    execPath = process.execPath,
    npmExecPath = process.env.npm_execpath,
  } = {},
) {
  if (platform !== "win32" || command !== "pnpm") {
    return { executable: command, args };
  }
  if (!npmExecPath) {
    throw new Error(
      "Cannot find the pnpm entry point. Run this demo command through a pnpm script.",
    );
  }
  return {
    executable: execPath,
    args: [npmExecPath, ...args],
  };
}
