import React, {useState} from "react";
import {View} from "react-native";
import {MARK_SIZE} from "@/components/ShelfMark";
import RecipePhoto from "@/components/RecipePhoto";
import {COVER_MEMBERS, coverCells, type ShelfCoverMember} from "@/library/shelfCover";
import type {ShelfMarkMembers} from "@/hooks/useRecipeLibrary";

export function withShelfPhotos(
    marks: Readonly<Record<string, ShelfMarkMembers>>, show: boolean
): Record<string, ShelfMarkMembers> {
    if (show) return {...marks};
    return Object.fromEntries(Object.entries(marks).map(([id, members]) => [id, {accents: members.accents}]));
}

export default function ShelfPhotoMark({members, count, fallback, automatic = false}: {
    members: readonly ShelfCoverMember[];
    count: number;
    fallback: React.ReactNode;
    automatic?: boolean;
}) {
    const [failedURLs, setFailedURLs] = useState<readonly string[]>([]);
    const cells = coverCells(members, count, automatic);
    if (!cells.some(cell => cell.imageURL)) return <>{fallback}</>;
    if (automatic && cells.filter(cell => cell.imageURL && !failedURLs.includes(cell.imageURL))
        .length < COVER_MEMBERS) return <>{fallback}</>;
    const size = count === 1 ? MARK_SIZE : (MARK_SIZE - 2) / 2;
    return (
        <View testID="shelf-photo-mark" accessible={false} accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{width: MARK_SIZE, height: MARK_SIZE, flexDirection: "row", flexWrap: "wrap", gap: 2}}>
            {cells.map((cell, index) => {
                const uri = cell.imageURL;
                return (
                <View key={`${index}-${cell.uuid}`} testID="shelf-cover-cell"
                      style={{width: size, height: size, backgroundColor: cell.accent,
                          borderRadius: count === 1 ? size / 2 : 4, overflow: "hidden"}}>
                    {uri && <RecipePhoto uri={uri} size={size} radius={size / 2}
                        backing={cell.accent} testID="shelf-photo"
                        onError={automatic ? () => setFailedURLs(failed =>
                            failed.includes(uri) ? failed : [...failed, uri]) : undefined}/>}
                </View>
                );
            })}
        </View>
    );
}
