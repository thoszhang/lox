import { Environment } from "./environment";
import { runtimeError } from "./run";
import {
  Assignment,
  Binary,
  Call,
  Expr,
  FunctionStmt,
  Get,
  Grouping,
  Literal,
  Logical,
  Set,
  Stmt,
  Super,
  This,
  Token,
  Unary,
  Variable,
} from "./types";

export type Value = null | boolean | string | number | Callable | LoxInstance;

function isCallable(v: Value): v is Callable {
  return typeof v == "object" && v !== null && "call" in v;
}

interface Callable {
  readonly arity: () => number;
  readonly toString: () => string;
  readonly call: (interpreter: Interpreter, args: Value[]) => Value;
}

class LoxFunction {
  private readonly declaration: FunctionStmt;
  private readonly closure: Environment;
  private readonly isInitializer: boolean;

  constructor(
    declaration: FunctionStmt,
    closure: Environment,
    isInitializer: boolean
  ) {
    this.declaration = declaration;
    this.closure = closure;
    this.isInitializer = isInitializer;
  }

  arity(): number {
    return this.declaration.params.length;
  }

  call(interpreter: Interpreter, args: Value[]): Value {
    const environment = new Environment(this.closure);
    for (let i = 0; i < this.declaration.params.length; i++) {
      environment.define(this.declaration.params[i].lexeme, args[i]);
    }

    try {
      interpreter.executeBlock(this.declaration.body, environment);
    } catch (e) {
      if (e instanceof Return) {
        if (this.isInitializer) {
          return this.closure.getAt(0, "this");
        }
        return e.value;
      }
      throw e;
    }

    if (this.isInitializer) {
      return this.closure.getAt(0, "this");
    }
    return null;
  }

  bind(instance: LoxInstance) {
    const environment = new Environment(this.closure);
    environment.define("this", instance);
    return new LoxFunction(this.declaration, environment, this.isInitializer);
  }

  toString(): string {
    return `<fn ${this.declaration.name.lexeme}>`;
  }
}

export class LoxClass {
  readonly name: string;
  readonly superclass: LoxClass | null;
  readonly methods: Map<string, LoxFunction>;

  constructor(
    name: string,
    superclass: LoxClass | null,
    methods: Map<string, LoxFunction>
  ) {
    this.name = name;
    this.superclass = superclass;
    this.methods = methods;
  }

  findMethod(name: string): LoxFunction | undefined {
    if (this.methods.has(name)) {
      return this.methods.get(name);
    }
    if (this.superclass !== null) {
      return this.superclass.findMethod(name);
    }
    return undefined;
  }

  arity(): number {
    const initializer = this.findMethod("init");
    if (initializer === undefined) {
      return 0;
    }
    return initializer.arity();
  }

  call(interpreter: Interpreter, args: Value[]): Value {
    const instance = new LoxInstance(this);
    const initializer = this.findMethod("init");
    if (initializer !== undefined) {
      initializer.bind(instance).call(interpreter, args);
    }
    return instance;
  }

  toString(): string {
    return this.name;
  }
}

export class LoxInstance {
  private readonly klass: LoxClass;
  private readonly fields: Map<string, Value> = new Map();

  constructor(klass: LoxClass) {
    this.klass = klass;
  }

  toString(): string {
    return this.klass.name + " instance";
  }

  get(name: Token): Value {
    const value = this.fields.get(name.lexeme);
    if (value !== undefined) {
      return value;
    }

    const method = this.klass.findMethod(name.lexeme);
    if (method !== undefined) {
      return method.bind(this);
    }

    throw new RuntimeError(name, `Undefined property '${name.lexeme}'.`);
  }

  set(name: Token, value: Value) {
    this.fields.set(name.lexeme, value);
  }
}

export class RuntimeError extends Error {
  readonly token: Token;

  constructor(token: Token, message: string) {
    super(message);
    this.token = token;
    Object.setPrototypeOf(this, RuntimeError.prototype);
  }
}

class Return extends Error {
  readonly value: Value;

  constructor(value: Value) {
    super();
    this.value = value;
    Object.setPrototypeOf(this, Return.prototype);
  }
}

export class Interpreter {
  readonly globals = new Environment(null);
  environment = this.globals;
  readonly locals: Map<Expr, number> = new Map();

  constructor() {
    this.globals.define("clock", {
      arity: () => 0,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      call: (_i: Interpreter, _args: Value[]): Value => {
        return Date.now();
      },
      toString: (): string => {
        return "<native fn>";
      },
    });
  }

  interpret(statements: Stmt[]) {
    try {
      for (const statement of statements) {
        this.execute(statement);
      }
    } catch (e) {
      if (e instanceof RuntimeError) {
        runtimeError(e);
      } else {
        throw e;
      }
    }
  }

  private execute(stmt: Stmt) {
    switch (stmt.type) {
      case "block": {
        this.executeBlock(stmt.statements, new Environment(this.environment));
        return;
      }
      case "class": {
        let superclass: LoxClass | null = null;
        if (stmt.superclass !== null) {
          const s = this.evaluate(stmt.superclass);
          if (!(s instanceof LoxClass)) {
            throw new RuntimeError(
              stmt.superclass.name,
              "Superclass must be a class."
            );
          }
          superclass = s;
        }
        this.environment.define(stmt.name.lexeme, null);

        if (stmt.superclass !== null) {
          this.environment = new Environment(this.environment);
          this.environment.define("super", superclass);
        }

        const methods: Map<string, LoxFunction> = new Map();
        for (const method of stmt.methods) {
          const fn = new LoxFunction(
            method,
            this.environment,
            method.name.lexeme === "init"
          );
          methods.set(method.name.lexeme, fn);
        }

        const klass = new LoxClass(stmt.name.lexeme, superclass, methods);

        if (superclass !== null) {
          this.environment = this.environment.enclosing as Environment;
        }

        this.environment.assign(stmt.name, klass);
        return;
      }
      case "expression": {
        this.evaluate(stmt.expression);
        return;
      }
      case "function": {
        const func = new LoxFunction(stmt, this.environment, false);
        this.environment.define(stmt.name.lexeme, func);
        return;
      }
      case "if": {
        if (isTruthy(this.evaluate(stmt.condition))) {
          this.execute(stmt.thenBranch);
        } else if (stmt.elseBranch !== null) {
          this.execute(stmt.elseBranch);
        }
        return;
      }
      case "print": {
        const value: Value = this.evaluate(stmt.expression);
        console.log(stringify(value));
        return;
      }
      case "return": {
        let value: Value | null = null;
        if (stmt.value !== null) {
          value = this.evaluate(stmt.value);
        }
        throw new Return(value);
      }
      case "var": {
        let value: Value = null;
        if (stmt.initializer !== null) {
          value = this.evaluate(stmt.initializer);
        }
        this.environment.define(stmt.name.lexeme, value);
        return;
      }
      case "while": {
        while (isTruthy(this.evaluate(stmt.condition))) {
          this.execute(stmt.body);
        }
        return;
      }
      default: {
        const _exhaustiveCheck: never = stmt;
        return _exhaustiveCheck;
      }
    }
  }

  resolve(expr: Expr, depth: number) {
    this.locals.set(expr, depth);
  }

  executeBlock(statements: Stmt[], environment: Environment) {
    const previous: Environment = this.environment;
    try {
      this.environment = environment;
      for (const statement of statements) {
        this.execute(statement);
      }
    } finally {
      this.environment = previous;
    }
  }

  private evaluate(expr: Expr): Value {
    switch (expr.type) {
      case "assignment":
        return this.evaluateAssignment(expr);
      case "binary":
        return this.evaluateBinary(expr);
      case "call":
        return this.evaluateCall(expr);
      case "get":
        return this.evaluateGet(expr);
      case "grouping":
        return this.evaluateGrouping(expr);
      case "literal":
        return this.evaluateLiteral(expr);
      case "logical":
        return this.evaluateLogical(expr);
      case "set":
        return this.evaluateSet(expr);
      case "super":
        return this.evaluateSuper(expr);
      case "this":
        return this.evaluateThis(expr);
      case "unary":
        return this.evaluateUnary(expr);
      case "variable":
        return this.evaluateVariable(expr);
    }
  }

  private evaluateAssignment(expr: Assignment): Value {
    const value: Value = this.evaluate(expr.value);

    const distance = this.locals.get(expr);
    if (distance !== undefined) {
      this.environment.assignAt(distance, expr.name, value);
    } else {
      this.globals.assign(expr.name, value);
    }

    return value;
  }

  private evaluateBinary(expr: Binary): Value {
    const left: Value = this.evaluate(expr.left);
    const right: Value = this.evaluate(expr.right);
    switch (expr.operator.type) {
      case "minus":
        if (typeof left === "number" && typeof right === "number") {
          return left - right;
        }
        throw checkNumberOperandsError(expr.operator);
      case "plus":
        if (typeof left === "number" && typeof right === "number") {
          return left + right;
        } else if (typeof left === "string" && typeof right === "string") {
          return left + right;
        }
        throw new RuntimeError(
          expr.operator,
          "Operands must be two numbers or two strings."
        );
      case "slash":
        if (typeof left === "number" && typeof right === "number") {
          return left / right;
        }
        throw checkNumberOperandsError(expr.operator);
      case "star":
        if (typeof left === "number" && typeof right === "number") {
          return left * right;
        }
        throw checkNumberOperandsError(expr.operator);
      case "greater":
        if (typeof left === "number" && typeof right === "number") {
          return left > right;
        }
        throw checkNumberOperandsError(expr.operator);
      case "greater_equal":
        if (typeof left === "number" && typeof right === "number") {
          return left >= right;
        }
        throw checkNumberOperandsError(expr.operator);
      case "less":
        if (typeof left === "number" && typeof right === "number") {
          return left < right;
        }
        throw checkNumberOperandsError(expr.operator);
      case "less_equal":
        if (typeof left === "number" && typeof right === "number") {
          return left <= right;
        }
        throw checkNumberOperandsError(expr.operator);
      case "bang_equal":
        return !isEqual(left, right);
      case "equal_equal":
        return isEqual(left, right);
    }
  }

  private evaluateCall(expr: Call): Value {
    const callee = this.evaluate(expr.callee);

    const args: Value[] = [];
    for (const arg of expr.arguments) {
      args.push(this.evaluate(arg));
    }

    if (!isCallable(callee)) {
      throw new RuntimeError(
        expr.paren,
        "Can only call functions and classes."
      );
    }
    if (args.length != callee.arity()) {
      throw new RuntimeError(
        expr.paren,
        `Expected ${callee.arity()} arguments but got ${args.length}.`
      );
    }
    return callee.call(this, args);
  }

  private evaluateGet(expr: Get): Value {
    const object = this.evaluate(expr.object);
    if (object instanceof LoxInstance) {
      return object.get(expr.name);
    }
    throw new RuntimeError(expr.name, "Only instances have properties.");
  }

  private evaluateGrouping(expr: Grouping): Value {
    return this.evaluate(expr.expression);
  }

  private evaluateLiteral(expr: Literal): Value {
    return expr.value;
  }

  private evaluateLogical(expr: Logical): Value {
    const left = this.evaluate(expr.left);
    if (expr.operator.type == "or") {
      if (isTruthy(left)) {
        return left;
      }
    } else {
      if (!isTruthy(left)) {
        return left;
      }
    }
    return this.evaluate(expr.right);
  }

  private evaluateSet(expr: Set): Value {
    const object = this.evaluate(expr.object);
    if (!(object instanceof LoxInstance)) {
      throw new RuntimeError(expr.name, "Only instances have fields.");
    }

    const value = this.evaluate(expr.value);
    object.set(expr.name, value);
    return value;
  }

  private evaluateSuper(expr: Super): Value {
    const distance = this.locals.get(expr) as number;
    const superclass = this.environment.getAt(distance, "super") as LoxClass;
    const inst = this.environment.getAt(distance - 1, "this") as LoxInstance;

    const method = superclass.findMethod(expr.method.lexeme);
    if (method === undefined) {
      throw new RuntimeError(
        expr.method,
        `Undefined property '${expr.method.lexeme}'.`
      );
    }

    return method.bind(inst);
  }

  private evaluateThis(expr: This): Value {
    return this.lookUpVariable(expr.keyword, expr);
  }

  private evaluateUnary(expr: Unary): Value {
    const right: Value = this.evaluate(expr.right);
    switch (expr.operator.type) {
      case "minus":
        if (typeof right === "number") {
          return -right;
        }
        throw checkNumberOperandError(expr.operator);
      case "bang":
        return !isTruthy(right);
    }
  }

  private evaluateVariable(expr: Variable): Value {
    return this.lookUpVariable(expr.name, expr);
  }

  private lookUpVariable(name: Token, expr: Expr): Value {
    const distance = this.locals.get(expr);
    if (distance !== undefined) {
      return this.environment.getAt(distance, name.lexeme);
    }
    return this.globals.get(name);
  }
}

function stringify(value: Value): string {
  if (value === null) {
    return "nil";
  }
  if (Object.is(value, -0)) {
    return "-0";
  }
  return value.toString();
}

function isTruthy(value: Value): boolean {
  if (value === null) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return true;
}

function isEqual(a: Value, b: Value): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a === null) {
    return false;
  }
  return a === b;
}

function checkNumberOperandError(operator: Token): RuntimeError {
  return new RuntimeError(operator, "Operand must be a number.");
}

function checkNumberOperandsError(operator: Token): RuntimeError {
  return new RuntimeError(operator, "Operands must be numbers.");
}
