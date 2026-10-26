import {spawnSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {dirname, relative, resolve} from "node:path";
import ts from "typescript";

it("uploads the actual import endpoint runtime closure through the Vercel allowlist", () => {
    const root = resolve(__dirname, "../..");
    const pending = ["api/import.ts"];
    const files = new Set<string>();
    for (const file of pending) {
        if (files.has(file)) continue;
        files.add(file);
        const absolute = resolve(root, file);
        const source = ts.createSourceFile(file, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
        for (const statement of source.statements) {
            if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
            if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
            if (ts.isImportDeclaration(statement)) {
                const clause = statement.importClause;
                if (clause?.isTypeOnly) continue;
                if (!clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
                    && clause.namedBindings.elements.every(element => element.isTypeOnly)) continue;
            }
            if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const specifier = statement.moduleSpecifier.text;
            if (specifier.startsWith("node:")) continue;
            expect(specifier.startsWith(".")).toBe(true);
            const base = resolve(dirname(absolute), specifier);
            const dependency = [base + ".ts", base + ".tsx", resolve(base, "index.ts")]
                .find(candidate => existsSync(candidate));
            if (!dependency) throw new Error(`Unresolved server runtime import: ${file} -> ${specifier}`);
            pending.push(relative(root, dependency));
        }
    }
    const result = spawnSync("git", [
        "-c", `core.excludesFile=${resolve(root, ".vercelignore")}`,
        "check-ignore", "--no-index", "--stdin"
    ], {cwd: root, input: [...files].join("\n") + "\n", encoding: "utf8"});
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n").filter(Boolean)).toEqual([]);
    expect(result.status).toBe(1);
    const mobileOnly = ["app/index.tsx", "library/Recipe.ts", "library/NFC.ts", "constants/colors.ts"];
    const excluded = spawnSync("git", [
        "-c", `core.excludesFile=${resolve(root, ".vercelignore")}`,
        "check-ignore", "--no-index", "--stdin"
    ], {cwd: root, input: mobileOnly.join("\n") + "\n", encoding: "utf8"});
    expect(excluded.error).toBeUndefined();
    expect(excluded.status).toBe(0);
    expect(excluded.stdout.trim().split("\n")).toEqual(mobileOnly);
});

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
