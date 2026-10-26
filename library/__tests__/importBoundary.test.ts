it("loads the import grammar without the native colour resolver", () => {
    jest.resetModules();
    jest.doMock("@react-native/normalize-colors", () => {
        throw new Error("Native colour dependency reached the server closure");
    });
    try {
        const {parseBrewMindLink} = jest.requireActual<typeof import("../brewmindLink")>("../brewmindLink");
        expect(parseBrewMindLink("https://preview.example.test/import?v=1&share=XB0001")?.share).toBe("XB0001");
    } finally {
        jest.dontMock("@react-native/normalize-colors");
        jest.resetModules();
    }
});

it("decorates a structural import candidate without native modules", () => {
    jest.resetModules();
    jest.doMock("@react-native/normalize-colors", () => {
        throw new Error("Native colour dependency reached the server closure");
    });
    jest.doMock("../Recipe", () => {
        throw new Error("Native recipe dependency reached the server closure");
    });
    try {
        const {decorateImport, fillImportBlanks} =
            jest.requireActual<typeof import("../importDecoration")>("../importDecoration");
        const {normaliseRecipeTags} =
            jest.requireActual<typeof import("../recipeIdentity")>("../recipeIdentity");
        const candidate: import("../importDecoration").ImportCandidate = {
            source: "import",
            name: "",
            tags: [],
            isTea: () => false,
            setTags(tags: unknown) {
                this.tags = normaliseRecipeTags(tags);
            },
        };
        expect(decorateImport(candidate, {
            recipeName: "Producer recipe",
            tags: [" Light ", "light"],
            colour: "#9FC3F0",
            coffee: {name: "Coffee", roast: "Medium", imageUrl: "https://example.test/coffee.jpg"},
        })).toBe(candidate);
        expect(candidate.name).toBe("Producer recipe");
        expect(candidate.tags).toEqual(["Light", "Medium"]);
        expect(candidate.accentIndex).toBe(0);
        expect(candidate.imageURL).toBe("https://example.test/coffee.jpg");
        expect(fillImportBlanks(candidate, {recipeName: "Replacement", tags: ["Dark"]})).toBe(false);
        expect(candidate.name).toBe("Producer recipe");
        expect(candidate.tags).toEqual(["Light", "Medium"]);
    } finally {
        jest.dontMock("@react-native/normalize-colors");
        jest.dontMock("../Recipe");
        jest.resetModules();
    }
});
