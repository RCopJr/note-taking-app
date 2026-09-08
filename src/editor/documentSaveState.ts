export class DocumentSaveState {
  private currentRevision = 0;
  private savedRevision = 0;

  markChanged(): void {
    this.currentRevision += 1;
  }

  captureRevision(): number {
    return this.currentRevision;
  }

  markSaved(revision: number): void {
    this.savedRevision = Math.max(this.savedRevision, revision);
  }

  isDirty(): boolean {
    return this.currentRevision !== this.savedRevision;
  }
}
