import React from "react";
import {View} from "react-native";
import {MARK_SIZE} from "@/components/ShelfMark";
import RecipePhoto from "@/components/RecipePhoto";
import {coverCells, type ShelfCoverMember} from "@/library/shelfCover";
import type {ShelfMarkMembers} from "@/hooks/useRecipeLibrary";

export function withShelfPhotos(
    marks: Readonly<Record<string, ShelfMarkMembers>>, show: boolean
): Record<string, ShelfMarkMembers> {
    if (show) return {...marks};
    return Object.fromEntries(Object.entries(marks).map(([id, members]) => [id, {accents: members.accents}]));
}

export default function ShelfPhotoMark({members, count, fallback, repeatPhotos = false}: {
    members: readonly ShelfCoverMember[];
    count: number;
    fallback: React.ReactNode;
    repeatPhotos?: boolean;
}) {
    const cells = coverCells(members, count, repeatPhotos);
    if (!cells.some(cell => cell.imageURL)) return <>{fallback}</>;
    const size = count === 1 ? MARK_SIZE : (MARK_SIZE - 2) / 2;
    return (
        <View testID="shelf-photo-mark" accessible={false} accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{width: MARK_SIZE, height: MARK_SIZE, flexDirection: "row", flexWrap: "wrap", gap: 2}}>
            {cells.map((cell, index) => (
                <View key={`${index}-${cell.uuid}`} testID="shelf-cover-cell"
                      style={{width: size, height: size, backgroundColor: cell.accent,
                          borderRadius: count === 1 ? size / 2 : 4, overflow: "hidden"}}>
                    {cell.imageURL && <RecipePhoto uri={cell.imageURL} size={size} radius={size / 2}
                                                  backing={cell.accent} testID="shelf-photo"/>}
                </View>
            ))}
        </View>
    );
}
