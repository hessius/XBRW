import type {BrewSample, PlanStage} from "@/library/brew/BrewRecord";

export const teaPartialPlan: PlanStage[] = [
    {pourNumber: 1, volume: 90, temperature: 92, flowRate: 35,
        agitation: 0, pourPattern: 2, pauseTime: 45},
    {pourNumber: 2, volume: 90, temperature: 92, flowRate: 35,
        agitation: 0, pourPattern: 0, pauseTime: 60},
    {pourNumber: 3, volume: 90, temperature: 80, flowRate: 35,
        agitation: 0, pourPattern: 0, pauseTime: 90}
];

/**
 * Synthetic, anonymized compact landmarks of a partial three-steep recording,
 * not the full sample stream. Unsuitable for rate or stall estimation.
 * No terminal notifications are supplied; physical completeness is unknown.
 */
export const teaPartialSamples: BrewSample[] = [
    {at: 0, water: 0.775, cup: 0, pour: 1},
    {at: 25584, water: 90, cup: 0, pour: 1},
    {at: 70398, water: 90.675, cup: 0, pour: 1},
    {at: 84286, water: 139.8875, cup: 20.825000762939453, pour: 1},
    {at: 99252, water: 139.8875, cup: 103.73600006103516, pour: 1},
    {at: 99500, water: 139.8875, cup: 103.73600006103516, pour: 2},
    {at: 125422, water: 229.7875, cup: 186.81199645996094, pour: 2},
    {at: 185527, water: 230.5625, cup: 195.63600158691406, pour: 2},
    {at: 202330, water: 289.4625, cup: 247.51800537109375, pour: 2},
    {at: 202584, water: 290.2375, cup: 248.63099670410156, pour: 2}
];
