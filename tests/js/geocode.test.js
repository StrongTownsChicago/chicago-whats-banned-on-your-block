import { describe, it, expect, vi, afterEach } from "vitest";
import { geocodeAddress } from "../../js/geocode.js";

// =====================================================================
// Fixtures
// =====================================================================

const MOCK_MAPBOX_RESPONSE = {
  features: [
    {
      center: [-87.6667, 41.8827],
      place_name:
        "123 N State St, Chicago, Illinois 60601, United States",
    },
  ],
};

const TEST_TOKEN = "pk.test_token_123";

// =====================================================================
// Helper: mock fetch with a given resolved value
// =====================================================================

function mockFetchSuccess(body) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    })
  );
}

function mockFetchFailure(status = 401) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
    })
  );
}

function mockFetchNetworkError() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Network error"))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// =====================================================================
// geocodeAddress tests
// =====================================================================

describe("geocodeAddress", () => {
  it("returns lngLat and placeName on a successful response", async () => {
    mockFetchSuccess(MOCK_MAPBOX_RESPONSE);
    const result = await geocodeAddress("123 N State St", TEST_TOKEN);

    expect(result).not.toBeNull();
    expect(result.lngLat).toEqual([-87.6667, 41.8827]);
    expect(result.placeName).toBe(
      "123 N State St, Chicago, Illinois 60601, United States"
    );
  });

  it("returns null when features array is empty", async () => {
    mockFetchSuccess({ features: [] });
    const result = await geocodeAddress("Nonexistent Street", TEST_TOKEN);
    expect(result).toBeNull();
  });

  it("returns null on a network error (no unhandled rejection)", async () => {
    mockFetchNetworkError();
    const result = await geocodeAddress("1600 N Milwaukee Ave", TEST_TOKEN);
    expect(result).toBeNull();
  });

  it("returns null on a non-200 HTTP response", async () => {
    mockFetchFailure(401);
    const result = await geocodeAddress("anything", TEST_TOKEN);
    expect(result).toBeNull();
  });

  it("includes the Chicago bbox in the request URL", async () => {
    mockFetchSuccess(MOCK_MAPBOX_RESPONSE);
    await geocodeAddress("1600 N Milwaukee Ave", TEST_TOKEN);

    const calledUrl = vi.mocked(fetch).mock.calls[0][0];
    expect(calledUrl).toContain("bbox=-88.0");
  });

  it("includes the access token in the request URL", async () => {
    mockFetchSuccess(MOCK_MAPBOX_RESPONSE);
    await geocodeAddress("1600 N Milwaukee Ave", TEST_TOKEN);

    const calledUrl = vi.mocked(fetch).mock.calls[0][0];
    expect(calledUrl).toContain(`access_token=${TEST_TOKEN}`);
  });

  it("URL-encodes spaces in the address", async () => {
    mockFetchSuccess(MOCK_MAPBOX_RESPONSE);
    await geocodeAddress("1600 N Milwaukee Ave", TEST_TOKEN);

    const calledUrl = vi.mocked(fetch).mock.calls[0][0];
    // encodeURIComponent replaces spaces with %20
    expect(calledUrl).toContain("1600%20N%20Milwaukee%20Ave");
  });
});
