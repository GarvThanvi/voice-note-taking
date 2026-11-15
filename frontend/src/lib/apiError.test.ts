import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./apiError";

describe("getApiErrorMessage", () => {
  it("prefers the server's message from an axios error response", () => {
    const error = {
      message: "Request failed with status code 409",
      response: { status: 409, data: { success: false, message: "A label with that name already exists" } },
    };
    expect(getApiErrorMessage(error)).toBe("A label with that name already exists");
  });

  it("falls back to the error message when the response has none", () => {
    expect(getApiErrorMessage(new Error("Network Error"))).toBe("Network Error");
  });

  it("falls back to the caller's text for unknown values", () => {
    expect(getApiErrorMessage(null, "Could not save the label")).toBe("Could not save the label");
    expect(getApiErrorMessage({}, "Could not save the label")).toBe("Could not save the label");
  });

  it("ignores an empty server message", () => {
    expect(
      getApiErrorMessage({ message: "boom", response: { data: { message: "   " } } })
    ).toBe("boom");
  });
});
