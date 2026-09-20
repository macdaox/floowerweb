export function selectD1Target(args: string[]): "--local" | "--remote" {
  const local = args.includes("--local");
  const remote = args.includes("--remote");
  if (local && remote) throw new Error("Choose only one database target: --local or --remote.");
  return remote ? "--remote" : "--local";
}

export function d1TargetArguments(args: string[]): string[] {
  const result: string[] = [selectD1Target(args)];
  const environmentIndex = args.indexOf("--env");
  if (environmentIndex !== -1) {
    const environment = args[environmentIndex + 1];
    if (!environment || environment.startsWith("--")) throw new Error("--env requires a value.");
    result.push("--env", environment);
  }
  return result;
}
