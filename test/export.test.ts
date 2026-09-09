import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownToGoogleDocsHtml } from '../src/utils/export.ts';

test('Google Docs export preserves supported Markdown semantics', () => {
  const html = markdownToGoogleDocsHtml(`# Abiding in God
**Main Scripture**: [[Bible: John 15:1-17]]
*Other Supporting Scripture*: [[Bible: Colossians 3:1-4 | ESV]]
## Brainstorming
- First thought
- Second thought
`);

  assert.match(html, /Main Scripture<\/strong>:[^\n]*<a href="https:\/\/www\.esv\.org\/John\+15%3A1-17\/">John 15:1-17<\/a><br>/);
  assert.match(html, /<a href="https:\/\/www\.esv\.org\/Colossians\+3%3A1-4\/">Colossians 3:1-4<\/a>/);
  assert.match(html, /<h1 style="[^"]*margin: 0 0 8pt 0;[^"]*">/);
  assert.match(html, /<h2 style="[^"]*margin: 12pt 0 4pt 0;[^"]*">/);
  assert.match(html, /<li style="margin: 0;">First thought<\/li>/);
  assert.doesNotMatch(html, /padding-left: 24px|margin-bottom: 4pt|font-family: Arial|color: #/);

  const unsupportedVersion = markdownToGoogleDocsHtml('[[Bible: John 3:16 | NIV]]');
  assert.match(unsupportedVersion, /\[\[Bible: John 3:16 \| NIV\]\]/);
  assert.doesNotMatch(unsupportedVersion, /href=/);

  const code = markdownToGoogleDocsHtml('`[[Bible: John 3:16]]`');
  assert.match(code, /<code[^>]*>\[\[Bible: John 3:16\]\]<\/code>/);
  assert.doesNotMatch(code, /href=/);

});
