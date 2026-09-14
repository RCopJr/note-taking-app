import path from 'node:path';
import matter from 'gray-matter';

export interface MarkdownMetadata {
  title: string;
  tags: string[];
}

export function parseMarkdownMetadata(name: string, content: string): MarkdownMetadata {
  let title = '';
  let tags: string[] = [];
  let markdown = content;

  try {
    const parsed = matter(content);
    markdown = parsed.content;
    if (typeof parsed.data.title === 'string') title = parsed.data.title.trim();

    const rawTags = Array.isArray(parsed.data.tags)
      ? parsed.data.tags
      : typeof parsed.data.tags === 'string'
        ? parsed.data.tags.split(',')
        : [];
    tags = [...new Set(rawTags
      .map((tag: unknown) => String(tag).trim().toLowerCase())
      .filter((tag: string) => tag.length > 0 && tag.length <= 100))];
  } catch {
    // Malformed frontmatter remains note content; heading/name fallbacks still apply.
  }

  if (!title) {
    const heading = markdown.match(/^#\s+(.+)$/m)?.[1];
    if (heading) title = heading.trim();
  }
  if (!title) title = path.basename(name).replace(/\.(md|txt)$/i, '');

  return { title, tags };
}

export function buildNoteSearchText(
  name: string,
  metadata: MarkdownMetadata,
  content: string,
): string {
  return [name, metadata.title, metadata.tags.join(' '), content].join(' ');
}
