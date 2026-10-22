import {roasterKey} from "@/library/roasterIdentity";

describe("roaster identity", () => {
    it("trims, canonicalises Unicode and folds non-ASCII case", () => {
        expect(roasterKey(" CAFÉ ")).toBe("café");
        expect(roasterKey(" CAFÉ ")).toBe(roasterKey("cafe\u0301"));
        expect(roasterKey("ÖLAND")).toBe(roasterKey("öland"));
        expect(roasterKey("  ")).toBe("");
    });

    it("does not guess aliases or strip punctuation or accents", () => {
        expect(roasterKey("Acme")).not.toBe(roasterKey("Acme Coffee"));
        expect(roasterKey("Café")).not.toBe(roasterKey("Cafe"));
        expect(roasterKey("A & B")).not.toBe(roasterKey("A B"));
    });
});
