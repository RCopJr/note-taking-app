import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNoteSearchText, parseMarkdownMetadata } from '../server/markdown.ts';

test('Markdown metadata derives normalized title and tags for cloud indexing', () => {
  const content = `---
title: Project Plan
tags: [Work, urgent, work]
---

# Ignored fallback

The migration checklist is complete.`;
  const metadata = parseMarkdownMetadata('fallback.md', content);

  assert.deepEqual(metadata, {
    title: 'Project Plan',
    tags: ['work', 'urgent'],
  });
  assert.match(buildNoteSearchText('fallback.md', metadata, content), /Project Plan work urgent/);
});

test('Markdown metadata falls back to heading and filename', () => {
  assert.deepEqual(parseMarkdownMetadata('notes.md', '# Heading\n'), {
    title: 'Heading',
    tags: [],
  });
  assert.deepEqual(parseMarkdownMetadata('notes.md', 'Plain content'), {
    title: 'notes',
    tags: [],
  });
});
