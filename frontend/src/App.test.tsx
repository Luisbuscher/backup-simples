import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
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
      if (path === "/api/auth/login") return jsonResponse({
        user: { id: "user-1", firstName: "Ana", lastName: "Silva", email: "ana@example.com" },
      });
      if (path === "/api/databases") return jsonResponse([]);
      if (path.startsWith("/api/backups")) return jsonResponse([]);
      if (path === "/api/google/status") return jsonResponse({ connected: false, email: null, connectedAt: null });
      throw new Error(`URL inesperada: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const password = await screen.findByLabelText("Senha");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.change(password, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Painel de backups" })).toBeInTheDocument(),
    );
    expect(await screen.findByText("Nenhum banco cadastrado")).toBeInTheDocument();
  });

  it("permite criar conta com nome, sobrenome, e-mail e senha", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/me") return jsonResponse({ error: "Não autenticado" }, 401);
      if (path === "/api/auth/register") {
        return jsonResponse({ message: "Conta criada. Verifique seu e-mail para liberar o acesso." }, 201);
      }
      throw new Error(`URL inesperada: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Criar conta$/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Sobrenome"), { target: { value: "Silva" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-segura" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText(/Conta criada/)).toBeInTheDocument();
    const registerCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/auth/register");
    expect(registerCall).toBeDefined();
  });

  it("filtra os backups recentes por quantidade e banco", async () => {
    const database = {
      id: "625c730e-bfee-4333-8c84-03c8faf5cf50",
      name: "Produção",
      host: "db.example.com",
      port: 5432,
      databaseName: "app",
      username: "postgres",
      hasPassword: true,
      driveFolderId: null,
      schedule: { enabled: false, days: [], time: null },
      createdAt: "2026-09-13T10:00:00.000Z",
      updatedAt: "2026-09-13T10:00:00.000Z",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/me") {
        return jsonResponse({
          user: { id: "user-1", firstName: "Ana", lastName: "Silva", email: "ana@example.com" },
        });
      }
      if (path === "/api/databases") return jsonResponse([database]);
      if (path.startsWith("/api/backups")) return jsonResponse([]);
      if (path === "/api/google/status") {
        return jsonResponse({ connected: false, email: null, connectedAt: null });
      }
      throw new Error(`URL inesperada: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const quantity = await screen.findByLabelText("Quantidade");
    expect(quantity).toHaveValue("10");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backups?limit=10",
        expect.anything(),
      ),
    );

    fireEvent.change(quantity, { target: { value: "25" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backups?limit=25",
        expect.anything(),
      ),
    );

    fireEvent.change(screen.getByLabelText("Banco"), {
      target: { value: database.id },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/backups?limit=25&databaseId=${database.id}`,
        expect.anything(),
      ),
    );
  });
});
