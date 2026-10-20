export const CARD_PHOTO_SIZE = 36;
export const TILE_PHOTO_SIZE = 20;
export const PHOTO_GAP = 6;
export type Rect = {x: number; y: number; width: number; height: number};

export function metadataPhotoFits(available?: number, content?: number): boolean {
    return available !== undefined && content !== undefined
        && Number.isFinite(available) && Number.isFinite(content)
        && available > 0 && content >= 0
        && Math.ceil(content + PHOTO_GAP + TILE_PHOTO_SIZE) <= Math.floor(available);
}

export function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
}
