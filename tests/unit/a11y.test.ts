// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

describe("Stitch accessibility smoke tests", () => {
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
});
