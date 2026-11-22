import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import App, { queryClient } from "./App";
import { ApiError } from "./lib/api/client";

test("renders without crashing", () => {
  render(<App />);
  expect(document.body).toBeTruthy();
});

test("the production QueryClient does not retry a 404 ApiError", async () => {
  const queryFn = vi.fn().mockRejectedValue(new ApiError(404, "not found"));

  await expect(
    queryClient.fetchQuery({ queryKey: ["retry-policy-404-test"], queryFn }),
  ).rejects.toMatchObject({ status: 404 });

  expect(queryFn).toHaveBeenCalledTimes(1);
});
