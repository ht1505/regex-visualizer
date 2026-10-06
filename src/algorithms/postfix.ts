// Postfix (Reverse Polish Notation) converter using the Shunting Yard Algorithm
// Operator precedence: * > + > . > |

import { Token } from './tokenizer';

type Precedence = { [key: string]: number };

const PRECEDENCE: Precedence = {
  '|': 1,
  '.': 2,
  '+': 3,
  '*': 3,
};

/**
 * Convert an array of tokens (with explicit concatenation) to postfix notation
 * using the Shunting Yard algorithm.
 *
 * Returns an array of tokens in postfix order.
 */
export function toPostfix(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const operatorStack: Token[] = [];

  for (const token of tokens) {
    if (token.type === 'SYMBOL') {
      output.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LPAREN') {
        output.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0) {
        throw new Error('Mismatched parentheses in regex.');
      }
      operatorStack.pop(); // remove LPAREN
    } else {
      // it's an operator: UNION, CONCAT, STAR, PLUS
      const curPrec = PRECEDENCE[token.value] ?? 0;

      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== 'LPAREN' &&
        (PRECEDENCE[operatorStack[operatorStack.length - 1].value] ?? 0) >= curPrec
      ) {
        output.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.type === 'LPAREN' || top.type === 'RPAREN') {
      throw new Error('Mismatched parentheses in regex.');
    }
    output.push(top);
  }

  return output;
}

/**
 * Convert the postfix token array to a display string.
 */
export function postfixToString(postfix: Token[]): string {
  return postfix.map(t => t.value).join('');
}
