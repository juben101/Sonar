import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

describe("Navbar", () => {
  it("renders the Sonar logo", () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
    expect(screen.getByText("Sonar")).toBeInTheDocument();
  });

  it("renders center label when provided", () => {
    render(
      <MemoryRouter>
        <Navbar centerLabel="My Library" />
      </MemoryRouter>
    );
    expect(screen.getByText("My Library")).toBeInTheDocument();
  });

  it("renders back button when showBack is true", () => {
    render(
      <MemoryRouter>
        <Navbar showBack backLabel="← Back" />
      </MemoryRouter>
    );
    expect(screen.getByText("← Back")).toBeInTheDocument();
  });

  it("renders custom right content", () => {
    render(
      <MemoryRouter>
        <Navbar rightContent={<button>Custom</button>} />
      </MemoryRouter>
    );
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("does not render back button when showBack is false", () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
    expect(screen.queryByText("← Back to Library")).not.toBeInTheDocument();
  });
});

describe("Footer", () => {
  it("renders the Sonar brand", () => {
    render(<Footer />);
    expect(screen.getByText("Sonar")).toBeInTheDocument();
  });

  it("renders product and company sections", () => {
    render(<Footer />);
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
  });

  it("renders copyright text", () => {
    render(<Footer />);
    expect(screen.getByText(/© 2026 Sonar/)).toBeInTheDocument();
  });
});
