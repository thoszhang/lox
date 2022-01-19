import { Interpreter } from "./interpreter";
import { error } from "./run";
import { Expr, FunctionStmt, Stmt, Token } from "./types";

type Scope = Map<string, boolean>;

type FunctionType = "none" | "function" | "method" | "initializer";

type ClassType = "none" | "class" | "subclass";

export class Resolver {
  private readonly interpreter: Interpreter;
  private readonly scopes: Scope[] = [];
  private currentFunction: FunctionType = "none";
  private currentClass: ClassType = "none";

  constructor(interpreter: Interpreter) {
    this.interpreter = interpreter;
  }

  resolveStmt(stmt: Stmt): void {
    switch (stmt.type) {
      case "block": {
        this.beginScope();
        this.resolveStmts(stmt.statements);
        this.endScope();
        return;
      }
      case "class": {
        const enclosingClass = this.currentClass;
        this.currentClass = "class";

        this.declare(stmt.name);
        this.define(stmt.name);

        if (
          stmt.superclass !== null &&
          stmt.name.lexeme === stmt.superclass.name.lexeme
        ) {
          error(stmt.superclass.name, "A class can't inherit from itself.");
        }
        if (stmt.superclass !== null) {
          this.currentClass = "subclass";
          this.resolveExpr(stmt.superclass);
        }

        if (stmt.superclass !== null) {
          this.beginScope();
          this.currScope().set("super", true);
        }

        this.beginScope();
        this.currScope().set("this", true);

        for (const method of stmt.methods) {
          let declaration: FunctionType = "method";
          if (method.name.lexeme === "init") {
            declaration = "initializer";
          }
          this.resolveFunction(method, declaration);
        }

        this.endScope();

        if (stmt.superclass !== null) {
          this.endScope();
        }

        this.currentClass = enclosingClass;
        return;
      }
      case "expression": {
        this.resolveExpr(stmt.expression);
        return;
      }
      case "function": {
        this.declare(stmt.name);
        this.define(stmt.name);
        this.resolveFunction(stmt, "function");
        return;
      }
      case "if": {
        this.resolveExpr(stmt.condition);
        this.resolveStmt(stmt.thenBranch);
        if (stmt.elseBranch !== null) {
          this.resolveStmt(stmt.elseBranch);
        }
        return;
      }
      case "print": {
        this.resolveExpr(stmt.expression);
        return;
      }
      case "return": {
        if (this.currentFunction === "none") {
          error(stmt.keyword, "Can't return from top-level code.");
        }
        if (stmt.value !== null) {
          if (this.currentFunction === "initializer") {
            error(stmt.keyword, "Can't return a value from an initializer.");
          }
          this.resolveExpr(stmt.value);
        }
        return;
      }
      case "var": {
        this.declare(stmt.name);
        if (stmt.initializer !== null) {
          this.resolveExpr(stmt.initializer);
        }
        this.define(stmt.name);
        return;
      }
      case "while": {
        this.resolveExpr(stmt.condition);
        this.resolveStmt(stmt.body);
        return;
      }
      default: {
        const _exhaustiveCheck: never = stmt;
        return _exhaustiveCheck;
      }
    }
  }

  private resolveFunction(fn: FunctionStmt, type: FunctionType) {
    const enclosingFunction = this.currentFunction;
    this.currentFunction = type;

    this.beginScope();
    for (const param of fn.params) {
      this.declare(param);
      this.define(param);
    }
    this.resolveStmts(fn.body);
    this.endScope();

    this.currentFunction = enclosingFunction;
  }

  private declare(name: Token): void {
    if (this.scopes.length === 0) {
      return;
    }
    const scope = this.currScope();
    if (scope.has(name.lexeme)) {
      error(name, "Already a variable with this name in this scope.");
    }
    scope.set(name.lexeme, false);
  }

  define(name: Token): void {
    if (this.scopes.length === 0) {
      return;
    }
    this.currScope().set(name.lexeme, true);
  }

  beginScope(): void {
    this.scopes.push(new Map());
  }

  endScope(): void {
    this.scopes.pop();
  }

  resolveStmts(stmts: Stmt[]): void {
    for (const stmt of stmts) {
      this.resolveStmt(stmt);
    }
  }

  resolveExpr(expr: Expr): void {
    switch (expr.type) {
      case "assignment": {
        this.resolveExpr(expr.value);
        this.resolveLocal(expr, expr.name);
        return;
      }
      case "binary": {
        this.resolveExpr(expr.left);
        this.resolveExpr(expr.right);
        return;
      }
      case "call": {
        this.resolveExpr(expr.callee);
        for (const arg of expr.arguments) {
          this.resolveExpr(arg);
        }
        return;
      }
      case "get": {
        this.resolveExpr(expr.object);
        return;
      }
      case "grouping": {
        this.resolveExpr(expr.expression);
        return;
      }
      case "literal": {
        return;
      }
      case "logical": {
        this.resolveExpr(expr.left);
        this.resolveExpr(expr.right);
        return;
      }
      case "set": {
        this.resolveExpr(expr.value);
        this.resolveExpr(expr.object);
        return;
      }
      case "super": {
        if (this.currentClass === "none") {
          error(expr.keyword, "Can't use 'super' outside of a class.");
        } else if (this.currentClass !== "subclass") {
          error(
            expr.keyword,
            "Can't use 'super' in a class with no superclass."
          );
        }
        this.resolveLocal(expr, expr.keyword);
        return;
      }
      case "this": {
        if (this.currentClass == "none") {
          error(expr.keyword, "Can't use 'this' outside of a class.");
          return;
        }
        this.resolveLocal(expr, expr.keyword);
        return;
      }
      case "unary": {
        this.resolveExpr(expr.right);
        return;
      }
      case "variable": {
        if (
          this.scopes.length > 0 &&
          this.currScope().get(expr.name.lexeme) === false
        ) {
          error(expr.name, "Can't read local variable in its own initializer.");
        }
        this.resolveLocal(expr, expr.name);
        return;
      }
      default: {
        const _exhaustiveCheck: never = expr;
        return _exhaustiveCheck;
      }
    }
  }

  private resolveLocal(expr: Expr, name: Token): void {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name.lexeme)) {
        this.interpreter.resolve(expr, this.scopes.length - 1 - i);
        return;
      }
    }
  }

  private currScope(): Scope {
    return this.scopes[this.scopes.length - 1];
  }
}
