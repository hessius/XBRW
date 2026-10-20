import {metadataPhotoFits, overlaps} from "../recipePictureLayout";

it("requires current real measures, rounding conservatively at the exact boundary", () => {
    expect(metadataPhotoFits(100, 74)).toBe(true);
    expect(metadataPhotoFits(99, 74)).toBe(false);
    expect(metadataPhotoFits(100, 74.1)).toBe(false);
    expect(metadataPhotoFits(undefined, 1)).toBe(false);
    expect(metadataPhotoFits(100, undefined)).toBe(false);
    expect(metadataPhotoFits(0, 0)).toBe(false);
    expect(metadataPhotoFits(100, -1)).toBe(false);
});
it("does not count touching edges as collisions", () => {
    const rect = {x: 0, y: 0, width: 36, height: 36};
    expect(overlaps(rect, {...rect, x: 36})).toBe(false);
    expect(overlaps(rect, {...rect, x: 35})).toBe(true);
    expect(overlaps(rect, {...rect, y: 36})).toBe(false);
});
