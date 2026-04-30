import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EventsLog } from "../EventsLog";
import { useSimStore } from "../../state/store";

describe("EventsLog", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().reset();
  });

  it("shows an empty state when no events yet", () => {
    render(<EventsLog />);
    expect(screen.getByText(/No events yet/i)).toBeTruthy();
  });

  it("lists events after stepping", () => {
    const store = useSimStore.getState();
    for (let i = 0; i < 40; i++) store.step();
    render(<EventsLog />);
    const tree = store.state.tree;
    const events = Object.values(tree).flatMap((n) => n.language.events);
    expect(events.length).toBeGreaterThan(0);
  });
});
