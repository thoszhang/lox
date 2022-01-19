import { readFileSync } from "fs";
import * as readline from "node:readline";
import { Scanner } from "./lexer";
import { Parser } from "./parser";
import { Token, Stmt } from "./types";
import { Interpreter, RuntimeError } from "./interpreter";
import { Resolver } from "./resolver";

// TODO: do something about this global.
// probably put all this stuff in one top-level object?
let hadError = false;
let hadRuntimeError = false;

export function runFile(path: string): void {
  const input = readFileSync(path, "utf-8");
  run(input);

  if (hadError) {
    process.exit(65);
  }
  if (hadRuntimeError) {
    process.exit(70);
  }
}

export function runPrompt(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });
  rl.prompt();
  rl.on("line", (line: string) => {
    if (!line) {
      rl.close();
      return;
    }
    run(line);
    hadError = false;
    rl.prompt();
  });
}

function run(source: string): void {
  const scanner = new Scanner(source);
  const tokens: Token[] = scanner.scanTokens();

  if (hadError) {
    return;
  }

  const parser = new Parser(tokens);
  const statements: Stmt[] = parser.parse();

  if (hadError) {
    return;
  }

  const interpreter = new Interpreter();
  const resolver = new Resolver(interpreter);
  resolver.resolveStmts(statements);

  if (hadError) {
    return;
  }

  interpreter.interpret(statements);
}

export function error(line: number, message: string): void;
export function error(token: Token, message: string): void;
export function error(lineOrToken: number | Token, message: string): void {
  if (typeof lineOrToken === "number") {
    report(lineOrToken, "", message);
  } else {
    const token: Token = lineOrToken;
    if (token.type === "eof") {
      report(token.line, " at end", message);
    } else {
      report(token.line, " at '" + token.lexeme + "'", message);
    }
  }
}

export function runtimeError(error: RuntimeError) {
  console.error("%s\n[line %d]", error.message, error.token.line);
  hadRuntimeError = true;
}

function report(line: number, where: string, message: string): void {
  console.error("[line %d] Error%s: %s", line, where, message);
  hadError = true;
}
