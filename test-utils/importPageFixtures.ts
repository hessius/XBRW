/** Synthetic fixtures, not snapshots of live recipes or producer metadata. */
export function importDetail() {
    return {
        result: "success",
        recipeVo: {
            adaptedModel: 1, theName: "Morning coffee", dose: 15, grandWater: 16,
            grinderSize: 54, isSetGrinderSize: 1, rpm: 90, cupType: 2,
            isEnableBypassWater: 1, bypassVolume: 30, bypassTemp: 92.77, pourCount: 3,
            podsVo: {
                id: "XB0001", theName: "Pod coffee", subtitle: "",
                imagePath: "https://images.example.test/pod.jpg"
            },
            shareRecipeLink: "https://share-h5.xbloom.com/?id=fixture%2Bid%3D",
            pourList: [
                {volume: 40, temperature: 93, flowRate: 3, pattern: 1, pausing: 30, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2},
                {volume: 120, temperature: 93, flowRate: 3.5, pattern: 2, pausing: 15, isEnableVibrationBefore: 1, isEnableVibrationAfter: 2},
                {volume: 80, temperature: 92, flowRate: 3, pattern: 3, pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 1}
            ]
        }
    };
}

export function fullImportURL(): URL {
    const url = new URL("https://preview.example.test/import");
    const fields = {
        v: "1", share: "https://share-h5.xbloom.com/?id=fixture%2Bid%3D", source: "brewmind",
        "recipe.name": "Producer's morning recipe",
        "recipe.url": "https://producer.example.test/recipe?one=1&two=2",
        "bean.name": "Bag coffee", "bean.roaster": "Example Roastery",
        "bean.image": "https://images.example.test/bag.jpg",
        "bean.url": "https://producer.example.test/coffee",
        "bean.origin": "East Africa", "bean.country": "Ethiopia", "bean.region": "Guji",
        "bean.farm": "Example Farm", "bean.farmer": "Example Farmer", "bean.elevation": "5900 ft",
        "bean.processing": "Natural", "bean.fermentation": "Anaerobic", "bean.variety": "Heirloom",
        "bean.beanMix": "Single Origin", "bean.roast": "Light", "bean.roastingDate": "2026-10-01",
        "bean.aromatics": "Stone fruit and jasmine", "bean.flavours": "Apricot,Jasmine",
        "bean.note": "A complete description.\nA second paragraph.", "bean.cupping_points": "86.5",
        "bean.decaffeinated": "0", "bean.rest_days": "0", "bean.peak_day": "14",
        "bean.best_until_day": "35", "bean.tags": "Morning,Filter", "bean.colour": "#338855",
        feed: "https://producer.example.test/feed.json", future: "Keep + / = % & Unicode é"
    };
    for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
    return url;
}
