import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("App", () => {
  it("exibe login e abre o painel após autenticar", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/me") return jsonResponse({ error: "Não autenticado" }, 401);
      if (path === "/api/auth/login") return jsonResponse({ user: "admin" });
      if (path === "/api/databases") return jsonResponse([]);
      if (path.startsWith("/api/backups")) return jsonResponse([]);
      throw new Error(`URL inesperada: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const password = await screen.findByLabelText("Senha");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.change(screen.getByLabelText("Usuário"), {
      target: { value: "admin" },
    });
    fireEvent.change(password, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Painel de backups" })).toBeInTheDocument(),
    );
    expect(await screen.findByText("Nenhum banco cadastrado")).toBeInTheDocument();
  });
});
