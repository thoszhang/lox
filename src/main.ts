import { runFile, runPrompt } from "./run";

const args = process.argv.slice(2);
if (args.length > 1) {
  console.log("Usage: node dist/src/main.js [script]");
  process.exit(64);
} else if (args.length === 1) {
  runFile(args[0]);
} else {
  runPrompt();
}
