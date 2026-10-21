/**
 * Which xBloom this phone is driving.
 *
 * xBloom's endpoints partition on an `adaptedModel` discriminator, and the same
 * pod returns a different recipe under each: grind 55 on a Studio is grind 26
 * on an original xBloom for the same coffee. Only 1 and 2 return rows at all.
 *
 * The two grind scales do not convert. 918 paired recipes from the community
 * hub give a best linear fit of R^2 = 0.444, landing within two grind steps on
 * 20% of pairs, so nothing here or anywhere else may translate one into the
 * other. Where both are needed, both are fetched.
 *
 * Filed under `machine/` because it is about which machine this is, not about
 * talking to one: nothing here touches the radio, and its consumers are the
 * settings store and the xBloom HTTP clients.
 */
export const MACHINE_MODELS = ["studio", "original"] as const;

export type MachineModel = typeof MACHINE_MODELS[number];

/** xBloom's wire value for each model. */
export const ADAPTED_MODEL: Record<MachineModel, 1 | 2> = {
    studio:   1,
    original: 2
};

/**
 * xBloom's wire value, named so the request builders and the payload validator
 * can import it rather than each restating the pair.
 *
 * Derived from `ADAPTED_MODEL` rather than written out, so it cannot drift from
 * the mapping the way a hand-maintained union would.
 */
export type AdaptedModel = typeof ADAPTED_MODEL[MachineModel];

export function adaptedModelFor(model: MachineModel): AdaptedModel {
    return ADAPTED_MODEL[model];
}

export function isMachineModel(value: unknown): value is MachineModel {
    return typeof value === "string" &&
        (MACHINE_MODELS as readonly string[]).includes(value);
}

/**
 * Narrows an unchecked value to a `MachineModel`, falling back to the Studio.
 *
 * Needed because `SettingValue` widens a stored union back to `string`, so
 * `settings.get("machineModel")` can hand back anything a stale or hand-edited
 * row holds. Readers coerce through here rather than refusing, because there is
 * a correct answer to fall back on and refusing would turn an unreadable
 * preference into a broken feature.
 *
 * The guard above is the other half, and they are not interchangeable: reading
 * coerces, but *writing* a value that arrived in a backup uses `isMachineModel`
 * and ignores a bad one, because overwriting a good stored answer with a
 * default is a worse outcome than leaving it alone.
 *
 * The same shape as `asSortAxis` in `librarySort.ts`, for the same reason.
 */
export function asMachineModel(value: unknown): MachineModel {
    return isMachineModel(value) ? value : "studio";
}

/**
 * The model a machine's own serial names, or null when it names neither.
 *
 * The serial comes from the machine's 40521 info frame and starts with
 * xBloom's code for the model. Two Studios read on real hardware report
 * `J15A01D48H051` and `J15A02A45H038`, and xBloom's catalogue names its two
 * machines with the same codes: `machineList` is Studio `J15` and Original
 * `J20` (see `hubQuery.ts`). An Original's serial has never been read here, so
 * `J20` rests on that catalogue code alone.
 *
 * Only ever a positive match. Anything else is null, which means "the serial
 * does not say", never "so it must be the other one": the user's own choice
 * stays in charge then.
 */
const SERIAL_MODEL_CODES: readonly (readonly [string, MachineModel])[] = [
    ["J15", "studio"],
    ["J20", "original"]
];

export function modelFromSerial(serial: string): MachineModel | null {
    const code = serial.trim().toUpperCase().slice(0, 3);
    if (code.length < 3) return null;
    const match = SERIAL_MODEL_CODES.find(([prefix]) => prefix === code);
    return match === undefined ? null : match[1];
}
