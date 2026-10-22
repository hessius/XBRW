declare module "@react-native/normalize-colors" {
    /** React Native's unsigned 0xRRGGBBAA value, or null for invalid input. */
    function normalizeColor(colour: unknown): number | null;
    export = normalizeColor;
}
