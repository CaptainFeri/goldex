import { SignedFileUrlService } from "./signed-file-url.service";

/** Anything carrying a receipt object name -- a deposit or a withdrawal. */
export interface HasPicturePath {
  picturePath?: string | null;
}

/**
 * Attach a short-lived `pictureUrl` to a record that stores a receipt.
 *
 * `picturePath` stays on the response: it is the stable identifier the OCR
 * feedback path and support tooling refer to, and it is useless on its own now
 * that no unauthenticated route accepts it.
 */
export function withPictureUrl<T extends HasPicturePath>(
  signer: SignedFileUrlService,
  record: T,
): T & { pictureUrl: string | null } {
  return {
    ...record,
    pictureUrl: record.picturePath ? signer.sign(record.picturePath) : null,
  };
}

/**
 * The same, for a page of them.
 *
 * Typed on `items` alone rather than on `PaginatedDto`: the admin list uses
 * `paginate()` while the user list still returns its own `{ items, total, page,
 * limit }` shape, and both need the mapping.
 */
export function withPictureUrlPage<T extends HasPicturePath, P extends { items: T[] }>(
  signer: SignedFileUrlService,
  page: P,
): Omit<P, "items"> & { items: Array<T & { pictureUrl: string | null }> } {
  return { ...page, items: page.items.map((item) => withPictureUrl(signer, item)) };
}


/** A KYC document, which stores its object name under `fileUrl`. */
export interface HasFileUrl {
  fileUrl?: string | null;
}

/**
 * Attach a short-lived `documentUrl` to a KYC document.
 *
 * Separate from {@link withPictureUrl} only because the column is named
 * differently; the grant and its lifetime are identical. `fileUrl` keeps its
 * name and its value -- it is the object name, and reviewers' saved links refer
 * to documents by it.
 */
export function withDocumentUrl<T extends HasFileUrl>(
  signer: SignedFileUrlService,
  document: T,
): T & { documentUrl: string | null } {
  return {
    ...document,
    documentUrl: document.fileUrl ? signer.sign(document.fileUrl) : null,
  };
}

/** The same, for a list of them. */
export function withDocumentUrls<T extends HasFileUrl>(
  signer: SignedFileUrlService,
  documents: T[],
): Array<T & { documentUrl: string | null }> {
  return documents.map((document) => withDocumentUrl(signer, document));
}

/** The same, for a page of them. */
export function withDocumentUrlPage<T extends HasFileUrl, P extends { items: T[] }>(
  signer: SignedFileUrlService,
  page: P,
): Omit<P, "items"> & { items: Array<T & { documentUrl: string | null }> } {
  return { ...page, items: withDocumentUrls(signer, page.items) };
}

/**
 * Avatars predate MinIO: paths beginning `edited-` are files on disk that the
 * panel still serves from `/uploads`, not objects in the bucket.
 */
const LEGACY_LOCAL_AVATAR = /^edited-/;

/**
 * Mint a URL for an avatar, or null when there is nothing to mint.
 *
 * Returns null for a legacy on-disk avatar too, which is the signal for the
 * client to fall back to `/uploads/<avatarImgPath>`.
 */
export function signAvatar(
  signer: SignedFileUrlService,
  avatarImgPath?: string | null,
): string | null {
  if (!avatarImgPath || LEGACY_LOCAL_AVATAR.test(avatarImgPath)) return null;
  return signer.sign(avatarImgPath);
}

/** Attach `avatarUrl` beside a top-level `avatarImgPath`. */
export function withAvatarUrl<T extends { avatarImgPath?: string | null }>(
  signer: SignedFileUrlService,
  record: T,
): T & { avatarUrl: string | null } {
  return { ...record, avatarUrl: signAvatar(signer, record.avatarImgPath) };
}

/** The same, where the avatar hangs off a nested `profile`. */
export function withProfileAvatarUrl<
  T extends { profile?: { avatarImgPath?: string | null } | null },
>(signer: SignedFileUrlService, record: T): T {
  if (!record.profile) return record;
  return {
    ...record,
    profile: { ...record.profile, avatarUrl: signAvatar(signer, record.profile.avatarImgPath) },
  };
}
