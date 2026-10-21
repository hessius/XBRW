import {coverCells, hasStockPhotoCover, stockPhotoCover} from "../shelfCover";

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

it.each(["xbloom", "favourites", "pods", "mostBrewed", "recentlyAdded"])(
    "allows the approved %s stock photo cover", id => expect(hasStockPhotoCover(id)).toBe(true)
);
it.each(["tea", "allRecipes", "mine", "neverBrewed", "sharedBy:Somebody", "tag:pods"])(
    "does not extend stock photos to %s", id => expect(hasStockPhotoCover(id)).toBe(false)
);
it("requires four photographed recipes, skipping missing, blank, invalid and repeated members", () => {
    const photos = Array.from({length: 4}, (_, n) => ({
        uuid: `p${n}`, accent: "accent", imageURL: `https://coffee.example/${n}`
    }));
    expect(stockPhotoCover(photos.slice(0, 3))).toEqual([]);
    expect(stockPhotoCover([...photos.slice(0, 3), photos[0]])).toEqual([]);
    expect(stockPhotoCover([
        {uuid: "blank", accent: "a", imageURL: " "},
        {uuid: "invalid", accent: "a", imageURL: "http://coffee.example/insecure"},
        members[1], ...photos
    ])).toEqual(photos);
});

it("counts four recipes sharing one photo as a full stock cover", () => {
    const copies = Array.from({length: 4}, (_, n) => ({...members[0], uuid: `copy-${n}`}));
    expect(stockPhotoCover(copies)).toEqual(copies);
});
