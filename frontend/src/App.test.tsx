import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renders without crashing", () => {
  render(<App />);
  expect(document.body).toBeTruthy();
});
