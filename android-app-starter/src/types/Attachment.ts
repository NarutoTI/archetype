export interface Attachment {
  id: string;
  name: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface AttachmentDraft extends Attachment {
  dataUrl?: string;
}
