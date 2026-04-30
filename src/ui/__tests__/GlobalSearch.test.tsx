import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { GlobalSearch } from "../GlobalSearch";
import { useSimStore } from "../../state/store";

describe("GlobalSearch", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().reset();
    vi.useFakeTimers();
  });

  it("renders an input", () => {
    const { getByRole } = render(<GlobalSearch onJumpToLexicon={() => {}} />);
    const input = getByRole("searchbox");
    expect(input).toBeTruthy();
  });

  it("surfaces a hit for a seed meaning after debounce settles", () => {
    const { getByRole, container } = render(
      <GlobalSearch onJumpToLexicon={() => {}} />,
    );
    const input = getByRole("searchbox") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "water" } });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const hits = container.querySelectorAll(".global-search-hit");
    expect(hits.length).toBeGreaterThan(0);
    expect(
      Array.from(hits).some((h) => h.textContent?.includes("water")),
    ).toBe(true);
  });

  it("calls onJumpToLexicon when a hit is clicked", () => {
    const onJump = vi.fn();
    const { getByRole, container } = render(
      <GlobalSearch onJumpToLexicon={onJump} />,
    );
    act(() => {
      fireEvent.change(getByRole("searchbox"), { target: { value: "water" } });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const firstHit = container.querySelector(".global-search-hit");
    if (!firstHit) throw new Error("no hits to click");
    act(() => {
      fireEvent.click(firstHit);
    });
    expect(onJump).toHaveBeenCalled();
    expect(useSimStore.getState().selectedMeaning).toBe("water");
  });
});
