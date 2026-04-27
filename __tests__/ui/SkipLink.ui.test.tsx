/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkipLink } from "@/components/ui/SkipLink";

describe("SkipLink", () => {
  it("apunta al main-content por default", () => {
    render(<SkipLink />);
    const a = screen.getByRole("link", { name: /saltar al contenido/i });
    expect(a).toHaveAttribute("href", "#main-content");
  });

  it("permite override de targetId y children", () => {
    render(<SkipLink targetId="custom">Otro destino</SkipLink>);
    const a = screen.getByRole("link", { name: /otro destino/i });
    expect(a).toHaveAttribute("href", "#custom");
  });
});
