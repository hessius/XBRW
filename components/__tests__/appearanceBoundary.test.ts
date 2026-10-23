import {readdirSync, readFileSync} from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(__dirname, "../..");
const banned = new Set(["palette", "onAccent", "switchColours", "onBrand", "primary"]);

function sources(directory: string): string[] {
    return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        if (entry.name === "__tests__") return [];
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? sources(file)
            : /\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file) ? [file] : [];
    });
}

function parse(file: string) {
    return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

it("has no frozen presentation imports outside fixed branded launch artwork", () => {
    const violations: string[] = [];
    for (const directory of ["app", "components", "hooks"]) {
        for (const file of sources(path.join(root, directory))) {
            const relative = path.relative(root, file).split(path.sep).join("/");
            // The launch overlay deliberately retains the fixed branded launch colours.
            if (relative === "components/SplashOverlay.tsx") continue;
            for (const statement of parse(file).statements) {
                if (!ts.isImportDeclaration(statement) ||
                    !ts.isStringLiteral(statement.moduleSpecifier) ||
                    statement.moduleSpecifier.text !== "@/constants/colors" ||
                    statement.importClause?.isTypeOnly) continue;
                const bindings = statement.importClause?.namedBindings;
                if (bindings && ts.isNamespaceImport(bindings)) {
                    violations.push(`${relative}: namespace constants/colors`);
                } else if (bindings && ts.isNamedImports(bindings)) {
                    for (const entry of bindings.elements) {
                        if (!entry.isTypeOnly && banned.has((entry.propertyName ?? entry.name).text)) {
                            violations.push(`${relative}: ${(entry.propertyName ?? entry.name).text}`);
                        }
                    }
                }
            }
        }
    }
    expect(violations.sort()).toEqual([]);
});

it.each(["library/brew/traceStyle.ts", "constants/colors.ts"])(
    "keeps any reference colours in %s as factories with required explicit Appearance", file => {
        const source = parse(path.join(root, file));
        for (const name of ["referenceCupColour", "referenceWaterColour"]) {
            const declaredFunction = source.statements.find(statement =>
                ts.isFunctionDeclaration(statement) && statement.name?.text === name);
            const declaration = source.statements
                .filter(ts.isVariableStatement)
                .flatMap(statement => [...statement.declarationList.declarations])
                .find(entry => ts.isIdentifier(entry.name) && entry.name.text === name);
            const factory = declaredFunction ?? declaration?.initializer;
            // These factories live in traceStyle; a new legacy export in colors
            // must obey the same explicit-input contract, never freeze a string.
            if (file === "constants/colors.ts" && !factory) continue;
            expect(factory && (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory) ||
                ts.isFunctionDeclaration(factory))).toBe(true);
            if (!factory || !(ts.isArrowFunction(factory) || ts.isFunctionExpression(factory) ||
                ts.isFunctionDeclaration(factory))) continue;
            expect(factory.parameters).toHaveLength(1);
            const parameter = factory.parameters[0];
            expect(parameter.questionToken).toBeUndefined();
            expect(parameter.initializer).toBeUndefined();
            expect(parameter.type?.getText(source)).toBe("Appearance");
        }
    }
);
