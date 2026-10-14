import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

test('every informative image has alt text; decorative images are explicitly marked', () => {
  let checked = 0;
  const problems = [];
  function scan(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) { scan(file); continue; }
      if (!file.endsWith('.tsx')) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'img') {
          checked++;
          const alt = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'alt');
          const decorative = node.attributes.properties.some(attr => ts.isJsxAttribute(attr) &&
            ((attr.name.getText(source) === 'role' && attr.initializer?.getText(source) === '"presentation"') ||
             (attr.name.getText(source) === 'aria-hidden' && ['"true"', '{true}'].includes(attr.initializer?.getText(source)))));
          const value = alt?.initializer;
          const literal = value && (ts.isStringLiteral(value) ? value
            : ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression) ? value.expression : undefined);
          if (!value || (literal && !literal.text.trim() && !decorative)) {
            problems.push(`${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(path.resolve(import.meta.dirname, '..'));
  assert.ok(checked > 0);
  assert.deepEqual(problems, [], `Missing image descriptions: ${problems.join(', ')}`);
});
