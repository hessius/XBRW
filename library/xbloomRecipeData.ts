import Pour, {POUR_PATTERN} from "./Pour";
import {CUP_TYPE, GRINDER_OFF_VALUE, ratioForVolumes, type RecipeSource} from "./recipeIdentity";
import {podCoffeeFromPodsVo, podImageUrl, type PodCoffee} from "./podCoffee";
import {clampCelsius, normaliseCelsius} from "./units";
import {BYPASS_DEFAULT_TEMPERATURE, BYPASS_TEMPERATURE, BYPASS_VOLUME} from "./bypassLimits";

export type XBloomRecipeData = {
    dosage: number;
    ratio: number;
    grindSize: number;
    grindRPM: number;
    grinder: boolean;
    cupType: number;
    defaultCups: number;
    pours: Pour[];
    bypassEnabled: boolean;
    bypassVolume: number;
    bypassTemp: number;
    xbloomName: string;
    xid: string;
    source: RecipeSource;
    imageURL?: string;
    coffee?: PodCoffee;
    sharedBy?: string;
    sharedByAvatar?: string;
};

export class InvalidImportDataError extends Error {
    constructor() {
        super("Invalid recipe data");
    }
}

export function recordOf(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new InvalidImportDataError();
    }
    return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new InvalidImportDataError();
    return value;
}

export function xbloomTitle(name: string, subtitle: string): string {
    const visibleSubtitle = subtitle.includes("\u660E") && subtitle.includes("\u8C26") ? "" : subtitle;
    return name.length > 0 && visibleSubtitle.length > 0 ? name + " | " + visibleSubtitle : name;
}

/** The importer field mapping, without Recipe's native dependencies or card serialization. */
export function normaliseXBloomRecipe(detail: unknown, titleOverride?: string): XBloomRecipeData {
    const root = recordOf(detail);
    const row = recordOf(root.recipeVo);
    const pods = row.podsVo == null ? undefined : recordOf(row.podsVo);
    const dosage = finiteNumber(row.dose);
    const grindSize = finiteNumber(row.grinderSize ?? GRINDER_OFF_VALUE);
    const grinderFlag = row.isSetGrinderSize ?? 2;
    const rawCup = finiteNumber(row.cupType ?? 1);
    const cupType = rawCup === 2 ? CUP_TYPE.OMNI : rawCup === 3 ? CUP_TYPE.OTHER
        : rawCup === 4 ? CUP_TYPE.TEA : CUP_TYPE.XPOD;
    const tea = cupType === CUP_TYPE.TEA;
    const count = finiteNumber(row.pourCount);
    if (!Number.isInteger(count) || count < 0 || !Array.isArray(row.pourList) || count > row.pourList.length) {
        throw new InvalidImportDataError();
    }
    const pours: Pour[] = [];
    for (let index = 0; index < count; index++) {
        const stage = recordOf(row.pourList[index]);
        const rawVolume = finiteNumber(stage.volume);
        const pattern = stage.pattern === 1 ? POUR_PATTERN.CENTERED
            : stage.pattern === 2 ? POUR_PATTERN.SPIRAL : POUR_PATTERN.CIRCULAR;
        const pour = new Pour(
            index + 1, tea && rawVolume > 90 ? 90 : rawVolume,
            clampCelsius(Math.round(finiteNumber(stage.temperature))),
            finiteNumber(stage.flowRate) * 10, 0, pattern, finiteNumber(stage.pausing)
        );
        pour.setAgitationAfter(stage.isEnableVibrationAfter === 1);
        pour.setAgitationBefore(stage.isEnableVibrationBefore === 1);
        pours.push(pour);
    }
    const rawVolume = row.bypassVolume;
    const rawTemp = row.bypassTemp;
    const validVolume = typeof rawVolume === "number" && Number.isFinite(rawVolume)
        && rawVolume >= BYPASS_VOLUME.min && rawVolume <= BYPASS_VOLUME.max;
    const validTemp = typeof rawTemp === "number" && Number.isFinite(rawTemp)
        && rawTemp >= BYPASS_TEMPERATURE.min && rawTemp <= BYPASS_TEMPERATURE.max;
    const coffee = podCoffeeFromPodsVo(row.podsVo) ?? undefined;
    const artwork = coffee?.imageUrl ?? podImageUrl(pods?.imagePath);
    const avatar = podImageUrl(root.shareMemberHead);
    return {
        dosage, ratio: ratioForVolumes(pours.map(pour => pour.volume), dosage), grindSize,
        grindRPM: typeof row.rpm === "number" && row.rpm >= 60 && row.rpm <= 120 ? row.rpm : 120,
        grinder: grinderFlag !== 2 && grindSize !== GRINDER_OFF_VALUE,
        cupType, defaultCups: tea ? count : 0, pours,
        bypassEnabled: validVolume && row.isEnableBypassWater === 1 && !tea,
        bypassVolume: validVolume ? rawVolume : 0,
        bypassTemp: validVolume && validTemp ? normaliseCelsius(rawTemp) : BYPASS_DEFAULT_TEMPERATURE,
        xbloomName: titleOverride ?? xbloomTitle(
            typeof row.theName === "string" ? row.theName : "",
            typeof pods?.subtitle === "string" ? pods.subtitle : ""
        ),
        xid: typeof pods?.id === "string" ? pods.id : "", source: "import",
        ...(coffee !== undefined ? {coffee} : {}),
        ...(artwork !== undefined ? {imageURL: artwork} : {}),
        ...(typeof root.shareMemberName === "string" ? {sharedBy: root.shareMemberName} : {}),
        ...(avatar !== undefined ? {sharedByAvatar: avatar} : {})
    };
}
