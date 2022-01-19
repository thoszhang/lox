import {
  BinaryToken,
  Expr,
  FunctionStmt,
  LogicalToken,
  Stmt,
  Token,
  TokenType,
  UnaryToken,
  Variable,
} from "./types";
import { error } from "./run";

class ParseError extends Error {
  constructor() {
    super();
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export class Parser {
  private readonly tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.isAtEnd()) {
      const declaration: Stmt | null = this.declaration();
      // TODO: is this right?
      if (declaration !== null) {
        statements.push(declaration);
      }
    }
    return statements;
  }

  private declaration(): Stmt | null {
    try {
      if (this.match("class")) {
        return this.classDeclaration();
      }
      if (this.match("fun")) {
        return this.funcDeclaration("function");
      }
      if (this.match("var")) {
        return this.varDeclaration();
      }
      return this.statement();
    } catch (e) {
      if (e instanceof ParseError) {
        this.synchronize();
        return null;
      }
      throw e;
    }
  }

  private classDeclaration(): Stmt {
    const name = this.consume("identifier", "Expect class name.");

    let superclass: Variable | null = null;
    if (this.match("less")) {
      this.consume("identifier", "Expect superclass name.");
      superclass = { type: "variable", name: this.previous() };
    }

    this.consume("left_brace", "Expect '{' before class body.");

    const methods: FunctionStmt[] = [];
    while (!this.check("right_brace") && !this.isAtEnd()) {
      methods.push(this.funcDeclaration("method"));
    }

    this.consume("right_brace", "Expect '}' after class body.");

    return {
      type: "class",
      name: name,
      superclass: superclass,
      methods: methods,
    };
  }

  private funcDeclaration(kind: "function" | "method"): FunctionStmt {
    const name: Token = this.consume("identifier", `Expect ${kind} name.`);

    this.consume("left_paren", `Expect '(' after ${kind} name.`);
    const params: Token[] = [];
    if (!this.check("right_paren")) {
      do {
        if (params.length >= 255) {
          this.error(this.peek(), "Can't have more than 255 parameters.");
        }
        params.push(this.consume("identifier", "Expect parameter name."));
      } while (this.match("comma"));
    }
    this.consume("right_paren", "Expect ')' after parameters.");

    this.consume("left_brace", `Expect '{' before ${kind} body.`);
    const body = this.block();

    return {
      type: "function",
      name: name,
      params: params,
      body: body,
    };
  }

  private varDeclaration(): Stmt {
    const name: Token = this.consume("identifier", "Expect variable name.");

    let initializer: Expr | null = null;
    if (this.match("equal")) {
      initializer = this.expression();
    }

    this.consume("semicolon", "Expect ';' after variable declaration.");
    return {
      type: "var",
      name: name,
      initializer: initializer,
    };
  }

  private statement(): Stmt {
    if (this.match("for")) {
      return this.forStatement();
    }
    if (this.match("if")) {
      return this.ifStatement();
    }
    if (this.match("print")) {
      return this.printStatement();
    }
    if (this.match("return")) {
      return this.returnStatement();
    }
    if (this.match("while")) {
      return this.whileStatement();
    }
    if (this.match("left_brace")) {
      return {
        type: "block",
        statements: this.block(),
      };
    }
    return this.expressionStatement();
  }

  private returnStatement(): Stmt {
    const keyword = this.previous();

    let value: Expr | null = null;
    if (!this.check("semicolon")) {
      value = this.expression();
    }

    this.consume("semicolon", "Expect ';' after return value.");
    return {
      type: "return",
      keyword: keyword,
      value: value,
    };
  }

  private block(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.check("right_brace") && !this.isAtEnd()) {
      // TODO: is this right?
      const declaration = this.declaration();
      if (declaration !== null) {
        statements.push(declaration);
      }
    }
    this.consume("right_brace", "Expect '}' after block.");
    return statements;
  }

  private forStatement(): Stmt {
    this.consume("left_paren", "Expect '(' after 'for'.");

    let initializer: Stmt | null;
    if (this.match("semicolon")) {
      initializer = null;
    } else if (this.match("var")) {
      initializer = this.varDeclaration();
    } else {
      initializer = this.expressionStatement();
    }

    let condition: Expr | null = null;
    if (!this.check("semicolon")) {
      condition = this.expression();
    }
    this.consume("semicolon", "Expect ';' after loop condition.");

    let increment: Expr | null = null;
    if (!this.check("right_paren")) {
      increment = this.expression();
    }
    this.consume("right_paren", "Expect ')' after for clauses.");

    let body = this.statement();

    if (increment !== null) {
      body = {
        type: "block",
        statements: [body, { type: "expression", expression: increment }],
      };
    }

    if (condition === null) {
      condition = { type: "literal", value: true };
    }

    body = {
      type: "while",
      condition: condition,
      body: body,
    };

    if (initializer !== null) {
      body = {
        type: "block",
        statements: [initializer, body],
      };
    }

    return body;
  }

  private ifStatement(): Stmt {
    this.consume("left_paren", "Expect '(' after 'if'.");
    const condition: Expr = this.expression();
    this.consume("right_paren", "Expect ')' after if condition.");

    const thenBranch: Stmt = this.statement();
    let elseBranch: Stmt | null = null;
    if (this.match("else")) {
      elseBranch = this.statement();
    }
    return {
      type: "if",
      condition: condition,
      thenBranch: thenBranch,
      elseBranch: elseBranch,
    };
  }

  private whileStatement(): Stmt {
    this.consume("left_paren", "Expect '(' after 'while'.");
    const condition = this.expression();
    this.consume("right_paren", "Expect ')' after condition.");
    const body = this.statement();

    return {
      type: "while",
      condition: condition,
      body: body,
    };
  }

  private printStatement(): Stmt {
    const value: Expr = this.expression();
    this.consume("semicolon", "Expect ';' after value.");
    return { type: "print", expression: value };
  }

  private expressionStatement(): Stmt {
    const expr: Expr = this.expression();
    this.consume("semicolon", "Expect ';' after expression.");
    return { type: "expression", expression: expr };
  }

  private expression(): Expr {
    return this.assignment();
  }

  private assignment(): Expr {
    const expr: Expr = this.or();

    if (this.match("equal")) {
      const equals: Token = this.previous();
      const value: Expr = this.assignment();

      if (expr.type === "variable") {
        return { type: "assignment", name: expr.name, value: value };
      } else if (expr.type == "get") {
        return {
          type: "set",
          object: expr.object,
          name: expr.name,
          value: value,
        };
      }
      error(equals, "Invalid assignment target.");
    }

    return expr;
  }

  private or(): Expr {
    let expr = this.and();
    while (this.match("or")) {
      const operator = this.previous() as LogicalToken;
      const right = this.and();
      expr = {
        type: "logical",
        left: expr,
        operator: operator,
        right: right,
      };
    }
    return expr;
  }

  private and(): Expr {
    let expr = this.equality();
    while (this.match("and")) {
      const operator = this.previous() as LogicalToken;
      const right = this.equality();
      expr = {
        type: "logical",
        left: expr,
        operator: operator,
        right: right,
      };
    }
    return expr;
  }

  private equality(): Expr {
    let expr: Expr = this.comparison();

    while (this.match("bang_equal", "equal_equal")) {
      const operator = this.previous() as BinaryToken;
      const right = this.comparison();
      expr = {
        type: "binary",
        left: expr,
        operator: operator,
        right: right,
      };
    }
    return expr;
  }

  private comparison(): Expr {
    let expr: Expr = this.term();

    while (this.match("greater", "greater_equal", "less", "less_equal")) {
      const operator = this.previous() as BinaryToken;
      const right = this.term();
      expr = {
        type: "binary",
        left: expr,
        operator: operator,
        right: right,
      };
    }
    return expr;
  }

  private term(): Expr {
    let expr: Expr = this.factor();

    while (this.match("minus", "plus")) {
      const operator = this.previous() as BinaryToken;
      const right = this.factor();
      expr = {
        type: "binary",
        left: expr,
        operator: operator,
        right: right,
      };
    }
    return expr;
  }

  private factor(): Expr {
    let expr: Expr = this.unary();

    while (this.match("slash", "star")) {
      const operator = this.previous() as BinaryToken;
      const right = this.unary();
      expr = {
        type: "binary",
        left: expr,
        operator: operator,
        right: right,
      };
    }
    return expr;
  }

  private unary(): Expr {
    if (this.match("bang", "minus")) {
      const operator = this.previous() as UnaryToken;
      const right = this.unary();
      return {
        type: "unary",
        operator: operator,
        right: right,
      };
    }

    return this.call();
  }

  private call(): Expr {
    let expr = this.primary();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.match("left_paren")) {
        expr = this.finishCall(expr);
      } else if (this.match("dot")) {
        const name = this.consume(
          "identifier",
          "Expect property name after '.'."
        );
        expr = {
          type: "get",
          object: expr,
          name: name,
        };
      } else {
        break;
      }
    }
    return expr;
  }

  private finishCall(callee: Expr): Expr {
    const args: Expr[] = [];
    if (!this.check("right_paren")) {
      do {
        if (args.length >= 255) {
          this.error(this.peek(), "Can't have more than 255 arguments.");
        }
        args.push(this.expression());
      } while (this.match("comma"));
    }

    const paren = this.consume("right_paren", "Expect ')' after arguments.");
    return {
      type: "call",
      callee: callee,
      paren: paren,
      arguments: args,
    };
  }

  private primary(): Expr {
    if (this.match("false")) {
      return { type: "literal", value: false };
    }
    if (this.match("true")) {
      return { type: "literal", value: true };
    }
    if (this.match("nil")) {
      return { type: "literal", value: null };
    }
    if (this.match("number", "string")) {
      return {
        type: "literal",
        value: this.previous().literal as string | number,
      };
    }
    if (this.match("super")) {
      const keyword = this.previous();
      this.consume("dot", "Expect '.' after 'super'.");
      const method = this.consume(
        "identifier",
        "Expect superclass method name."
      );
      return { type: "super", keyword: keyword, method: method };
    }
    if (this.match("this")) {
      return { type: "this", keyword: this.previous() };
    }
    if (this.match("identifier")) {
      return { type: "variable", name: this.previous() };
    }
    if (this.match("left_paren")) {
      const expr: Expr = this.expression();
      this.consume("right_paren", "Expect ')' after expression.");
      return { type: "grouping", expression: expr };
    }
    throw this.error(this.peek(), "Expect expression.");
  }

  private synchronize() {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === "semicolon") {
        return;
      }
      switch (this.peek().type) {
        case "class":
        case "fun":
        case "var":
        case "for":
        case "if":
        case "while":
        case "print":
        case "return":
          return;
      }

      this.advance();
    }
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw this.error(this.peek(), message);
  }

  private error(token: Token, message: string): ParseError {
    error(token, message);
    return new ParseError();
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === "eof";
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}
