export type TokenType =
  | Keyword
  | "left_paren"
  | "right_paren"
  | "left_brace"
  | "right_brace"
  | "comma"
  | "dot"
  | "minus"
  | "plus"
  | "semicolon"
  | "slash"
  | "star"
  | "bang"
  | "bang_equal"
  | "equal"
  | "equal_equal"
  | "greater"
  | "greater_equal"
  | "less"
  | "less_equal"
  | "identifier"
  | "string"
  | "number"
  | "eof";

export type Token = {
  readonly type: TokenType;
  readonly lexeme: string;
  readonly literal: string | number | undefined;
  readonly line: number;
};

const keywords = [
  "and",
  "class",
  "else",
  "false",
  "for",
  "fun",
  "if",
  "nil",
  "or",
  "print",
  "return",
  "super",
  "this",
  "true",
  "var",
  "while",
] as const;
export type Keyword = typeof keywords[number];

export function isKeyword(s: string): s is Keyword {
  return (keywords as readonly string[]).includes(s);
}

type UnaryTokenType = "bang" | "minus";

type BinaryTokenType =
  | "minus"
  | "plus"
  | "slash"
  | "star"
  | "greater"
  | "greater_equal"
  | "less"
  | "less_equal"
  | "bang_equal"
  | "equal_equal";

type LogicalTokenType = "or" | "and";

export type BinaryToken = Token & { type: BinaryTokenType };
export type UnaryToken = Token & { type: UnaryTokenType };
export type LogicalToken = Token & { type: LogicalTokenType };

export type Stmt =
  | Block
  | Class
  | Expression
  | FunctionStmt
  | If
  | Print
  | ReturnStmt
  | Var
  | While;

export type Block = {
  readonly type: "block";
  readonly statements: Stmt[];
};

export type Class = {
  readonly type: "class";
  readonly name: Token;
  readonly superclass: Variable | null;
  readonly methods: FunctionStmt[];
};

export type Expression = {
  readonly type: "expression";
  readonly expression: Expr;
};

export type FunctionStmt = {
  readonly type: "function";
  readonly name: Token;
  readonly params: Token[];
  readonly body: Stmt[];
};

export type If = {
  readonly type: "if";
  readonly condition: Expr;
  readonly thenBranch: Stmt;
  readonly elseBranch: Stmt | null;
};

export type Print = {
  readonly type: "print";
  readonly expression: Expr;
};

export type ReturnStmt = {
  readonly type: "return";
  readonly keyword: Token;
  readonly value: Expr | null;
};

export type Var = {
  readonly type: "var";
  readonly name: Token;
  readonly initializer: Expr | null;
};

export type While = {
  readonly type: "while";
  readonly condition: Expr;
  readonly body: Stmt;
};

export type Expr =
  | Assignment
  | Binary
  | Call
  | Get
  | Grouping
  | Literal
  | Logical
  | Set
  | Super
  | This
  | Unary
  | Variable;

export type Assignment = {
  readonly type: "assignment";
  readonly name: Token;
  readonly value: Expr;
};

export type Binary = {
  readonly type: "binary";
  readonly left: Expr;
  readonly operator: BinaryToken;
  readonly right: Expr;
};

export type Call = {
  readonly type: "call";
  readonly callee: Expr;
  readonly paren: Token;
  readonly arguments: Expr[];
};

export type Get = {
  readonly type: "get";
  readonly object: Expr;
  readonly name: Token;
};

export type Grouping = {
  readonly type: "grouping";
  readonly expression: Expr;
};

export type Literal = {
  readonly type: "literal";
  readonly value: number | string | boolean | null;
};

export type Logical = {
  readonly type: "logical";
  readonly left: Expr;
  readonly operator: LogicalToken;
  readonly right: Expr;
};

export type Set = {
  readonly type: "set";
  readonly object: Expr;
  readonly name: Token;
  readonly value: Expr;
};

export type Super = {
  readonly type: "super";
  readonly keyword: Token;
  readonly method: Token;
};

export type This = {
  readonly type: "this";
  readonly keyword: Token;
};

export type Unary = {
  readonly type: "unary";
  readonly operator: UnaryToken;
  readonly right: Expr;
};

export type Variable = {
  readonly type: "variable";
  readonly name: Token;
};
