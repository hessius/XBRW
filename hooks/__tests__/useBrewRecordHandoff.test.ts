import {act, renderHook} from "@testing-library/react-native";

import {useBrewRecordHandoff} from "@/hooks/useBrewRecordHandoff";
import {brew, samples} from "@/library/brew/handoff/__tests__/fixtures";

const mockSend = jest.fn();
jest.mock("@/hooks/useBrewHandoff", () => ({
    useBrewHandoff: () => ({send: mockSend, busy: false})
}));

describe("tea record handoff", () => {
    beforeEach(() => mockSend.mockReset());

    it.each([0, 4])("guards every send entry at rating %i before prerequisites or draft writes", async (rating) => {
        const judgement = {rating, note: "", rate: jest.fn(), annotate: jest.fn()};
        const {result} = await renderHook(() => useBrewRecordHandoff(
            {record: brew({beverageKind: "tea"}), samples}, null, judgement
        ));
        await act(async () => { result.current.setNoteDraft("unsaved"); });
        await act(async () => {
            result.current.requestSend();
            result.current.continueSend();
            await result.current.sendNow("Not coffee");
        });
        expect(result.current.namingBean).toBe(false);
        expect(result.current.ratingBeforeSend).toBe(false);
        expect(judgement.annotate).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
        await act(async () => {
            result.current.rateBrew(4);
            result.current.annotateBrew("Floral tea");
        });
        expect(judgement.rate).toHaveBeenCalledWith(4);
        expect(judgement.annotate).toHaveBeenCalledWith("Floral tea");
    });
});
