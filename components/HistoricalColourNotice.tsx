import {Text} from "tamagui";
import {isValidColour} from "@/constants/colors";
import {useAppearance} from "@/hooks/useAppearance";
import {HISTORICAL_COLOUR_WARNING} from "@/library/brew/historicalColour";

export default function HistoricalColourNotice({accent}: {accent: string}) {
    const {palette} = useAppearance();
    return isValidColour(accent) ? null : (
        <Text color={palette.warn} fontSize={13}>{HISTORICAL_COLOUR_WARNING}</Text>
    );
}
