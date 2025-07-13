/**
 * Interface for n8n tag
 */
export interface Tag {
  id?: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Interface for tag list response
 */
export interface TagListResponse {
  data: Tag[];
  nextCursor?: string | null;
}
