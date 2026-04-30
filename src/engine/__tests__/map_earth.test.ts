import { describe, it, expect } from "vitest";
import { generateEarthMap } from "../geo/map";

describe("Earth preset map — recognisable continent shapes", () => {
  const map = generateEarthMap();
  const land = map.cells.filter((c) => c.biome !== "ocean");

  it("has substantially more cells than the old 18×12 grid", () => {
    expect(map.cells.length).toBeGreaterThan(400);
  });

  it("land coverage falls in a sensible range", () => {
    const ratio = land.length / map.cells.length;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.6);
  });

  it("coastlines are tagged on land cells with ocean neighbours", () => {
    const coastCells = land.filter((c) => c.isCoast);
    expect(coastCells.length).toBeGreaterThan(0);
    for (const c of coastCells) {
      const hasOceanNb = c.neighbours.some((n) => map.cells[n]?.biome === "ocean");
      expect(hasOceanNb).toBe(true);
    }
  });

  it("the rough centroids of all 5 inhabited continents land on cells flagged as land", () => {
    const continentSpots = [
      { name: "north_america", x: 270, y: 180 },
      { name: "south_america", x: 350, y: 380 },
      { name: "africa",        x: 540, y: 320 },
      { name: "eurasia",       x: 600, y: 200 },
      { name: "australia",     x: 880, y: 440 },
    ];
    for (const spot of continentSpots) {
      let best = map.cells[0]!, bestD = Infinity;
      for (const cell of map.cells) {
        const dx = cell.centroid.x - spot.x;
        const dy = cell.centroid.y - spot.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = cell; }
      }
      expect(best.biome, `${spot.name} should land on a non-ocean cell`).not.toBe("ocean");
    }
  });

  it("the map has visible ocean separation between continents (no global landbridge)", () => {
    let oceanCount = 0;
    let totalCount = 0;
    for (let y = 100; y < 500; y += 30) {
      let best = map.cells[0]!, bestD = Infinity;
      for (const cell of map.cells) {
        const dx = cell.centroid.x - 400;
        const dy = cell.centroid.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = cell; }
      }
      totalCount++;
      if (best.biome === "ocean") oceanCount++;
    }
    expect(oceanCount).toBeGreaterThan(totalCount / 2);
  });
});
