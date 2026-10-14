import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { hasRichTextContent, sanitizeRichTextHtml } from './rich-text.ts';

globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;

test('rich text has deterministic anchor attributes and safely escaped text for hydration', () => {
  assert.equal(
    sanitizeRichTextHtml('<p>A &amp; B&nbsp;<a href="/returns?q=a&amp;b=2" class="unsafe">Returns</a><br></p>'),
    '<p>A &amp; B&nbsp;<a href="/returns?q=a&amp;b=2" rel="noopener noreferrer">Returns</a><br></p>',
  );
});

test('server rich text strips scripts, event handlers and unsafe links', () => {
  const html = sanitizeRichTextHtml('<p onclick="alert(1)"><img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">Bad</a><strong>Safe</strong></p>');
  assert.equal(html, '<p>alert(2)Bad<strong>Safe</strong></p>');
  assert.equal(hasRichTextContent('<p>&nbsp;</p>'), false);
  assert.equal(hasRichTextContent('<p>Current return terms</p>'), true);
});
