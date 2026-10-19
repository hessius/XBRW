import React, {useState} from "react";
import {Image, View} from "react-native";

import {MARK_SIZE} from "@/components/ShelfMark";
import type {ShelfMarkMembers} from "@/hooks/useRecipeLibrary";

/** The mosaic's gutter, the same dot of air the accent mosaic leaves. */
const GAP = 2;
/** The accent mark's radius, so a cover and a mark have one silhouette. */
const RADIUS = 10;
/** The inner corners of a mosaic cell. */
const CELL_RADIUS = 4;

/**
 * The marks with their pictures, or with them taken away.
 *
 * `showRecipeAvatars` is decided once, where the grid is handed its marks,
 * rather than threaded through every row and tile between. Off, no tile has a
 * picture to draw, so every tile keeps its glyph or accent mosaic.
 */
export function withShelfPhotos(
    marks: Readonly<Record<string, ShelfMarkMembers>>, show: boolean
): Record<string, ShelfMarkMembers> {
    if (show) return {...marks};
    const stripped: Record<string, ShelfMarkMembers> = {};
    for (const [id, members] of Object.entries(marks)) stripped[id] = {accents: members.accents};
    return stripped;
}

/**
 * Which picture goes in each cell: one picture fills the square, two or more
 * make a 2x2 mosaic, repeated round the cells so it never has a hole.
 */
export function coverCells(photos: readonly string[]): string[] {
    if (photos.length <= 1) return [...photos];
    return [0, 1, 2, 3].map((cell) => photos[cell % photos.length]);
}

/**
 * A shelf's cover: its newest recipes' pictures, in the 44 pt square the
 * shelf's mark otherwise takes, so swapping one for the other cannot reflow
 * the grid.
 *
 * A picture that will not load is dropped and the cover redrawn from the
 * rest. When none load, the shelf's own mark is drawn instead, exactly as if
 * there had never been a picture.
 *
 * Decorative: the tile already announces the shelf's name and count.
 */
export default function ShelfPhotoMark({photos, fallback}: {
    /** Newest first. Empty draws the fallback. */
    photos: readonly string[];
    /** The glyph or accent mosaic, for a shelf with no picture to show. */
    fallback: React.ReactNode;
}) {
    const [failed, setFailed] = useState<readonly string[]>([]);
    const usable = photos.filter((uri) => !failed.includes(uri));
    if (usable.length === 0) return <>{fallback}</>;

    const cells = coverCells(usable);
    const single = cells.length === 1;
    const cell = single ? MARK_SIZE : (MARK_SIZE - GAP) / 2;
    const fail = (uri: string) => setFailed((was) => (was.includes(uri) ? was : [...was, uri]));

    return (
        <View testID="shelf-photo-mark"
              accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{
                  width: MARK_SIZE, height: MARK_SIZE, borderRadius: RADIUS, overflow: "hidden",
                  flexDirection: "row", flexWrap: "wrap", gap: GAP
              }}>
            {cells.map((uri, index) => (
                <Image key={`${index}-${uri}`} testID="shelf-photo"
                       source={{uri}} resizeMode="cover" resizeMethod="resize"
                       onError={() => fail(uri)}
                       style={{
                           width: cell, height: cell,
                           borderRadius: single ? RADIUS : CELL_RADIUS
                       }}/>
            ))}
        </View>
    );
}
