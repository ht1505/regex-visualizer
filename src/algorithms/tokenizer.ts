// Tokenizer: converts regex string to array of tokens

export type TokenType = 'SYMBOL' | 'UNION' | 'STAR' | 'PLUS' | 'OPTIONAL' | 'LPAREN' | 'RPAREN' | 'CONCAT' | 'EPSILON';

export interface Token {
  type: TokenType;
  value: string;
}

/**
 * Validates the regex string and throws descriptive errors for invalid patterns.
 */
export function validateRegex(regex: string): void {
  if (!regex || regex.trim() === '') {
    throw new Error('Regular expression cannot be empty.');
  }

  // Check for balanced parentheses
  let depth = 0;
  for (let i = 0; i < regex.length; i++) {
    if (regex[i] === '(') depth++;
    else if (regex[i] === ')') depth--;
    if (depth < 0) {
      throw new Error('Invalid Regular Expression: Unexpected closing parenthesis at position ' + (i + 1) + '.');
    }
  }
  if (depth !== 0) {
    throw new Error('Invalid Regular Expression: Missing closing parenthesis.');
  }

  // Check for invalid operator placement: ||| or starting/ending with |
  if (regex.startsWith('|')) {
    throw new Error('Invalid Regular Expression: Cannot start with union operator "|".');
  }
  if (regex.endsWith('|')) {
    throw new Error('Invalid Regular Expression: Cannot end with union operator "|".');
  }
  if (regex.includes('||')) {
    throw new Error('Invalid Regular Expression: Invalid operator placement (consecutive "|").');
  }

  // Check for empty groups
  if (regex.includes('()')) {
    throw new Error('Invalid Regular Expression: Empty group "()" not allowed.');
  }

  // Check for invalid characters: only allow a-z, A-Z, 0-9, |, *, +, ?, (, )
  const validChars = /^[a-zA-Z0-9|*+?()\s]+$/;
  if (!validChars.test(regex)) {
    const invalidChar = regex.split('').find(c => !/[a-zA-Z0-9|*+?()\s]/.test(c));
    throw new Error(`Invalid Regular Expression: Unsupported character "${invalidChar}".`);
  }
}

/**
 * Tokenize a regex string into tokens (without inserting concatenation).
 */
export function tokenize(regex: string): Token[] {
  const tokens: Token[] = [];
  const cleanRegex = regex.replace(/\s/g, '');

  for (const char of cleanRegex) {
    switch (char) {
      case '|': tokens.push({ type: 'UNION', value: '|' }); break;
      case '*': tokens.push({ type: 'STAR', value: '*' }); break;
      case '+': tokens.push({ type: 'PLUS', value: '+' }); break;
      case '?': tokens.push({ type: 'OPTIONAL', value: '?' }); break;
      case '(': tokens.push({ type: 'LPAREN', value: '(' }); break;
      case ')': tokens.push({ type: 'RPAREN', value: ')' }); break;
      default:
        tokens.push({ type: 'SYMBOL', value: char });
    }
  }

  return tokens;
}

/**
 * Insert explicit concatenation operator '.' between tokens where needed.
 *
 * Concatenation is inserted between:
 * - SYMBOL, STAR, PLUS, OPTIONAL, or RPAREN followed by SYMBOL or LPAREN
 */
export function insertConcatenation(tokens: Token[]): Token[] {
  const result: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    result.push(tokens[i]);

    if (i + 1 < tokens.length) {
      const cur = tokens[i];
      const next = tokens[i + 1];

      const curIsOperand = cur.type === 'SYMBOL' || cur.type === 'STAR' || cur.type === 'PLUS' || cur.type === 'OPTIONAL' || cur.type === 'RPAREN';
      const nextIsOperand = next.type === 'SYMBOL' || next.type === 'LPAREN';

      if (curIsOperand && nextIsOperand) {
        result.push({ type: 'CONCAT', value: '.' });
      }
    }
  }

  return result;
}
