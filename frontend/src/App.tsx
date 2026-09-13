import {
  CalendarDays,
  CheckCircle2,
  Cloud,
  Clock3,
  Database,
  LoaderCircle,
  LogOut,
  Pencil,
  Play,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError } from "./api";
import type {
  BackupRun,
  AuthUser,
  DatabasePayload,
  DatabaseTarget,
  GoogleDriveStatus,
  WeekDay,
} from "./types";

const DAYS: { value: WeekDay; short: string; long: string }[] = [
  { value: "mon", short: "Seg", long: "Segunda" },
  { value: "tue", short: "Ter", long: "Terça" },
  { value: "wed", short: "Qua", long: "Quarta" },
  { value: "thu", short: "Qui", long: "Quinta" },
  { value: "fri", short: "Sex", long: "Sexta" },
  { value: "sat", short: "Sáb", long: "Sábado" },
  { value: "sun", short: "Dom", long: "Domingo" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado";
}

export function App() {
  const [session, setSession] = useState<AuthUser | "loading" | null>("loading");

  useEffect(() => {
    api<{ user: AuthUser }>("/api/auth/me")
      .then(({ user }) => setSession(user))
      .catch(() => setSession(null));
  }, []);

  if (session === "loading") return <PageLoader />;
  if (!session) {
    return <Login onAuthenticated={setSession} />;
  }
  return <Dashboard user={session} onLoggedOut={() => setSession(null)} />;
}

function PageLoader() {
  return (
    <main className="page-loader" aria-label="Carregando aplicação">
      <div className="brand-mark">
        <img
          className="brand-logo"
          src="/logo-backup-simples.png"
          alt=""
          aria-hidden="true"
        />
      </div>
      <LoaderCircle className="spin" size={24} />
    </main>
  );
}

function Login({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("email-confirmed");
    if (value === "1") return "E-mail confirmado. Sua conta está pronta para entrar.";
    if (value === "error") return "O link de confirmação é inválido ou expirou.";
    return "";
  });
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setCanResend(false);
    try {
      if (mode === "register") {
        const result = await api<{ message: string }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ firstName, lastName, email, password }),
        });
        setSuccess(result.message);
        setPassword("");
        return;
      }
      const result = await api<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setCanResend(requestError instanceof ApiError && requestError.status === 403);
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ message: string }>("/api/auth/resend-confirmation", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSuccess(result.message);
      setCanResend(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-intro">
          <div className="brand-line">
            <div className="brand-mark brand-mark-light">
              <img
                className="brand-logo"
                src="/logo-backup-simples.png"
                alt=""
                aria-hidden="true"
              />
            </div>
            <span>Backup Simples</span>
          </div>
          <div>
            <p className="eyebrow">POSTGRESQL + GOOGLE DRIVE</p>
            <h1>Seus backups, organizados e sob controle.</h1>
            <p>
              Cadastre bancos, defina horários e acompanhe cada execução em um
              único painel.
            </p>
          </div>
          <div className="secure-note">
            <ShieldCheck size={20} />
            <span>Dados isolados e protegidos por conta</span>
          </div>
        </div>

        <div className="login-form-panel">
          <form onSubmit={submit} className="login-form">
            <div>
              <p className="eyebrow eyebrow-dark">
                {mode === "login" ? "ACESSO SEGURO" : "NOVA CONTA"}
              </p>
              <h2>{mode === "login" ? "Entre no painel" : "Crie sua conta"}</h2>
              <p className="muted">
                {mode === "login"
                  ? "Use seu e-mail e senha para continuar."
                  : "Enviaremos uma confirmação para o seu e-mail."}
              </p>
            </div>
            {error && <Alert>{error}</Alert>}
            {success && <div className="success-alert">{success}</div>}
            {canResend && (
              <button
                type="button"
                className="button button-secondary button-wide"
                onClick={resendConfirmation}
                disabled={loading || !email}
              >
                Reenviar e-mail de confirmação
              </button>
            )}
            {mode === "register" && (
              <div className="name-grid">
                <label>
                  Nome
                  <input
                    autoFocus
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  Sobrenome
                  <input
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
              </div>
            )}
            <label>
              E-mail
              <input
                autoFocus={mode === "login"}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "register" ? 8 : undefined}
              />
            </label>
            <button className="button button-primary button-wide" disabled={loading}>
              {loading && <LoaderCircle className="spin" size={18} />}
              {loading
                ? mode === "login" ? "Entrando..." : "Criando..."
                : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
            <button
              type="button"
              className="auth-switch"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setSuccess("");
                setPassword("");
              }}
            >
              {mode === "login"
                ? "Ainda não tem conta? Criar conta"
                : "Já tem uma conta? Entrar"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Dashboard({
  user,
  onLoggedOut,
}: {
  user: AuthUser;
  onLoggedOut: () => void;
}) {
  const [databases, setDatabases] = useState<DatabaseTarget[]>([]);
  const [backups, setBackups] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(() => {
    const googleResult = new URLSearchParams(window.location.search).get("google");
    if (googleResult === "error") return "Não foi possível conectar o Google Drive. Tente novamente.";
    return "";
  });
  const [editing, setEditing] = useState<DatabaseTarget | "new" | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [drive, setDrive] = useState<GoogleDriveStatus>({
    connected: false,
    email: null,
    connectedAt: null,
  });
  const [driveBusy, setDriveBusy] = useState(false);

  const loadData = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const [databaseData, backupData, driveData] = await Promise.all([
          api<DatabaseTarget[]>("/api/databases"),
          api<BackupRun[]>("/api/backups?limit=50"),
          api<GoogleDriveStatus>("/api/google/status"),
        ]);
        setDatabases(databaseData);
        setBackups(backupData);
        setDrive(driveData);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onLoggedOut();
          return;
        }
        setMessage(errorMessage(error));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [onLoggedOut],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const hasRunning = backups.some((backup) => backup.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => void loadData(true), 4_000);
    return () => window.clearInterval(timer);
  }, [hasRunning, loadData]);

  const activeSchedules = databases.filter(
    (database) => database.schedule.enabled,
  ).length;
  const lastSuccessful = backups.find((backup) => backup.status === "success");

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    onLoggedOut();
  }

  async function runBackup(database: DatabaseTarget) {
    setBusyIds((current) => new Set(current).add(database.id));
    setMessage("");
    try {
      await api(`/api/databases/${database.id}/backups`, { method: "POST" });
      await loadData(true);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(database.id);
        return next;
      });
    }
  }

  async function connectDrive() {
    setDriveBusy(true);
    setMessage("");
    try {
      const { url } = await api<{ url: string }>("/api/google/connect", {
        method: "POST",
      });
      window.location.assign(url);
    } catch (error) {
      setMessage(errorMessage(error));
      setDriveBusy(false);
    }
  }

  async function disconnectDrive() {
    if (!window.confirm("Desconectar o Google Drive? Os agendamentos não poderão executar até uma nova conexão.")) return;
    setDriveBusy(true);
    try {
      await api("/api/google/connection", { method: "DELETE" });
      await loadData(true);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setDriveBusy(false);
    }
  }

  async function removeDatabase(database: DatabaseTarget) {
    if (
      !window.confirm(
        `Remover "${database.name}"? O histórico de backups será preservado.`,
      )
    ) {
      return;
    }
    setBusyIds((current) => new Set(current).add(database.id));
    setMessage("");
    try {
      await api(`/api/databases/${database.id}`, { method: "DELETE" });
      await loadData(true);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(database.id);
        return next;
      });
    }
  }

  const runningDatabaseIds = useMemo(
    () =>
      new Set(
        backups
          .filter((backup) => backup.status === "running")
          .map((backup) => backup.databaseId)
          .filter(Boolean),
      ),
    [backups],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-line brand-line-dark">
          <div className="brand-mark">
            <img
              className="brand-logo"
              src="/logo-backup-simples.png"
              alt=""
              aria-hidden="true"
            />
          </div>
          <div>
            <strong>Backup Simples</strong>
            <span>PostgreSQL</span>
          </div>
        </div>
        <button className="button button-quiet" onClick={logout}>
          <LogOut size={17} />
          <span>{user.firstName} · Sair</span>
        </button>
      </header>

      <main className="dashboard">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow eyebrow-dark">VISÃO GERAL</p>
            <h1>Painel de backups</h1>
            <p className="muted">
              Gerencie conexões e acompanhe as execuções mais recentes.
            </p>
          </div>
          <button
            className="button button-primary"
            onClick={() => setEditing("new")}
          >
            <Plus size={18} />
            Novo banco
          </button>
        </div>

        {message && (
          <Alert onClose={() => setMessage("")}>{message}</Alert>
        )}

        <section className={`drive-card ${drive.connected ? "drive-connected" : ""}`}>
          <div className="drive-card-icon"><Cloud size={23} /></div>
          <div className="drive-card-copy">
            <strong>{drive.connected ? "Google Drive conectado" : "Conecte seu Google Drive"}</strong>
            <span>
              {drive.connected
                ? `${drive.email ?? "Conta Google"} · backups enviados para a pasta Backup Simples`
                : "Autorize sua conta para executar backups manuais e agendados."}
            </span>
          </div>
          {drive.connected ? (
            <div className="drive-card-actions">
              <button
                className="button button-secondary"
                disabled={driveBusy}
                onClick={connectDrive}
              >
                {driveBusy && <LoaderCircle className="spin" size={17} />}
                Reconectar
              </button>
              <button
                className="button button-quiet"
                disabled={driveBusy}
                onClick={disconnectDrive}
              >
                Desconectar
              </button>
            </div>
          ) : (
            <button className="button button-primary" disabled={driveBusy} onClick={connectDrive}>
              {driveBusy && <LoaderCircle className="spin" size={17} />}
              Conectar Google Drive
            </button>
          )}
        </section>

        <section className="stats-grid" aria-label="Resumo">
          <StatCard
            icon={<Database size={21} />}
            label="Bancos cadastrados"
            value={String(databases.length)}
          />
          <StatCard
            icon={<CalendarDays size={21} />}
            label="Agendas ativas"
            value={String(activeSchedules)}
          />
          <StatCard
            icon={<CheckCircle2 size={21} />}
            label="Último sucesso"
            value={lastSuccessful ? relativeDate(lastSuccessful.finishedAt) : "—"}
            compact
          />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Bancos cadastrados</h2>
              <p>Conexões disponíveis para backup.</p>
            </div>
          </div>
          {loading ? (
            <SectionLoader />
          ) : databases.length === 0 ? (
            <EmptyState
              icon={<Database size={25} />}
              title="Nenhum banco cadastrado"
              text="Cadastre sua primeira conexão para começar."
              action={
                <button
                  className="button button-primary"
                  onClick={() => setEditing("new")}
                >
                  <Plus size={18} /> Cadastrar banco
                </button>
              }
            />
          ) : (
            <div className="database-list">
              {databases.map((database) => {
                const running = runningDatabaseIds.has(database.id);
                const busy = busyIds.has(database.id);
                return (
                  <article className="database-row" key={database.id}>
                    <div className="database-identity">
                      <div className="database-icon">
                        <Server size={20} />
                      </div>
                      <div>
                        <strong>{database.name}</strong>
                        <span>
                          {database.host}:{database.port} / {database.databaseName}
                        </span>
                      </div>
                    </div>
                    <div className="database-meta">
                      <span className="meta-label">Agenda</span>
                      <span>
                        {database.schedule.enabled
                          ? scheduleLabel(database)
                          : "Somente manual"}
                      </span>
                    </div>
                    <div className="database-meta folder-meta">
                      <span className="meta-label">Google Drive</span>
                      <span>
                        <Cloud size={14} />
                        {database.driveFolderId
                          ? "Pasta específica"
                          : "Pasta Backup Simples"}
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        className="button button-secondary"
                        onClick={() => runBackup(database)}
                        disabled={running || busy || !drive.connected}
                        title="Executar backup agora"
                      >
                        {running || busy ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Play size={17} />
                        )}
                        <span>{running ? "Executando" : "Executar"}</span>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Editar ${database.name}`}
                        onClick={() => setEditing(database)}
                        disabled={busy}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="icon-button icon-button-danger"
                        aria-label={`Remover ${database.name}`}
                        onClick={() => removeDatabase(database)}
                        disabled={running || busy}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Backups recentes</h2>
              <p>Últimas 50 execuções registradas.</p>
            </div>
          </div>
          {loading ? (
            <SectionLoader />
          ) : backups.length === 0 ? (
            <EmptyState
              icon={<Clock3 size={25} />}
              title="Ainda não há backups"
              text="As execuções manuais e agendadas aparecerão aqui."
            />
          ) : (
            <BackupTable backups={backups} />
          )}
        </section>
      </main>

      {editing && (
        <DatabaseModal
          database={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadData(true);
          }}
        />
      )}
    </div>
  );
}

function DatabaseModal({
  database,
  onClose,
  onSaved,
}: {
  database: DatabaseTarget | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<DatabasePayload>({
    name: database?.name ?? "",
    host: database?.host ?? "",
    port: database?.port ?? 5432,
    database: database?.databaseName ?? "",
    username: database?.username ?? "",
    password: "",
    driveFolderId: database?.driveFolderId ?? "",
    schedule: {
      enabled: database?.schedule.enabled ?? false,
      days: database?.schedule.days ?? [],
      time: database?.schedule.time ?? "02:00",
    },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField<K extends keyof DatabasePayload>(
    key: K,
    value: DatabasePayload[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleDay(day: WeekDay) {
    const days = form.schedule.days.includes(day)
      ? form.schedule.days.filter((item) => item !== day)
      : [...form.schedule.days, day];
    setField("schedule", { ...form.schedule, days });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (form.schedule.enabled && form.schedule.days.length === 0) {
      setError("Selecione ao menos um dia para o agendamento.");
      return;
    }

    setSaving(true);
    try {
      const payload: DatabasePayload = {
        ...form,
        driveFolderId: form.driveFolderId?.trim() || null,
        schedule: {
          ...form.schedule,
          time: form.schedule.enabled ? form.schedule.time : null,
        },
      };
      if (database && !payload.password) delete payload.password;
      await api(database ? `/api/databases/${database.id}` : "/api/databases", {
        method: database ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await onSaved();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow eyebrow-dark">
              {database ? "EDITAR CONEXÃO" : "NOVA CONEXÃO"}
            </p>
            <h2 id="database-modal-title">
              {database ? database.name : "Cadastrar banco"}
            </h2>
          </div>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <form onSubmit={submit}>
          {error && <Alert>{error}</Alert>}
          <fieldset>
            <legend>Identificação e acesso</legend>
            <div className="form-grid">
              <label className="field-span-2">
                Nome de exibição
                <input
                  autoFocus
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Produção"
                  required
                  maxLength={120}
                />
              </label>
              <label className="field-grow">
                Host
                <input
                  value={form.host}
                  onChange={(event) => setField("host", event.target.value)}
                  placeholder="db.exemplo.com"
                  required
                  maxLength={255}
                />
              </label>
              <label className="field-port">
                Porta
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(event) => setField("port", Number(event.target.value))}
                  required
                />
              </label>
              <label>
                Banco
                <input
                  value={form.database}
                  onChange={(event) => setField("database", event.target.value)}
                  placeholder="minha_aplicacao"
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Usuário
                <input
                  value={form.username}
                  onChange={(event) => setField("username", event.target.value)}
                  placeholder="postgres"
                  required
                  maxLength={120}
                />
              </label>
              <label className="field-span-2">
                Senha
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setField("password", event.target.value)}
                  placeholder={database ? "Deixe em branco para manter" : ""}
                  required={!database}
                  maxLength={1024}
                />
                {database && (
                  <span className="field-help">
                    A senha atual não é exibida. Preencha apenas para substituí-la.
                  </span>
                )}
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Destino no Google Drive</legend>
            <label>
              ID da pasta (opcional)
              <input
                value={form.driveFolderId ?? ""}
                onChange={(event) =>
                  setField("driveFolderId", event.target.value)
                }
                placeholder="Vazio: usar a pasta Backup Simples"
                maxLength={255}
              />
              <span className="field-help">
                Encontre o ID depois de <strong>/folders/</strong> na URL do
                Google Drive. A conta conectada precisa ter permissão para
                adicionar arquivos nessa pasta. Se a conexão for anterior a
                esta opção, use <strong>Reconectar</strong> no painel.
              </span>
            </label>
          </fieldset>

          <fieldset>
            <legend>Agendamento</legend>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={form.schedule.enabled}
                onChange={(event) =>
                  setField("schedule", {
                    ...form.schedule,
                    enabled: event.target.checked,
                  })
                }
              />
              <span className="toggle" aria-hidden="true" />
              <span>
                <strong>Ativar backup agendado</strong>
                <small>Executar automaticamente nos dias selecionados.</small>
              </span>
            </label>
            {form.schedule.enabled && (
              <div className="schedule-fields">
                <div>
                  <span className="field-label">Dias da semana</span>
                  <div className="day-picker">
                    {DAYS.map((day) => (
                      <button
                        type="button"
                        key={day.value}
                        className={
                          form.schedule.days.includes(day.value) ? "selected" : ""
                        }
                        aria-pressed={form.schedule.days.includes(day.value)}
                        title={day.long}
                        onClick={() => toggleDay(day.value)}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="time-field">
                  Horário
                  <input
                    type="time"
                    value={form.schedule.time ?? "02:00"}
                    onChange={(event) =>
                      setField("schedule", {
                        ...form.schedule,
                        time: event.target.value,
                      })
                    }
                    required
                  />
                </label>
              </div>
            )}
          </fieldset>

          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={onClose}>
              Cancelar
            </button>
            <button className="button button-primary" disabled={saving}>
              {saving && <LoaderCircle className="spin" size={17} />}
              {saving ? "Salvando..." : "Salvar banco"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BackupTable({ backups }: { backups: BackupRun[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Banco</th>
            <th>Início</th>
            <th>Origem</th>
            <th>Arquivo / detalhe</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.id}>
              <td>
                <strong>{backup.databaseName}</strong>
              </td>
              <td className="nowrap">{formatDate(backup.startedAt)}</td>
              <td>{backup.trigger === "manual" ? "Manual" : "Agendado"}</td>
              <td>
                <span className="file-name">{backup.fileName}</span>
                {backup.errorMessage && (
                  <span className="error-detail" title={backup.errorMessage}>
                    {backup.errorMessage}
                  </span>
                )}
              </td>
              <td>
                <StatusBadge status={backup.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: BackupRun["status"] }) {
  const content = {
    running: { icon: <LoaderCircle className="spin" />, text: "Em andamento" },
    success: { icon: <CheckCircle2 />, text: "Concluído" },
    error: { icon: <XCircle />, text: "Erro" },
  }[status];
  return (
    <span className={`status status-${status}`}>
      {content.icon}
      {content.text}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong className={compact ? "compact-value" : ""}>{value}</strong>
      </div>
    </article>
  );
}

function Alert({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="alert" role="alert">
      <XCircle size={18} />
      <span>{children}</span>
      {onClose && (
        <button aria-label="Fechar aviso" onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

function SectionLoader() {
  return (
    <div className="section-loader">
      <LoaderCircle className="spin" size={22} />
      Carregando...
    </div>
  );
}

function scheduleLabel(database: DatabaseTarget) {
  const days = database.schedule.days
    .map((value) => DAYS.find((day) => day.value === value)?.short)
    .join(", ");
  return `${days} às ${database.schedule.time}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeDate(value: string | null) {
  if (!value) return "—";
  const difference = Date.now() - new Date(value).getTime();
  if (difference < 60_000) return "agora";
  if (difference < 3_600_000) return `há ${Math.floor(difference / 60_000)} min`;
  if (difference < 86_400_000)
    return `há ${Math.floor(difference / 3_600_000)} h`;
  return formatDate(value).split(" ")[0];
}
