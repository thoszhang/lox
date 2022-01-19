import { error } from "./run";
import { Token, TokenType, isKeyword } from "./types";

export class Scanner {
  private readonly source: string;
  private readonly tokens: Token[] = [];
  private start = 0;
  private current = 0;
  private line = 1;

  constructor(source: string) {
    this.source = source;
  }

  scanTokens(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push({
      type: "eof",
      lexeme: "",
      literal: undefined,
      line: this.line,
    });
    return this.tokens;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private scanToken(): void {
    const c: string = this.advance();
    switch (c) {
      case "(":
        this.addToken("left_paren");
        break;
      case ")":
        this.addToken("right_paren");
        break;
      case "{":
        this.addToken("left_brace");
        break;
      case "}":
        this.addToken("right_brace");
        break;
      case ",":
        this.addToken("comma");
        break;
      case ".":
        this.addToken("dot");
        break;
      case "-":
        this.addToken("minus");
        break;
      case "+":
        this.addToken("plus");
        break;
      case ";":
        this.addToken("semicolon");
        break;
      case "*":
        this.addToken("star");
        break;
      case "!":
        this.addToken(this.match("=") ? "bang_equal" : "bang");
        break;
      case "=":
        this.addToken(this.match("=") ? "equal_equal" : "equal");
        break;
      case "<":
        this.addToken(this.match("=") ? "less_equal" : "less");
        break;
      case ">":
        this.addToken(this.match("=") ? "greater_equal" : "greater");
        break;
      case "/":
        if (this.match("/")) {
          while (this.peek() !== "\n" && !this.isAtEnd()) {
            this.advance();
          }
        } else {
          this.addToken("slash");
        }
        break;
      case " ":
      case "\r":
      case "\t":
        // Ignore whitespace.
        break;
      case "\n":
        this.line++;
        break;
      case '"':
        this.string();
        break;
      default:
        if (this.isDigit(c)) {
          this.number();
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else {
          error(this.line, "Unexpected character.");
        }
        break;
    }
  }

  private isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private isAlpha(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private number(): void {
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance();

      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    this.addToken(
      "number",
      Number.parseFloat(this.source.substring(this.start, this.current))
    );
  }

  private identifier(): void {
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }
    const text: string = this.source.substring(this.start, this.current);
    let type: TokenType;
    if (isKeyword(text)) {
      type = text;
    } else {
      type = "identifier";
    }
    this.addToken(type);
  }

  private string(): void {
    while (this.peek() !== '"' && !this.isAtEnd()) {
      if (this.peek() === "\n") {
        this.line++;
      }
      this.advance();
    }

    if (this.isAtEnd()) {
      error(this.line, "Unterminated string.");
      return;
    }

    this.advance();

    const value: string = this.source.substring(
      this.start + 1,
      this.current - 1
    );
    this.addToken("string", value);
  }

  private advance(): string {
    return this.source.charAt(this.current++);
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    if (this.source.charAt(this.current) !== expected) {
      return false;
    }
    this.current++;
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) {
      return "\0";
    }
    return this.source.charAt(this.current);
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) {
      return "\0";
    }
    return this.source.charAt(this.current + 1);
  }

  private addToken(
    type: TokenType,
    literal: string | number | undefined = undefined
  ): void {
    const text = this.source.substring(this.start, this.current);
    this.tokens.push({
      type: type,
      lexeme: text,
      literal: literal,
      line: this.line,
    });
  }
}
