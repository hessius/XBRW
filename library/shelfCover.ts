export const COVER_MEMBERS = 4;
export type ShelfCoverMember = {uuid: string; accent: string; imageURL?: string};

export function coverCells(members: readonly ShelfCoverMember[], count: number): ShelfCoverMember[] {
    const selected = members.slice(0, COVER_MEMBERS);
    if (selected.length === 0) return [];
    const seen = new Set<string>();
    return Array.from({length: count === 1 ? 1 : COVER_MEMBERS}, (_, index) => {
        const member = selected[index % selected.length];
        const cell: ShelfCoverMember = {uuid: member.uuid, accent: member.accent};
        if (index < selected.length && member.imageURL && !seen.has(member.imageURL)) {
            cell.imageURL = member.imageURL;
            seen.add(member.imageURL);
        }
        return cell;
    });
}
