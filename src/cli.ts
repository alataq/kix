#!/usr/bin/env bun
import { asKixError } from "./compiler/errors";
import {
  CliError,
  writeJson,
} from "./cli/args";
import {
  COMMAND_NAMES,
  commandBuild,
  commandCheck,
  commandClean,
  commandDoctor,
  commandHelp,
  commandInfo,
  commandInit,
  commandNew,
  commandRun,
  commandTargets,
  commandUsage,
  commandVersion,
  compilerVersion,
  globalUsage,
} from "./cli/commands";

const VERSION = compilerVersion();

function wantsJson(argv: string[]): boolean {
  return argv.includes("--json");
}

function printError(error: unknown, argv: string[]): number {
  if (error instanceof CliError) {
    if (wantsJson(argv)) {
      process.stderr.write(`${JSON.stringify({ error: error.message, hint: error.hint ?? null })}\n`);
    } else {
      process.stderr.write(`error: ${error.message}\n`);
      if (error.hint) process.stderr.write(`hint: ${error.hint}\n`);
    }
    return error.exitCode;
  }

  const kixError = asKixError(error);
  if (wantsJson(argv)) {
    process.stderr.write(`${JSON.stringify({ error: kixError.message, hint: kixError.hint ?? null })}\n`);
  } else {
    process.stderr.write(`${kixError.format()}\n`);
  }
  return 1;
}

function main(argv: string[]): number {
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(globalUsage());
    return 0;
  }

  if (
    command === "version" ||
    command === "--version" ||
    command === "-v"
  ) {
    return commandVersion(args);
  }

  if (command === "help") {
    const result = commandHelp(args);
    if (result < 0) {
      process.stdout.write(globalUsage());
      return 0;
    }
    return result;
  }

  if (!(COMMAND_NAMES as readonly string[]).includes(command)) {
    throw new CliError(`unknown command '${command}'`, 2, "run `kixt help` for available commands");
  }

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(commandUsage(command));
    return 0;
  }

  switch (command) {
    case "build": return commandBuild(args);
    case "run": return commandRun(args);
    case "check": return commandCheck(args);
    case "new": return commandNew(args);
    case "init": return commandInit(args);
    case "clean": return commandClean(args);
    case "doctor": return commandDoctor(args);
    case "info": return commandInfo(args);
    case "targets": return commandTargets(args);
    case "version": return commandVersion(args);
    default:
      throw new CliError(`unknown command '${command}'`, 2);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.exitCode = printError(error, process.argv.slice(2));
}
