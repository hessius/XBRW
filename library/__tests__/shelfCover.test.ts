import {coverCells} from "../shelfCover";

const members = [
    {uuid: "a", accent: "a", imageURL: "https://coffee"},
    {uuid: "b", accent: "b"},
    {uuid: "c", accent: "c", imageURL: "https://coffee"},
    {uuid: "d", accent: "d"},
    {uuid: "e", accent: "e", imageURL: "https://fifth"}
];
it("keeps actual members and never repeats a picture or hunts past four", () => {
    expect(coverCells(members, 5)).toEqual([
        members[0], members[1], {uuid: "c", accent: "c"}, members[3]
    ]);
});
it.each([2, 3, 4])("fills %s-member grids with accents only", count => {
    const cells = coverCells(members.slice(0, count), count);
    expect(cells).toHaveLength(4);
    expect(cells.filter(cell => cell.imageURL)).toHaveLength(1);
});
it("uses one cell only for an actually single-member shelf", () => {
    expect(coverCells(members.slice(0, 1), 1)).toHaveLength(1);
    expect(coverCells(members.slice(0, 1), 8)).toHaveLength(4);
});
