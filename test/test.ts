import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path/posix";

const expectedOutputPattern = /\/\/ expect: ?(.*)/;
const expectedErrorPattern = /\/\/ (Error.*)/;
const errorLinePattern = /\/\/ \[((java|c) )?line (\d+)\] (Error.*)/;
const expectedRuntimeErrorPattern = /\/\/ expect runtime error: (.+)/;
const syntaxErrorPattern = /\[.*line (\d+)\] (Error.+)/;
const stackTracePattern = /\[line (\d+)\]/;
const nonTestPattern = /\/\/ nontest/;

type TestSpec = {
  readonly path: string;
  readonly expectedOutput: ExpectedOutput[];
  readonly expectedErrors: Map<string, void>;
  readonly expectedRuntimeError: string | undefined;
  readonly runtimeErrorLine: number | undefined;
  readonly expectedExitCode: number;
  readonly expectations: number;
};

type ExpectedOutput = {
  readonly line: number;
  readonly output: string;
};

type Stats = {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly expectations: number;
};

const exclude = [
  "expressions/",
  "scanning/",
  "limit/loop_too_large.lox",
  "limit/no_reuse_constants.lox",
  "limit/too_many_constants.lox",
  "limit/too_many_locals.lox",
  "limit/too_many_upvalues.lox",
  "limit/stack_overflow.lox",
];

function parse(filePath: string): TestSpec | undefined {
  // TODO: filtering/"state"

  const expectedOutput: ExpectedOutput[] = [];
  const expectedErrors: Map<string, void> = new Map();
  let expectedRuntimeError: string | undefined = undefined;
  let runtimeErrorLine: number | undefined = undefined;
  let expectedExitCode = 0;
  let expectations = 0;

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    if (nonTestPattern.test(line)) {
      return undefined;
    }

    {
      const match = line.match(expectedOutputPattern);
      if (match) {
        expectedOutput.push({ line: lineNum, output: match[1] });
        expectations++;
        continue;
      }
    }

    {
      const match = line.match(expectedErrorPattern);
      if (match) {
        expectedErrors.set(`[${lineNum}] ${match[1]}`);
        expectedExitCode = 65;
        expectations++;
        continue;
      }
    }

    {
      const match = line.match(errorLinePattern);
      if (match) {
        const language = match[2];
        if (!language || language === "java") {
          expectedErrors.set(`[${match[3]}] ${match[4]}`);
          expectedExitCode = 65;
          expectations++;
        }
        continue;
      }
    }

    {
      const match = line.match(expectedRuntimeErrorPattern);
      if (match) {
        runtimeErrorLine = lineNum;
        expectedRuntimeError = match[1];
        expectedExitCode = 70;
        expectations++;
      }
    }
  }
  if (expectedErrors.size > 0 && expectedRuntimeError !== undefined) {
    console.log(`TEST ERROR ${filePath}`);
    console.log("     Cannot expect both compile and runtime errors.");
    console.log("");
    return undefined;
  }

  return {
    path: filePath,
    expectedOutput: expectedOutput,
    expectedErrors: expectedErrors,
    expectedRuntimeError: expectedRuntimeError,
    runtimeErrorLine: runtimeErrorLine,
    expectedExitCode: expectedExitCode,
    expectations: expectations,
  };
}

function run(spec: TestSpec): string[] {
  const failures: string[] = [];
  const result = spawnSync("node", ["dist/src/main.js", spec.path]);

  const outputLines = result.stdout.toString().split(/\r?\n/);
  const errorLines = result.stderr.toString().split(/\r?\n/);

  if (spec.expectedRuntimeError !== undefined) {
    failures.push(...validateRuntimeError(spec, errorLines));
  } else {
    failures.push(...validateCompileErrors(spec, errorLines));
  }
  failures.push(...validateExitCode(spec, result.status, errorLines));
  failures.push(...validateOutput(spec, outputLines));
  return failures;
}

function validateRuntimeError(spec: TestSpec, errorLines: string[]): string[] {
  const failures: string[] = [];

  if (errorLines.length < 2) {
    failures.push(
      `Expected runtime error ${
        spec.expectedRuntimeError as string
      } and got none.`
    );
  }

  if (errorLines[0] !== spec.expectedRuntimeError) {
    failures.push(
      `Expected runtime error ${spec.expectedRuntimeError as string} and got:`,
      errorLines[0]
    );
  }

  let match: RegExpMatchArray | null = null;
  const stackLines = errorLines.slice(1);
  for (const line of stackLines) {
    match = line.match(stackTracePattern);
    if (match) {
      break;
    }
  }
  if (!match) {
    failures.push("Expected stack trace and got:", ...stackLines);
  } else {
    const stackLine = parseInt(match[1]);
    if (stackLine !== spec.runtimeErrorLine) {
      failures.push(
        `Expected runtime error on line ${
          spec.runtimeErrorLine as number
        } but was on line ${stackLine}.`
      );
    }
  }

  return failures;
}

function validateCompileErrors(spec: TestSpec, errorLines: string[]): string[] {
  const failures: string[] = [];

  const foundErrors: Map<string, void> = new Map();
  let unexpectedCount = 0;

  for (const line of errorLines) {
    const match = line.match(syntaxErrorPattern);
    if (match) {
      const error = `[${match[1]}] ${match[2]}`;
      if (spec.expectedErrors.has(error)) {
        foundErrors.set(error);
      } else {
        if (unexpectedCount < 10) {
          failures.push("Unexpected error:");
          failures.push(line);
        }
        unexpectedCount++;
      }
    }
  }

  if (unexpectedCount > 10) {
    failures.push(`(truncated ${unexpectedCount - 10} more...)`);
  }

  for (const error in spec.expectedErrors) {
    if (!foundErrors.has(error)) {
      failures.push(`Missing expected error: ${error}`);
    }
  }

  return failures;
}

function validateExitCode(
  spec: TestSpec,
  exitCode: number | null,
  errorLines: string[]
): string[] {
  const failures: string[] = [];

  if (exitCode === spec.expectedExitCode) {
    return failures;
  }

  if (errorLines.length > 10) {
    errorLines = errorLines.slice(0, 10);
    errorLines.push("(truncated...)");
  }
  failures.push(
    `Expected return code ${spec.expectedExitCode} and got ${
      exitCode as number
    }. Stderr:`,
    ...errorLines
  );
  return failures;
}

function validateOutput(spec: TestSpec, outputLines: string[]) {
  const failures: string[] = [];
  if (outputLines.length > 0 && outputLines[outputLines.length - 1] == "") {
    outputLines = outputLines.slice(0, -1);
  }

  let index = 0;
  for (; index < outputLines.length; index++) {
    const line = outputLines[index];
    if (index >= spec.expectedOutput.length) {
      failures.push(`Got output '${line}' when none was expected.`);
      continue;
    }

    const expected = spec.expectedOutput[index];
    if (expected.output !== line) {
      failures.push(
        `Expected output '${expected.output}' on line ${expected.line} and got '${line}'.`
      );
    }
  }

  while (index < spec.expectedOutput.length) {
    const expected = spec.expectedOutput[index];
    failures.push(
      `Missing expected output '${expected.output}' on line ${expected.line}.`
    );
    index++;
  }

  return failures;
}

function runTest(filePath: string): Stats {
  if (filePath.includes("benchmark")) {
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      expectations: 0,
    };
  }

  filePath = path.normalize(filePath);

  const skipped: boolean = (() => {
    for (const pattern of exclude) {
      if (filePath.includes(pattern)) {
        return true;
      }
    }
    return false;
  })();
  const spec = parse(filePath);
  if (!spec || skipped) {
    return {
      passed: 0,
      failed: 0,
      skipped: 1,
      expectations: 0,
    };
  }

  const failures = run(spec);

  if (failures.length === 0) {
    return {
      passed: 1,
      failed: 0,
      skipped: 0,
      expectations: spec.expectations,
    };
  } else {
    console.log(`FAIL ${filePath}`);
    console.log("");
    for (const failure of failures) {
      console.log(`     ${failure}`);
    }
    console.log("");
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      expectations: spec.expectations,
    };
  }
}

function runAllTests() {
  const paths = getFiles("./test/scripts").filter((f) => f.endsWith(".lox"));
  let allStats: Stats = {
    passed: 0,
    failed: 0,
    skipped: 0,
    expectations: 0,
  };

  for (const filePath of paths) {
    const stats = runTest(filePath);
    allStats = {
      passed: allStats.passed + stats.passed,
      failed: allStats.failed + stats.failed,
      skipped: allStats.skipped + stats.skipped,
      expectations: allStats.expectations + stats.expectations,
    };
  }

  if (allStats.failed === 0) {
    console.log(
      `All ${allStats.passed} tests passed ${allStats.expectations} expectations.`
    );
  } else {
    console.log(
      `${allStats.passed} tests passed. ${allStats.failed} tests failed.`
    );
  }
}

function getFiles(p: string): string[] {
  const stat = fs.statSync(p);
  if (stat.isFile()) {
    return [p];
  }

  const result: string[] = [];
  const files = fs.readdirSync(p);
  files.forEach((file) => {
    const fullPath = path.join(p, file);
    const f = fs.statSync(fullPath);
    if (f.isDirectory()) {
      result.push(...getFiles(fullPath));
    } else {
      result.push(fullPath);
    }
  });

  return result;
}

runAllTests();
