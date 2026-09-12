import { z } from 'zod/v4';

const timestampSchema = z.number().finite().nonnegative();
const tagSchema = z.string().trim().min(1).max(100);

export const noteMetadataSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string(),
  tags: z.array(tagSchema),
  size: z.number().int().nonnegative(),
  updatedAt: timestampSchema,
}).strict();

export type NoteMetadata = z.infer<typeof noteMetadataSchema>;

export const noteDocumentSchema = noteMetadataSchema.extend({
  content: z.string(),
});

export type NoteDocument = z.infer<typeof noteDocumentSchema>;

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  updatedAt?: number;
  children?: FileNode[];
}

export const fileNodeSchema: z.ZodType<FileNode> = z.lazy(() => z.object({
  name: z.string().min(1),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().int().nonnegative().optional(),
  updatedAt: timestampSchema.optional(),
  children: z.array(fileNodeSchema).optional(),
}).strict());

export const fileTreeSchema = z.array(fileNodeSchema);

export const ftsSearchResultSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  snippet: z.string(),
  tags: z.array(tagSchema),
  rank: z.number().finite(),
}).strict();

export type FtsSearchResult = z.infer<typeof ftsSearchResultSchema>;
export const ftsSearchResultsSchema = z.array(ftsSearchResultSchema);

export const tagCountSchema = z.object({
  tag: tagSchema,
  count: z.number().int().nonnegative(),
}).strict();

export type TagCount = z.infer<typeof tagCountSchema>;
export const tagCountsSchema = z.array(tagCountSchema);

export const vimKeymapSchema = z.object({
  before: z.string().trim().min(1).max(100),
  after: z.string().trim().min(1).max(100),
  mode: z.enum(['normal', 'insert', 'visual']),
}).strict();

export type VimKeymap = z.infer<typeof vimKeymapSchema>;

export const editorSettingsSchema = z.object({
  fontSize: z.number().int().min(8).max(72),
  fontFamily: z.string().trim().min(1).max(500),
  lineNumbers: z.boolean(),
  livePreview: z.boolean(),
  cursorScrollMarginLines: z.number().int().min(0).max(500),
}).strict();

export type EditorSettings = z.infer<typeof editorSettingsSchema>;

export const bibleSettingsSchema = z.object({
  defaultVersion: z.literal('ESV'),
}).strict();

export type BibleSettings = z.infer<typeof bibleSettingsSchema>;

export const appConfigSchema = z.object({
  notesDir: z.string().trim().min(1).max(4096),
  leaderKey: z.string().trim().min(1).max(100),
  vimKeymaps: z.array(vimKeymapSchema).max(100),
  editor: editorSettingsSchema,
  bible: bibleSettingsSchema,
}).strict();

export type AppConfig = z.infer<typeof appConfigSchema>;

export const updateAppConfigSchema = z.object({
  notesDir: appConfigSchema.shape.notesDir.optional(),
  leaderKey: appConfigSchema.shape.leaderKey.optional(),
  vimKeymaps: appConfigSchema.shape.vimKeymaps.optional(),
  editor: editorSettingsSchema.partial().optional(),
  bible: bibleSettingsSchema.partial().optional(),
}).strict();

export type UpdateAppConfig = z.infer<typeof updateAppConfigSchema>;

export const bibleStatusSchema = z.object({
  configured: z.boolean(),
  supportedVersions: z.array(z.literal('ESV')).readonly(),
}).strict();

export type BibleStatus = z.infer<typeof bibleStatusSchema>;

export const biblePassageSchema = z.object({
  reference: z.string(),
  canonical: z.string(),
  version: z.literal('ESV'),
  text: z.string(),
}).strict();

export type BiblePassage = z.infer<typeof biblePassageSchema>;

export const localPathSchema = z.string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => !value.includes('\\') && !value.startsWith('/'), 'Use a relative path with forward slashes.')
  .refine(
    (value) => value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Path segments must be non-empty and cannot be . or ...',
  );

export const createNoteRequestSchema = z.object({
  id: localPathSchema,
  content: z.string().default(''),
}).strict();

export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

export const saveNoteRequestSchema = z.object({
  content: z.string(),
}).strict();

export type SaveNoteRequest = z.infer<typeof saveNoteRequestSchema>;

export const createFolderRequestSchema = z.object({
  path: localPathSchema,
}).strict();

export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;

export const renamePathRequestSchema = z.object({
  oldPath: localPathSchema,
  newPath: localPathSchema,
}).strict();

export type RenamePathRequest = z.infer<typeof renamePathRequestSchema>;

export const searchQuerySchema = z.object({
  q: z.string().max(500).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

export const biblePassageQuerySchema = z.object({
  reference: z.string().trim().min(1).max(200).refine((value) => !value.includes(';'), 'Use one Bible passage reference at a time.'),
  version: z.literal('ESV').default('ESV'),
}).strict();

export const authSessionSchema = z.object({
  userId: z.uuid(),
  email: z.email().optional(),
  assuranceLevel: z.literal('aal2'),
}).strict();

export type AuthSession = z.infer<typeof authSessionSchema>;

export const successResponseSchema = z.object({
  success: z.literal(true),
}).strict();

export const syncResponseSchema = z.object({
  synced: z.number().int().nonnegative(),
}).strict();

export const apiErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'REVISION_CONFLICT',
  'EXTERNAL_SERVICE_ERROR',
  'CONFIGURATION_ERROR',
  'INTERNAL_ERROR',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }).strict(),
}).strict();

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
