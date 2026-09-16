import { z } from 'zod/v4';

const timestampSchema = z.number().finite().nonnegative();
const tagSchema = z.string().trim().min(1).max(100);

export const noteMetadataSchema = z.object({
  id: z.uuid(),
  path: z.string().min(1),
  name: z.string().trim().min(1).max(255),
  folderId: z.uuid().nullable(),
  title: z.string(),
  tags: z.array(tagSchema),
  size: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  updatedAt: timestampSchema,
}).strict();

export type NoteMetadata = z.infer<typeof noteMetadataSchema>;

export const noteDocumentSchema = noteMetadataSchema.extend({
  content: z.string(),
});

export type NoteDocument = z.infer<typeof noteDocumentSchema>;

export interface FileNode {
  name: string;
  id: string;
  parentId: string | null;
  type: 'file' | 'directory';
  size?: number;
  revision?: number;
  updatedAt?: number;
  children?: FileNode[];
}

export const fileNodeSchema: z.ZodType<FileNode> = z.lazy(() => z.object({
  name: z.string().min(1),
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  type: z.enum(['file', 'directory']),
  size: z.number().int().nonnegative().optional(),
  revision: z.number().int().positive().optional(),
  updatedAt: timestampSchema.optional(),
  children: z.array(fileNodeSchema).optional(),
}).strict());

export const fileTreeSchema = z.array(fileNodeSchema);

export const folderMetadataSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(255),
  updatedAt: timestampSchema,
}).strict();

export type FolderMetadata = z.infer<typeof folderMetadataSchema>;

export const deletedNodeSchema = z.object({
  id: z.uuid(),
  type: z.enum(['file', 'directory']),
  name: z.string().trim().min(1).max(255),
  revision: z.number().int().positive().optional(),
  deletedAt: timestampSchema,
}).strict();

export type DeletedNode = z.infer<typeof deletedNodeSchema>;
export const deletedNodesSchema = z.array(deletedNodeSchema);

export const ftsSearchResultSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
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
  leaderKey: z.string().trim().min(1).max(100),
  vimKeymaps: z.array(vimKeymapSchema).max(100),
  editor: editorSettingsSchema,
  bible: bibleSettingsSchema,
}).strict();

export type AppConfig = z.infer<typeof appConfigSchema>;

export const updateAppConfigSchema = z.object({
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

const cloudNameSchema = z.string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !value.includes('/') && !value.includes('\\'), 'A name cannot contain path separators.');

export const createNoteRequestSchema = z.object({
  name: cloudNameSchema,
  folderId: z.uuid().nullable().default(null),
  content: z.string().default(''),
}).strict();

export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

export const saveNoteRequestSchema = z.object({
  content: z.string(),
  expectedRevision: z.number().int().positive(),
}).strict();

export type SaveNoteRequest = z.infer<typeof saveNoteRequestSchema>;

export const updateNoteMetadataRequestSchema = z.object({
  name: cloudNameSchema,
  folderId: z.uuid().nullable(),
  expectedRevision: z.number().int().positive(),
}).strict();

export type UpdateNoteMetadataRequest = z.infer<typeof updateNoteMetadataRequestSchema>;

export const createFolderRequestSchema = z.object({
  name: cloudNameSchema,
  parentId: z.uuid().nullable().default(null),
}).strict();

export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;

export const updateFolderRequestSchema = z.object({
  name: cloudNameSchema,
  parentId: z.uuid().nullable(),
}).strict();

export type UpdateFolderRequest = z.infer<typeof updateFolderRequestSchema>;

export const revisionMutationRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();

export type RevisionMutationRequest = z.infer<typeof revisionMutationRequestSchema>;

export const markdownImportFileSchema = z.object({
  path: z.string().min(1).max(4_096),
  content: z.string().max(5_000_000),
}).strict();

export type MarkdownImportFile = z.infer<typeof markdownImportFileSchema>;

export const markdownImportRequestSchema = z.object({
  mode: z.enum(['dry-run', 'commit']),
  files: z.array(markdownImportFileSchema).min(1).max(2_000),
}).strict();

export type MarkdownImportRequest = z.infer<typeof markdownImportRequestSchema>;

export const markdownImportEntrySchema = z.object({
  sourcePath: z.string(),
  targetPath: z.string().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  message: z.string().optional(),
}).strict();

export type MarkdownImportEntry = z.infer<typeof markdownImportEntrySchema>;

export const markdownImportReportSchema = z.object({
  dryRun: z.boolean(),
  imported: z.array(markdownImportEntrySchema),
  skipped: z.array(markdownImportEntrySchema),
  renamed: z.array(markdownImportEntrySchema),
  failed: z.array(markdownImportEntrySchema),
}).strict();

export type MarkdownImportReport = z.infer<typeof markdownImportReportSchema>;

export const noteIdSchema = z.uuid();

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
  'ALREADY_EXISTS',
  'REVISION_CONFLICT',
  'EXTERNAL_SERVICE_ERROR',
  'CONFIGURATION_ERROR',
  'NOT_IMPLEMENTED',
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
