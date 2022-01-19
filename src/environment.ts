import { RuntimeError, Value } from "./interpreter";
import { Token } from "./types";

export class Environment {
  readonly enclosing: Environment | null;
  readonly values: Map<string, Value> = new Map();

  constructor(enclosing: Environment | null) {
    this.enclosing = enclosing;
  }

  define(name: string, value: Value) {
    this.values.set(name, value);
  }

  get(name: Token): Value {
    const value: Value | undefined = this.values.get(name.lexeme);
    if (value !== undefined) {
      return value;
    }
    if (this.enclosing !== null) {
      return this.enclosing.get(name);
    }
    throw new RuntimeError(name, "Undefined variable '" + name.lexeme + "'.");
  }

  assign(name: Token, value: Value) {
    if (this.values.has(name.lexeme)) {
      this.values.set(name.lexeme, value);
      return;
    }
    if (this.enclosing !== null) {
      this.enclosing.assign(name, value);
      return;
    }
    throw new RuntimeError(name, "Undefined variable '" + name.lexeme + "'.");
  }

  getAt(distance: number, name: string): Value {
    return this.ancestor(distance).values.get(name) as Value;
  }

  assignAt(distance: number, name: Token, value: Value) {
    return this.ancestor(distance).values.set(name.lexeme, value);
  }

  private ancestor(distance: number): Environment {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let env: Environment = this;
    for (let i = 0; i < distance; i++) {
      env = env.enclosing as Environment;
    }
    return env;
  }
}
