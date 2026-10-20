import {metadataPhotoFits} from "../recipePictureLayout";

it("requires current real measures, rounding conservatively at the exact boundary", () => {
    expect(metadataPhotoFits(100, 74)).toBe(true);
    expect(metadataPhotoFits(99, 74)).toBe(false);
    expect(metadataPhotoFits(100, 74.1)).toBe(false);
    expect(metadataPhotoFits(undefined, 1)).toBe(false);
    expect(metadataPhotoFits(100, undefined)).toBe(false);
    expect(metadataPhotoFits(0, 0)).toBe(false);
    expect(metadataPhotoFits(100, -1)).toBe(false);
    expect(metadataPhotoFits(Infinity, 20)).toBe(false);
    expect(metadataPhotoFits(100, NaN)).toBe(false);
});
