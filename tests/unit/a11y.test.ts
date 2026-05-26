// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Lightweight stubs so client-only components can render in jsdom
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("Stitch accessibility smoke tests (WCAG AA)", () => {
  it("renders the button primitive without critical axe violations", async () => {
    const { container } = render(
      React.createElement(Button, { type: "button" }, "Save changes")
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("renders labeled form controls accessibly", async () => {
    const { container } = render(
      React.createElement(
        "form",
        null,
        React.createElement(Input, {
          label: "Phone number",
          type: "tel",
          hint: "South African mobile numbers only"
        })
      )
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("renders content cards without structural violations", async () => {
    const { container } = render(
      React.createElement(
        Card,
        { as: "section", "aria-label": "Profile summary" },
        React.createElement(CardHeader, {
          title: "Profile summary",
          description: "Customer-facing account overview"
        }),
        React.createElement("p", null, "Heita member")
      )
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("renders a navigation landmark list accessibly", async () => {
    const { container } = render(
      React.createElement(
        "nav",
        { "aria-label": "Main navigation" },
        React.createElement(
          "ul",
          null,
          React.createElement(
            "li",
            null,
            React.createElement("a", { href: "/" }, "Home")
          ),
          React.createElement(
            "li",
            null,
            React.createElement("a", { href: "/wallet" }, "Wallet")
          )
        )
      )
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("renders a status live region accessibly", async () => {
    const { container } = render(
      React.createElement(
        "div",
        {
          role: "status",
          "aria-live": "polite",
          "aria-label": "App update available"
        },
        React.createElement("p", null, "A new version of Heita is ready."),
        React.createElement(Button, { type: "button" }, "Refresh")
      )
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("renders an interactive search form accessibly", async () => {
    const { container } = render(
      React.createElement(
        "form",
        { role: "search", "aria-label": "Discover businesses" },
        React.createElement(Input, {
          name: "q",
          label: "Search businesses",
          type: "search",
          placeholder: "Name or suburb"
        }),
        React.createElement(Button, { type: "submit" }, "Search")
      )
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
