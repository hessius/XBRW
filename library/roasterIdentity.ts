/** Saved coffee identity, without guessing aliases or removing accents. */
export function roasterKey(name: string): string {
    return name.trim().normalize("NFC").toLowerCase();
}
